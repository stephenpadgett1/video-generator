import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { EDITS_DIR, VIDEO_DIR, JOBS_PATH, resolvePath } from "../utils/paths.js";
import { loadJobs, type Job } from "./jobs.js";

const execAsync = promisify(exec);

export interface EditManifest {
  job_id: string;
  source: {
    path: string;
    duration: number;
  };
  context: {
    project_id: string | null;
    shot_id: string | null;
    take_index: number | null;
    expected_dialogue: string | null;
  };
  analysis: Record<string, unknown> | null;
  variations: EditVariation[];
  selected: string | null;
  status: "pending" | "in_progress" | "review" | "approved" | "archived";
  created_at: string;
  selected_at?: string;
}

export interface EditVariation {
  id: string;
  filename: string;
  edits: {
    trim_start?: number;
    trim_end?: number;
    speed?: number;
    precise?: boolean;
  };
  base_variation?: string | null;
  duration: number;
  created_at: string;
  created_by: string;
  notes: string;
}

/**
 * Get edit directory for a job
 */
export function getEditDir(jobId: string): string {
  return path.join(EDITS_DIR, jobId);
}

/**
 * Get manifest path for a job
 */
function getManifestPath(jobId: string): string {
  return path.join(getEditDir(jobId), "manifest.json");
}

/**
 * Load manifest for a job
 */
export function loadManifest(jobId: string): EditManifest | null {
  const manifestPath = getManifestPath(jobId);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
}

/**
 * Save manifest for a job
 */
function saveManifest(jobId: string, manifest: EditManifest): void {
  const manifestPath = getManifestPath(jobId);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Get video path for a job from jobs.json
 */
function getVideoPathForJob(jobId: string): string | null {
  const jobs = loadJobs();
  const job = jobs.find((j: Job) => j.id === jobId);
  if (!job?.result?.path) {
    return null;
  }

  // Resolve path (could be relative like /video/... or absolute)
  let videoPath = job.result.path;
  if (videoPath.startsWith("/video/")) {
    videoPath = path.join(VIDEO_DIR, videoPath.replace("/video/", ""));
  } else if (!path.isAbsolute(videoPath)) {
    videoPath = resolvePath(videoPath);
  }

  return videoPath;
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
  );
  return parseFloat(stdout.trim());
}

/**
 * Format variation ID (v001, v002, etc.)
 */
function formatVariationId(num: number): string {
  return `v${String(num).padStart(3, "0")}`;
}

/**
 * Start an edit session for a job
 */
