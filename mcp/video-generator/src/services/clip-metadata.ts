/**
 * Clip Metadata Service
 *
 * Extracts and stores searchable metadata for video clips using:
 * - FFprobe for technical data
 * - Whisper for transcription
 * - FFmpeg for visual detection (scene changes, black/freeze frames)
 * - Claude for frame descriptions (via interactive workflow)
 *
 * All metadata is stored in a single clips.json file.
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import {
  PROJECT_ROOT,
  VIDEO_DIR,
  CLIP_METADATA_DIR,
  CLIPS_JSON_PATH,
  CLIP_METADATA_INDEX_PATH,
  TEMP_DIR,
  resolvePath,
  JOBS_PATH,
} from "../utils/paths.js";
import { analyzeClipUnified } from "./analysis.js";
import {
  callClaudeVision,
  loadImageAsBase64,
  parseClaudeJson,
  type RateLimitConfig,
} from "../clients/claude.js";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface TechnicalMetadata {
  duration: number;
  resolution: { width: number; height: number };
  aspect_ratio: string;
  framerate: number;
  codec_video: string;
  codec_audio: string | null;
  has_audio: boolean;
  file_size_bytes: number;
  created_at: string;
}

export interface AudioMetadata {
  transcription: {
    full_text: string;
    words: Array<{ word: string; start: number; end: number }>;
    word_count: number;
  } | null;
  silences: Array<{ start: number; end: number; duration: number }>;
  speech_segments: Array<{ start: number; end: number; text: string }>;
  has_speech: boolean;
  speech_coverage: number;
}

export interface VisualMetadata {
  scene_changes: Array<{ timestamp: number; confidence: number }>;
  black_frames: Array<{ start: number; end: number; duration: number }>;
  freeze_frames: Array<{ start: number; end: number; duration: number }>;
  total_scenes: number;
  has_discontinuities: boolean;
}

export interface FrameDescription {
  timestamp: number;
  description: string;
  context: "start" | "middle" | "end" | "pre_discontinuity" | "post_discontinuity";
}

export interface FramesMetadata {
  sampled_at: number[];
  descriptions: FrameDescription[];
  overall_summary: string;
}

export interface ProvenanceMetadata {
  job_id: string | null;
  project_id: string | null;
  shot_id: string | null;
  veo_prompt: string | null;
}

export interface ExtractionMetadata {
  version: string;
  extracted_at: string;
  extraction_duration_ms: number;
  errors: string[];
}

export interface ClipMetadata {
  clip_id: string;
  filename: string;
  path: string;
  technical: TechnicalMetadata;
  audio: AudioMetadata;
  visual: VisualMetadata;
  frames: FramesMetadata;
  provenance: ProvenanceMetadata;
  tags: string[];
  extraction: ExtractionMetadata;
}

export interface ClipsDatabase {
  version: string;
  updated_at: string;
  clips: Record<string, ClipMetadata>;
}

export interface ClipIndex {
  version: string;
  updated_at: string;
  total_clips: number;
  by_project: Record<string, string[]>;
  by_has_speech: { with: string[]; without: string[] };
  by_duration: { short: string[]; medium: string[]; long: string[] };
  keywords: Record<string, string[]>;
}

export interface PartialClipMetadata {
  clip_id: string;
  filename: string;
  path: string;
  technical: TechnicalMetadata;
  audio: AudioMetadata;
  visual: VisualMetadata;
  provenance: ProvenanceMetadata;
  extraction: { version: string; extracted_at: string; errors: string[] };
  frame_paths: string[];
  frame_contexts: Array<{ timestamp: number; context: FrameDescription["context"] }>;
}

// ============================================================================
// Constants
// ============================================================================

const SCHEMA_VERSION = "1.0.0";
const MAX_FRAMES = 10;

// ============================================================================
// Database Functions
// ============================================================================

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadClipsDatabase(): ClipsDatabase {
  if (!fs.existsSync(CLIPS_JSON_PATH)) {
    return {
      version: SCHEMA_VERSION,
      updated_at: new Date().toISOString(),
      clips: {},
    };
  }
  return JSON.parse(fs.readFileSync(CLIPS_JSON_PATH, "utf-8"));
}

function saveClipsDatabase(db: ClipsDatabase): void {
  ensureDir(CLIP_METADATA_DIR);
  db.updated_at = new Date().toISOString();
  fs.writeFileSync(CLIPS_JSON_PATH, JSON.stringify(db, null, 2));
}

function getClipId(filename: string): string {
  return path.basename(filename, path.extname(filename));
}

// ============================================================================
// FFprobe Technical Extraction
// ============================================================================

async function extractTechnicalMetadata(videoPath: string): Promise<TechnicalMetadata> {
  const resolvedPath = resolvePath(videoPath);

  // Get file stats
  const stats = fs.statSync(resolvedPath);

  // Get ffprobe JSON output
  const { stdout } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format -show_streams "${resolvedPath}"`
  );

  const probe = JSON.parse(stdout);
  const videoStream = probe.streams?.find((s: { codec_type: string }) => s.codec_type === "video");
  const audioStream = probe.streams?.find((s: { codec_type: string }) => s.codec_type === "audio");
  const format = probe.format || {};

  const width = videoStream?.width || 0;
  const height = videoStream?.height || 0;
  const duration = parseFloat(format.duration || "0");

  // Determine aspect ratio
  let aspectRatio = "unknown";
  if (width && height) {
    const ratio = width / height;
    if (Math.abs(ratio - 16 / 9) < 0.1) aspectRatio = "16:9";
    else if (Math.abs(ratio - 9 / 16) < 0.1) aspectRatio = "9:16";
    else if (Math.abs(ratio - 1) < 0.1) aspectRatio = "1:1";
    else aspectRatio = `${width}:${height}`;
  }

  // Parse framerate
  let framerate = 0;
  if (videoStream?.r_frame_rate) {
    const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
    framerate = den ? Math.round((num / den) * 100) / 100 : num;
  }

  return {
    duration,
    resolution: { width, height },
    aspect_ratio: aspectRatio,
    framerate,
    codec_video: videoStream?.codec_name || "unknown",
    codec_audio: audioStream?.codec_name || null,
    has_audio: !!audioStream,
    file_size_bytes: stats.size,
    created_at: stats.mtime.toISOString(),
  };
}

// ============================================================================
// Frame Extraction
// ============================================================================

function calculateFrameTimestamps(
  duration: number,
  sceneChanges: Array<{ timestamp: number }>,
  blackFrames: Array<{ start: number; end: number }>
): Array<{ timestamp: number; context: FrameDescription["context"] }> {
  const frames: Array<{ timestamp: number; context: FrameDescription["context"] }> = [];
  const BUFFER = 0.1;

  // Always include start, middle, end
  frames.push({ timestamp: Math.min(BUFFER, duration * 0.05), context: "start" });
  frames.push({ timestamp: duration / 2, context: "middle" });
  frames.push({ timestamp: Math.max(duration - BUFFER, duration * 0.95), context: "end" });

  // Add frames around scene changes
  for (const scene of sceneChanges) {
    if (scene.timestamp > BUFFER && scene.timestamp < duration - BUFFER) {
      frames.push({ timestamp: scene.timestamp - BUFFER, context: "pre_discontinuity" });
      frames.push({ timestamp: scene.timestamp + BUFFER, context: "post_discontinuity" });
    }
  }

  // Add frames around black frames
  for (const black of blackFrames) {
    if (black.start > BUFFER) {
      frames.push({ timestamp: black.start - BUFFER, context: "pre_discontinuity" });
    }
    if (black.end < duration - BUFFER) {
      frames.push({ timestamp: black.end + BUFFER, context: "post_discontinuity" });
    }
  }

  // Deduplicate and sort (remove frames too close together)
  const sorted = frames.sort((a, b) => a.timestamp - b.timestamp);
  const deduped: typeof frames = [];
  for (const frame of sorted) {
    const lastFrame = deduped[deduped.length - 1];
    if (!lastFrame || Math.abs(frame.timestamp - lastFrame.timestamp) > 0.2) {
      deduped.push(frame);
    }
  }

  // Cap at MAX_FRAMES
  if (deduped.length > MAX_FRAMES) {
    const essential = deduped.filter(
      (f) => f.context === "start" || f.context === "middle" || f.context === "end"
    );
    const discontinuities = deduped.filter(
      (f) => f.context === "pre_discontinuity" || f.context === "post_discontinuity"
    );
    const remaining = MAX_FRAMES - essential.length;
    const step = Math.ceil(discontinuities.length / remaining);
    const selected = discontinuities.filter((_, i) => i % step === 0).slice(0, remaining);
    return [...essential, ...selected].sort((a, b) => a.timestamp - b.timestamp);
  }

  return deduped;
}

async function extractFrames(
  videoPath: string,
  timestamps: Array<{ timestamp: number; context: FrameDescription["context"] }>,
  clipId: string
): Promise<string[]> {
  const resolvedPath = resolvePath(videoPath);
  const framesDir = path.join(TEMP_DIR, `frames_${clipId}`);
  ensureDir(framesDir);

  const framePaths: string[] = [];

  for (const { timestamp, context } of timestamps) {
    const frameName = `frame_${timestamp.toFixed(2)}s_${context}.png`;
    const framePath = path.join(framesDir, frameName);

    try {
      await execAsync(
        `ffmpeg -y -ss ${timestamp} -i "${resolvedPath}" -frames:v 1 -q:v 2 "${framePath}"`
      );
      framePaths.push(framePath);
    } catch (error) {
      console.error(`Failed to extract frame at ${timestamp}s: ${error}`);
    }
  }

  return framePaths;
}

// ============================================================================
// Provenance Resolution
// ============================================================================

interface JobRecord {
  id: string;
  result?: { path?: string; filename?: string };
  input?: { prompt?: string };
}

function loadJobs(): JobRecord[] {
  if (!fs.existsSync(JOBS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(JOBS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function resolveProvenance(clipId: string, filename: string): ProvenanceMetadata {
  const jobs = loadJobs();

  const matchingJob = jobs.find(
    (j) => j.result?.path?.includes(filename) || j.result?.filename === filename
  );

  if (matchingJob) {
    return {
      job_id: matchingJob.id,
      project_id: null,
      shot_id: null,
      veo_prompt: matchingJob.input?.prompt || null,
    };
  }

  // Parse project info from filename pattern: {project}_shot_{number}_{timestamp}
  const shotMatch = filename.match(/^(.+)_shot_(\d+)_(\d+)$/);
  if (shotMatch) {
    return {
      job_id: null,
      project_id: shotMatch[1],
      shot_id: `shot_${shotMatch[2]}`,
      veo_prompt: null,
    };
  }

  // Parse simpler patterns: {project}_{variant}
  const simpleMatch = filename.match(/^([a-z_]+)_([a-z0-9_]+)$/i);
  if (simpleMatch && !filename.startsWith("veo_")) {
    return {
      job_id: null,
      project_id: simpleMatch[1],
      shot_id: null,
      veo_prompt: null,
    };
  }

  return { job_id: null, project_id: null, shot_id: null, veo_prompt: null };
}

// ============================================================================
// Tag Generation
// ============================================================================

function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "to", "of", "in",
    "for", "on", "with", "at", "by", "from", "as", "into", "through",
    "during", "before", "after", "above", "below", "between", "under",
    "again", "further", "then", "once", "here", "there", "when", "where",
    "why", "how", "all", "each", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same", "so", "than",
    "too", "very", "just", "and", "but", "if", "or", "because", "until",
    "while", "this", "that", "these", "those", "it", "its",
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));
}

interface TagGenerationInput {
  audio?: AudioMetadata;
  frames?: FramesMetadata;
  provenance?: ProvenanceMetadata;
  technical?: TechnicalMetadata;
  visual?: VisualMetadata;
}

function generateTags(metadata: TagGenerationInput): string[] {
  const tags = new Set<string>();

  if (metadata.audio?.transcription?.full_text) {
    const words = extractKeywords(metadata.audio.transcription.full_text);
    words.slice(0, 20).forEach((w) => tags.add(w));
  }

  if (metadata.frames?.descriptions) {
    for (const desc of metadata.frames.descriptions) {
      const words = extractKeywords(desc.description);
      words.slice(0, 10).forEach((w) => tags.add(w));
    }
  }

  if (metadata.frames?.overall_summary) {
    const words = extractKeywords(metadata.frames.overall_summary);
    words.slice(0, 10).forEach((w) => tags.add(w));
  }

  if (metadata.provenance?.project_id) {
    const projectWords = metadata.provenance.project_id.split("_");
    projectWords.forEach((w) => {
      if (w.length > 2) tags.add(w.toLowerCase());
    });
  }

  if (metadata.technical?.duration) {
    if (metadata.technical.duration < 4) tags.add("short");
    else if (metadata.technical.duration <= 8) tags.add("medium");
    else tags.add("long");
  }

  if (metadata.audio?.has_speech !== undefined) {
    tags.add(metadata.audio.has_speech ? "speech" : "silent");
  }

  if (metadata.visual?.has_discontinuities) {
    tags.add("multi-scene");
  }

  return Array.from(tags).sort();
}

// ============================================================================
// Main Extraction Function
// ============================================================================

export async function extractClipMetadata(
  videoPath: string,
  options: {
    includeTranscription?: boolean;
    skipExisting?: boolean;
  } = {}
): Promise<{
  partial: PartialClipMetadata;
  frame_paths: string[];
  metadata_exists: boolean;
}> {
  const { includeTranscription = true, skipExisting = true } = options;
  const errors: string[] = [];

  const resolvedPath = resolvePath(videoPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const filename = path.basename(videoPath);
  const clipId = getClipId(filename);

  // Check if metadata already exists in database
  if (skipExisting) {
    const db = loadClipsDatabase();
    if (db.clips[clipId]) {
      const existing = db.clips[clipId];
      return {
        partial: {
          clip_id: existing.clip_id,
          filename: existing.filename,
          path: existing.path,
          technical: existing.technical,
          audio: existing.audio,
          visual: existing.visual,
          provenance: existing.provenance,
          extraction: {
            version: existing.extraction.version,
            extracted_at: existing.extraction.extracted_at,
            errors: existing.extraction.errors,
          },
          frame_paths: [],
          frame_contexts: existing.frames.descriptions.map((d) => ({
            timestamp: d.timestamp,
            context: d.context,
          })),
        },
        frame_paths: [],
        metadata_exists: true,
      };
    }
  }

  // Extract technical metadata
  let technical: TechnicalMetadata;
  try {
    technical = await extractTechnicalMetadata(videoPath);
  } catch (error) {
    throw new Error(`Failed to extract technical metadata: ${error}`);
  }

  // Run unified analysis (gets audio + visual detection)
  let audio: AudioMetadata;
  let visual: VisualMetadata;

  try {
    const analysis = await analyzeClipUnified(videoPath, {
      skipTranscription: !includeTranscription,
    });

    audio = {
      transcription: analysis.audio.whisper
        ? {
            full_text: analysis.audio.whisper.text,
            words: analysis.audio.whisper.words,
            word_count: analysis.audio.whisper.words.length,
          }
        : null,
      silences: analysis.audio.silences,
      speech_segments: analysis.audio.speech_segments.map((s) => ({
        start: s.start,
        end: s.end,
        text: s.words,
      })),
      has_speech: (analysis.audio.whisper?.words.length || 0) > 0,
      speech_coverage: analysis.audio.summary.speech_coverage,
    };

    visual = {
      scene_changes: analysis.scenes.changes,
      black_frames: analysis.visual_detection.black_frames,
      freeze_frames: analysis.visual_detection.freeze_frames,
      total_scenes: analysis.scenes.summary.total_changes + 1,
      has_discontinuities:
        analysis.scenes.changes.length > 0 || analysis.visual_detection.black_frames.length > 0,
    };
  } catch (error) {
    errors.push(`Analysis error: ${error}`);
    audio = {
      transcription: null,
      silences: [],
      speech_segments: [],
      has_speech: false,
      speech_coverage: 0,
    };
    visual = {
      scene_changes: [],
      black_frames: [],
      freeze_frames: [],
      total_scenes: 1,
      has_discontinuities: false,
    };
  }

  // Calculate frame timestamps based on analysis
  const frameTimestamps = calculateFrameTimestamps(
    technical.duration,
    visual.scene_changes,
    visual.black_frames
  );

  // Extract frames
  let framePaths: string[] = [];
  try {
    framePaths = await extractFrames(videoPath, frameTimestamps, clipId);
  } catch (error) {
    errors.push(`Frame extraction error: ${error}`);
  }

  // Resolve provenance
  const provenance = resolveProvenance(clipId, filename);

  // Calculate relative path from project root
  const relativePath = path.relative(PROJECT_ROOT, resolvedPath);

  const partial: PartialClipMetadata = {
    clip_id: clipId,
    filename,
    path: relativePath,
    technical,
    audio,
    visual,
    provenance,
    extraction: {
      version: SCHEMA_VERSION,
      extracted_at: new Date().toISOString(),
      errors,
    },
    frame_paths: framePaths,
    frame_contexts: frameTimestamps,
  };

  return {
    partial,
    frame_paths: framePaths,
    metadata_exists: false,
  };
}

// ============================================================================
// Complete Metadata (with frame descriptions)
// ============================================================================

export async function completeClipMetadata(
  clipId: string,
  descriptions: FrameDescription[],
  overallSummary: string
): Promise<ClipMetadata> {
  // Load partial from temp
  const tempPath = path.join(TEMP_DIR, `partial_${clipId}.json`);
  if (!fs.existsSync(tempPath)) {
    throw new Error(`No pending extraction found for clip: ${clipId}`);
  }

  const partial: PartialClipMetadata = JSON.parse(fs.readFileSync(tempPath, "utf-8"));

  const frames: FramesMetadata = {
    sampled_at: descriptions.map((d) => d.timestamp),
    descriptions,
    overall_summary: overallSummary,
  };

  const metadata: ClipMetadata = {
    clip_id: partial.clip_id,
    filename: partial.filename,
    path: partial.path,
    technical: partial.technical,
    audio: partial.audio,
    visual: partial.visual,
    frames,
    provenance: partial.provenance,
    tags: generateTags({ ...partial, frames }),
    extraction: {
      ...partial.extraction,
      extraction_duration_ms: Date.now() - new Date(partial.extraction.extracted_at).getTime(),
    },
  };

  // Save to database
  const db = loadClipsDatabase();
  db.clips[clipId] = metadata;
  saveClipsDatabase(db);

  // Clean up temp files
  fs.unlinkSync(tempPath);
  const framesDir = path.join(TEMP_DIR, `frames_${clipId}`);
  if (fs.existsSync(framesDir)) {
    fs.rmSync(framesDir, { recursive: true });
  }

  return metadata;
}

// ============================================================================
// Save Partial for Later Completion
// ============================================================================

export function savePartialMetadata(partial: PartialClipMetadata): void {
  ensureDir(TEMP_DIR);
  const tempPath = path.join(TEMP_DIR, `partial_${partial.clip_id}.json`);
  fs.writeFileSync(tempPath, JSON.stringify(partial, null, 2));
}

// ============================================================================
// Load Existing Metadata
// ============================================================================

export function loadClipMetadata(clipId: string): ClipMetadata | null {
  const db = loadClipsDatabase();
  return db.clips[clipId] || null;
}

// ============================================================================
// List All Clips with Metadata
// ============================================================================

export function listClipsWithMetadata(): string[] {
  const db = loadClipsDatabase();
  return Object.keys(db.clips);
}

// ============================================================================
// Index Management
// ============================================================================

export function rebuildClipIndex(): ClipIndex {
  const db = loadClipsDatabase();
  const clipIds = Object.keys(db.clips);

  const index: ClipIndex = {
    version: SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
    total_clips: clipIds.length,
    by_project: {},
    by_has_speech: { with: [], without: [] },
    by_duration: { short: [], medium: [], long: [] },
    keywords: {},
  };

  for (const clipId of clipIds) {
    const metadata = db.clips[clipId];

    if (metadata.provenance.project_id) {
      if (!index.by_project[metadata.provenance.project_id]) {
        index.by_project[metadata.provenance.project_id] = [];
      }
      index.by_project[metadata.provenance.project_id].push(clipId);
    }

    if (metadata.audio.has_speech) {
      index.by_has_speech.with.push(clipId);
    } else {
      index.by_has_speech.without.push(clipId);
    }

    if (metadata.technical.duration < 4) {
      index.by_duration.short.push(clipId);
    } else if (metadata.technical.duration <= 8) {
      index.by_duration.medium.push(clipId);
    } else {
      index.by_duration.long.push(clipId);
    }

    for (const tag of metadata.tags) {
      if (!index.keywords[tag]) {
        index.keywords[tag] = [];
      }
      index.keywords[tag].push(clipId);
    }
  }

  ensureDir(CLIP_METADATA_DIR);
  fs.writeFileSync(CLIP_METADATA_INDEX_PATH, JSON.stringify(index, null, 2));

  return index;
}

export function loadClipIndex(): ClipIndex | null {
  if (!fs.existsSync(CLIP_METADATA_INDEX_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(CLIP_METADATA_INDEX_PATH, "utf-8"));
}

// ============================================================================
// Search
// ============================================================================

export interface SearchOptions {
  query?: string;
  has_speech?: boolean;
  min_duration?: number;
  max_duration?: number;
  project_id?: string;
  tags?: string[];
  aspect_ratio?: "16:9" | "9:16" | "1:1";
  limit?: number;
}

export interface SearchResult {
  clip_id: string;
  path: string;
  relevance_score: number;
  snippet: string;
}

export function searchClips(options: SearchOptions): {
  results: SearchResult[];
  total_matches: number;
} {
  const { query, has_speech, min_duration, max_duration, project_id, tags, aspect_ratio, limit = 20 } = options;

  const db = loadClipsDatabase();
  const index = loadClipIndex();
  let candidateIds: Set<string>;

  if (project_id && index?.by_project[project_id]) {
    candidateIds = new Set(index.by_project[project_id]);
  } else if (has_speech !== undefined && index) {
    candidateIds = new Set(has_speech ? index.by_has_speech.with : index.by_has_speech.without);
  } else {
    candidateIds = new Set(Object.keys(db.clips));
  }

  if (tags && tags.length > 0 && index) {
    const tagMatches = new Set<string>();
    for (const tag of tags) {
      const clips = index.keywords[tag.toLowerCase()] || [];
      clips.forEach((c) => tagMatches.add(c));
    }
    candidateIds = new Set([...candidateIds].filter((c) => tagMatches.has(c)));
  }

  const results: SearchResult[] = [];

  for (const clipId of candidateIds) {
    const metadata = db.clips[clipId];
    if (!metadata) continue;

    if (min_duration !== undefined && metadata.technical.duration < min_duration) continue;
    if (max_duration !== undefined && metadata.technical.duration > max_duration) continue;
    if (has_speech !== undefined && metadata.audio.has_speech !== has_speech) continue;
    if (project_id && metadata.provenance.project_id !== project_id) continue;
    if (aspect_ratio && metadata.technical.aspect_ratio !== aspect_ratio) continue;

    let score = 0.5;
    let snippet = "";

    if (query) {
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/);

      if (metadata.audio.transcription?.full_text) {
        const text = metadata.audio.transcription.full_text.toLowerCase();
        const matches = queryWords.filter((w) => text.includes(w)).length;
        if (matches > 0) {
          score += 0.3 * (matches / queryWords.length);
          snippet = metadata.audio.transcription.full_text.slice(0, 100);
        }
      }

      for (const desc of metadata.frames.descriptions) {
        const text = desc.description.toLowerCase();
        const matches = queryWords.filter((w) => text.includes(w)).length;
        if (matches > 0) {
          score += 0.2 * (matches / queryWords.length);
          if (!snippet) snippet = desc.description.slice(0, 100);
        }
      }

      if (metadata.frames.overall_summary) {
        const text = metadata.frames.overall_summary.toLowerCase();
        const matches = queryWords.filter((w) => text.includes(w)).length;
        if (matches > 0) {
          score += 0.2 * (matches / queryWords.length);
          if (!snippet) snippet = metadata.frames.overall_summary.slice(0, 100);
        }
      }

      if (score <= 0.5) continue;
    }

    if (!snippet) {
      snippet =
        metadata.frames.overall_summary ||
        metadata.audio.transcription?.full_text?.slice(0, 100) ||
        metadata.frames.descriptions[0]?.description?.slice(0, 100) ||
        `${metadata.technical.duration.toFixed(1)}s ${metadata.technical.aspect_ratio} clip`;
    }

    results.push({
      clip_id: clipId,
      path: metadata.path,
      relevance_score: Math.round(score * 100) / 100,
      snippet,
    });
  }

  results.sort((a, b) => b.relevance_score - a.relevance_score);

  return {
    results: results.slice(0, limit),
    total_matches: results.length,
  };
}

// ============================================================================
// Batch Processing
// ============================================================================

export async function batchExtractMetadata(options: {
  directory?: string;
  pattern?: string;
  limit?: number;
  skipExisting?: boolean;
}): Promise<{
  clips: Array<{ clip_id: string; frame_paths: string[]; skipped: boolean; error?: string }>;
  processed: number;
  skipped: number;
  failed: number;
}> {
  const { directory = VIDEO_DIR, pattern = "*.mp4", limit, skipExisting = true } = options;

  const resolvedDir = resolvePath(directory);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory not found: ${directory}`);
  }

  let files = fs
    .readdirSync(resolvedDir)
    .filter((f) => {
      if (pattern === "*.mp4") return f.endsWith(".mp4");
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      return regex.test(f);
    })
    .map((f) => path.join(resolvedDir, f));

  if (limit) {
    files = files.slice(0, limit);
  }

  const results: Array<{
    clip_id: string;
    frame_paths: string[];
    skipped: boolean;
    error?: string;
  }> = [];
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const clipId = getClipId(path.basename(file));

    try {
      const result = await extractClipMetadata(file, {
        includeTranscription: true,
        skipExisting,
      });

      if (result.metadata_exists) {
        skipped++;
        results.push({ clip_id: clipId, frame_paths: [], skipped: true });
      } else {
        savePartialMetadata(result.partial);
        processed++;
        results.push({ clip_id: clipId, frame_paths: result.frame_paths, skipped: false });
      }
    } catch (error) {
      failed++;
      results.push({
        clip_id: clipId,
        frame_paths: [],
        skipped: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { clips: results, processed, skipped, failed };
}

// ============================================================================
// Auto Frame Description via Claude Vision
// ============================================================================

export interface DescribeFramesResult {
  clipId: string;
  descriptions: FrameDescription[];
  overallSummary: string;
  tokensUsed: { input: number; output: number };
}

export interface DescribeFramesOptions {
  model?: string;
  rateLimitConfig?: Partial<RateLimitConfig>;
}

/**
 * Generate frame descriptions for a clip using Claude Vision API
 *
 * Loads partial metadata and frame images, sends to Claude Opus 4.5,
 * and returns structured descriptions.
 */
export async function describeClipFrames(
  clipId: string,
  options: DescribeFramesOptions = {}
): Promise<DescribeFramesResult> {
  const { model = "claude-opus-4-5-20251101", rateLimitConfig } = options;

  // Load partial metadata
  const tempPath = path.join(TEMP_DIR, `partial_${clipId}.json`);
  if (!fs.existsSync(tempPath)) {
    throw new Error(`No pending extraction found for clip: ${clipId}`);
  }

  const partial: PartialClipMetadata = JSON.parse(fs.readFileSync(tempPath, "utf-8"));

  // Validate frame paths exist
  const validFrames = partial.frame_paths.filter((fp) => fs.existsSync(fp));
  if (validFrames.length === 0) {
    throw new Error(`No frame files found for clip: ${clipId}. Expected frames at: ${partial.frame_paths[0]}`);
  }

  // Build content blocks: all images + prompt
  const imageContents = validFrames.map((fp) => loadImageAsBase64(fp));

  // Build frame context reference
  const frameContextList = partial.frame_contexts
    .map((fc, i) => `Frame ${i + 1}: timestamp=${fc.timestamp.toFixed(2)}s, context="${fc.context}"`)
    .join("\n");

  // Build structured prompt with clip context
  const promptText = `Analyze the ${validFrames.length} video frames shown above.

Clip info:
- Duration: ${partial.technical.duration.toFixed(2)}s
- Resolution: ${partial.technical.resolution.width}x${partial.technical.resolution.height}
- Aspect ratio: ${partial.technical.aspect_ratio}
- Has speech: ${partial.audio.has_speech}
${partial.audio.transcription?.full_text ? `- Transcription: "${partial.audio.transcription.full_text.slice(0, 500)}"` : ""}
${partial.visual.scene_changes.length > 0 ? `- Scene changes at: ${partial.visual.scene_changes.map((s) => s.timestamp.toFixed(2) + "s").join(", ")}` : ""}
${partial.visual.black_frames.length > 0 ? `- Black frames detected: ${partial.visual.black_frames.length}` : ""}

Frame positions:
${frameContextList}

Provide a JSON response with:
1. A description for each frame (50-100 words each) covering:
   - Subject appearance, position, and actions
   - Environment/setting details
   - Lighting, colors, composition
   - Camera angle and framing
   - Motion or action implied

2. An overall summary of the entire clip (2-3 sentences)

Response format:
{
  "descriptions": [
    { "timestamp": <number>, "description": "<50-100 words>", "context": "<start|middle|end|pre_discontinuity|post_discontinuity>" }
  ],
  "overall_summary": "<2-3 sentences>"
}`;

  const systemPrompt = `You are a video clip analyst. Describe video frames with precise, objective visual details.
Focus on what is actually visible in each frame. Be specific about colors, positions, subjects, and actions.
Respond ONLY with valid JSON matching the requested schema. No markdown, no explanation outside the JSON.`;

  const messages = [
    {
      role: "user" as const,
      content: [
        ...imageContents,
        { type: "text" as const, text: promptText },
      ],
    },
  ];

  const response = await callClaudeVision({
    system: systemPrompt,
    messages,
    model,
    maxTokens: 4096,
    temperature: 0.3,
    rateLimitConfig,
  });

  // Parse the JSON response
  const result = parseClaudeJson<{
    descriptions: Array<{ timestamp: number; description: string; context: string }>;
    overall_summary: string;
  }>(response.text);

  // Validate and normalize descriptions
  const descriptions: FrameDescription[] = result.descriptions.map((d, i) => ({
    timestamp: d.timestamp ?? partial.frame_contexts[i]?.timestamp ?? 0,
    description: d.description,
    context: (d.context as FrameDescription["context"]) || partial.frame_contexts[i]?.context || "middle",
  }));

  return {
    clipId,
    descriptions,
    overallSummary: result.overall_summary,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}

/**
 * List all pending clips that need frame descriptions
 */
export function listPendingClips(): Array<{
  clipId: string;
  frameCount: number;
  projectId: string | null;
}> {
  if (!fs.existsSync(TEMP_DIR)) return [];

  const partialFiles = fs.readdirSync(TEMP_DIR).filter(
    (f) => f.startsWith("partial_") && f.endsWith(".json")
  );

  return partialFiles.map((f) => {
    const clipId = f.replace("partial_", "").replace(".json", "");
    try {
      const partial: PartialClipMetadata = JSON.parse(
        fs.readFileSync(path.join(TEMP_DIR, f), "utf-8")
      );
      return {
        clipId,
        frameCount: partial.frame_paths.length,
        projectId: partial.provenance.project_id,
      };
    } catch {
      return { clipId, frameCount: 0, projectId: null };
    }
  });
}