export async function startEdit(options: {
  job_id: string;
  project_id?: string;
  shot_id?: string;
  take_index?: number;
  expected_dialogue?: string;
}): Promise<{ editDir: string; manifest: EditManifest }> {
  const { job_id, project_id, shot_id, take_index, expected_dialogue } = options;

  const editDir = getEditDir(job_id);
  const manifestPath = getManifestPath(job_id);

  // Check if already exists
  if (fs.existsSync(manifestPath)) {
    const manifest = loadManifest(job_id)!;
    return { editDir, manifest };
  }

  // Get source video
  const sourcePath = getVideoPathForJob(job_id);
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Video not found for job ${job_id}`);
  }

  // Create edit directory
  if (!fs.existsSync(editDir)) {
    fs.mkdirSync(editDir, { recursive: true });
  }

  // Copy source
  const sourceInEdit = path.join(editDir, "source.mp4");
  fs.copyFileSync(sourcePath, sourceInEdit);

  // Get duration
  const duration = await getVideoDuration(sourcePath);

  // Create manifest
  const manifest: EditManifest = {
    job_id,
    source: {
      path: path.relative(editDir, sourcePath),
      duration,
    },
    context: {
      project_id: project_id || null,
      shot_id: shot_id || null,
      take_index: take_index !== undefined ? take_index : null,
      expected_dialogue: expected_dialogue || null,
    },
    analysis: null,
    variations: [],
    selected: null,
    status: "pending",
    created_at: new Date().toISOString(),
  };

  saveManifest(job_id, manifest);

  return { editDir, manifest };
}

/**
 * Create a trim variation
 */
export async function createTrimVariation(options: {
  job_id: string;
  trim_start?: number;
  trim_end?: number;
  notes?: string;
  precise?: boolean;
}): Promise<EditVariation> {
  const { job_id, trim_start = 0, trim_end, notes, precise = false } = options;

  const manifest = loadManifest(job_id);
  if (!manifest) {
    throw new Error(`No edit folder for job ${job_id}. Call edit_start first.`);
  }

  const editDir = getEditDir(job_id);
  const sourceFile = path.join(editDir, "source.mp4");

  const start = trim_start;
  const end = trim_end || manifest.source.duration;
  const duration = end - start;

  // Generate variation ID
  const num = manifest.variations.length + 1;
  const varId = formatVariationId(num);
  const filename = `${varId}_trim.mp4`;
  const outputPath = path.join(editDir, filename);

  // FFmpeg command
  let cmd: string;
  if (precise) {
    cmd = `ffmpeg -y -ss ${start} -i "${sourceFile}" -t ${duration} -c:v libx264 -preset fast -crf 23 -c:a aac "${outputPath}"`;
  } else {
    cmd = `ffmpeg -y -ss ${start} -i "${sourceFile}" -t ${duration} -c copy -avoid_negative_ts make_zero -reset_timestamps 1 "${outputPath}"`;
  }

  await execAsync(cmd);

  // Get actual duration
  const actualDuration = await getVideoDuration(outputPath);

  // Create variation
  const variation: EditVariation = {
    id: varId,
    filename,
    edits: {
      trim_start: start,
      trim_end: end,
      precise,
    },
    duration: actualDuration,
    created_at: new Date().toISOString(),
    created_by: "api",
    notes: notes || `Trim ${start.toFixed(2)}s - ${end.toFixed(2)}s`,
  };

  manifest.variations.push(variation);
  manifest.status = "in_progress";
  saveManifest(job_id, manifest);

  return variation;
}

/**
 * Create a speed variation
 */
export async function createSpeedVariation(options: {
  job_id: string;
  base_variation?: string;
  speed: number;
  notes?: string;
}): Promise<EditVariation> {
  const { job_id, base_variation, speed, notes } = options;

  if (speed <= 0) {
    throw new Error("speed must be a positive number");
  }

  const manifest = loadManifest(job_id);
  if (!manifest) {
    throw new Error(`No edit folder for job ${job_id}. Call edit_start first.`);
  }

  const editDir = getEditDir(job_id);

  // Determine input file and base edits
  let inputFile: string;
  let baseEdits: Record<string, unknown> = {};

  if (base_variation) {
    const baseVar = manifest.variations.find((v) => v.id === base_variation);
    if (!baseVar) {
      throw new Error(`Base variation ${base_variation} not found`);
    }
    inputFile = path.join(editDir, baseVar.filename);
    baseEdits = { ...baseVar.edits };
  } else {
    inputFile = path.join(editDir, "source.mp4");
  }

  if (!fs.existsSync(inputFile)) {
    throw new Error("Input file not found");
  }

  // Generate variation ID and filename
  const num = manifest.variations.length + 1;
  const varId = formatVariationId(num);
  const speedLabel = speed.toFixed(1).replace(".", "");
  const suffix = base_variation ? `${base_variation.replace("v", "")}_speed${speedLabel}` : `speed${speedLabel}`;
  const filename = `${varId}_${suffix}.mp4`;
  const outputPath = path.join(editDir, filename);

  // Build atempo filter chain (atempo only supports 0.5-2.0)
  const atempoChain: string[] = [];
  let remaining = speed;

  while (remaining > 2.0) {
    atempoChain.push("atempo=2.0");
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    atempoChain.push("atempo=0.5");
    remaining /= 0.5;
  }
  atempoChain.push(`atempo=${remaining}`);

  const atempoFilter = atempoChain.join(",");

  // FFmpeg command
  const cmd = `ffmpeg -y -i "${inputFile}" -filter:v "setpts=${1 / speed}*PTS" -filter:a "${atempoFilter}" "${outputPath}"`;
  await execAsync(cmd);

  // Get actual duration
  const actualDuration = await getVideoDuration(outputPath);

  // Create variation
  const variation: EditVariation = {
    id: varId,
    filename,
    edits: {
      ...baseEdits,
      speed,
    },
    base_variation: base_variation || null,
    duration: actualDuration,
    created_at: new Date().toISOString(),
    created_by: "api",
    notes: notes || `Speed ${speed}x${base_variation ? ` on ${base_variation}` : ""}`,
  };

  manifest.variations.push(variation);
  manifest.status = "in_progress";
  saveManifest(job_id, manifest);

  return variation;
}

/**
 * Select a variation for assembly
 */
export function selectVariation(jobId: string, variationId: string): EditManifest {
  const manifest = loadManifest(jobId);
  if (!manifest) {
    throw new Error(`No edit folder for job ${jobId}`);
  }

  const variation = manifest.variations.find((v) => v.id === variationId);
  if (!variation) {
    throw new Error(`Variation ${variationId} not found`);
  }

  manifest.selected = variationId;
  manifest.status = "approved";
  manifest.selected_at = new Date().toISOString();
  saveManifest(jobId, manifest);

  return manifest;
}

/**
 * Store analysis results
 */
export function storeAnalysis(jobId: string, analysis: Record<string, unknown>): EditManifest {
  const manifest = loadManifest(jobId);
  if (!manifest) {
    throw new Error(`No edit folder for job ${jobId}. Call edit_start first.`);
  }

  manifest.analysis = {
    ...analysis,
    analyzed_at: new Date().toISOString(),
  };
  saveManifest(jobId, manifest);

  return manifest;
}

/**
 * List all edit folders
 */
export function listEdits(): Array<{
  job_id: string;
  status: string;
  variations_count: number;
  selected: string | null;
}> {
  if (!fs.existsSync(EDITS_DIR)) {
    return [];
  }

  const dirs = fs.readdirSync(EDITS_DIR);
  const edits: Array<{
    job_id: string;
    status: string;
    variations_count: number;
    selected: string | null;
  }> = [];

  for (const dir of dirs) {
    const manifestPath = path.join(EDITS_DIR, dir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as EditManifest;
        edits.push({
          job_id: manifest.job_id,
          status: manifest.status,
          variations_count: manifest.variations.length,
          selected: manifest.selected,
        });
      } catch {
        // Skip invalid manifests
      }
    }
  }

  return edits;
}

/**
 * Get the selected variation path for a job (used during assembly)
 */
export function getSelectedVariationPath(jobId: string, originalPath: string): string {
  const manifest = loadManifest(jobId);
  if (!manifest || !manifest.selected || manifest.status !== "approved") {
    return originalPath;
  }

  const variation = manifest.variations.find((v) => v.id === manifest.selected);
  if (!variation) {
    return originalPath;
  }

  const editedPath = path.join(getEditDir(jobId), variation.filename);
  if (fs.existsSync(editedPath)) {
    return editedPath;
  }

  return originalPath;
}
