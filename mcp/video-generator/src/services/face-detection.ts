/**
 * Face Detection Service
 *
 * Detects faces in video clip frames using Python face_recognition library.
 * Clusters faces into characters using DBSCAN.
 *
 * Workflow:
 * 1. detectFacesInFrames() - Extract face locations and embeddings from frame images
 * 2. clusterCharacters() - Group face embeddings into character clusters
 * 3. Results stored in clip metadata and characters.json
 */

import fs from "fs";
import path from "path";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import {
  PROJECT_ROOT,
  TEMP_DIR,
  CLIP_METADATA_DIR,
  CLIPS_JSON_PATH,
  FACE_DETECTION_SCRIPT,
  CHARACTER_CLUSTER_SCRIPT,
  CHARACTERS_JSON_PATH,
  CHARACTER_CENTROIDS_PATH,
  resolvePath,
} from "../utils/paths.js";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface FaceLocation {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FaceDetection {
  face_id: string;
  frame_timestamp: number;
  location: FaceLocation;
  embedding: number[];
  character_id: string | null;
}

export interface FacesMetadata {
  detected_at: string;
  faces: FaceDetection[];
  total_faces: number;
  unique_characters: string[];
}

export interface Character {
  // Auto-generated fields (from clustering)
  character_id: string;
  centroid?: number[];              // Now stored separately in character_centroids.json (lazy-loaded)
  face_ids: string[];
  clip_ids: string[];
  occurrence_count: number;
  representative_frame: string | null;
  metadata: {
    first_seen: string;
    last_clustered: string;
  };

  // User-annotated fields (optional)
  name?: string;                    // Human-readable name (e.g., "Sagittarius Archer")
  description?: string;             // Plain language description of appearance
  generation_prompt?: string;       // Prompt to generate similar character
  tags?: string[];                  // Searchable tags (e.g., ["archer", "fantasy", "female"])
  notes?: string;                   // Freeform notes
}

export interface CentroidsDatabase {
  version: string;
  description: string;
  centroids: Record<string, number[]>;
}

export interface CharacterDatabase {
  version: string;
  updated_at: string;
  characters: Record<string, Character>;
}

interface PythonFaceResult {
  frame_path: string;
  faces: Array<{
    location: FaceLocation;
    embedding: number[];
  }>;
  error: string | null;
}

interface PythonDetectionOutput {
  results: PythonFaceResult[];
  stats: {
    frames_processed: number;
    faces_detected: number;
    errors: number;
  };
}

interface PythonClusterOutput {
  characters: Array<{
    character_id: string;
    face_ids: string[];
    centroid: number[];
    occurrence_count: number;
  }>;
  unassigned: string[];
  stats: {
    total_faces: number;
    characters_found: number;
    faces_assigned: number;
    faces_unassigned: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadCharacterDatabase(): CharacterDatabase {
  if (!fs.existsSync(CHARACTERS_JSON_PATH)) {
    return {
      version: "1.0.0",
      updated_at: new Date().toISOString(),
      characters: {},
    };
  }
  return JSON.parse(fs.readFileSync(CHARACTERS_JSON_PATH, "utf-8"));
}

function saveCharacterDatabase(db: CharacterDatabase): void {
  ensureDir(CLIP_METADATA_DIR);
  db.updated_at = new Date().toISOString();
  fs.writeFileSync(CHARACTERS_JSON_PATH, JSON.stringify(db, null, 2));
}

/**
 * Load character centroids (embeddings) - lazy-loaded only when needed for face matching.
 */
function loadCentroidsDatabase(): CentroidsDatabase {
  if (!fs.existsSync(CHARACTER_CENTROIDS_PATH)) {
    return {
      version: "1.0.0",
      description: "Character face embedding centroids (128-dim vectors). Used for face matching.",
      centroids: {},
    };
  }
  return JSON.parse(fs.readFileSync(CHARACTER_CENTROIDS_PATH, "utf-8"));
}

/**
 * Save character centroids to separate file.
 */
function saveCentroidsDatabase(db: CentroidsDatabase): void {
  ensureDir(CLIP_METADATA_DIR);
  fs.writeFileSync(CHARACTER_CENTROIDS_PATH, JSON.stringify(db, null, 2));
}

/**
 * Get centroid for a specific character (lazy-loads centroids file).
 */
function getCharacterCentroid(characterId: string): number[] | null {
  const centroidsDb = loadCentroidsDatabase();
  return centroidsDb.centroids[characterId] || null;
}

/**
 * Get all centroids (for batch operations like face matching).
 */
function getAllCentroids(): Record<string, number[]> {
  const centroidsDb = loadCentroidsDatabase();
  return centroidsDb.centroids;
}

interface ClipMetadataWithFaces {
  clip_id: string;
  frames: {
    sampled_at: number[];
  };
  faces?: FacesMetadata;
}

interface ClipsDatabase {
  version: string;
  updated_at: string;
  clips: Record<string, ClipMetadataWithFaces>;
}

function loadClipsDatabase(): ClipsDatabase {
  if (!fs.existsSync(CLIPS_JSON_PATH)) {
    throw new Error("Clips database not found. Run extract_clip_metadata first.");
  }
  return JSON.parse(fs.readFileSync(CLIPS_JSON_PATH, "utf-8"));
}

function saveClipsDatabase(db: ClipsDatabase): void {
  db.updated_at = new Date().toISOString();
  fs.writeFileSync(CLIPS_JSON_PATH, JSON.stringify(db, null, 2));
}

// ============================================================================
// Python Script Execution
// ============================================================================

async function runPythonScript(
  scriptPath: string,
  input: object
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed (exit ${code}): ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });

    // Send input via stdin
    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
}

// ============================================================================
// Face Detection
// ============================================================================

export interface DetectFacesResult {
  clip_id: string;
  faces_detected: number;
  faces: FaceDetection[];
  errors: string[];
}

/**
 * Detect faces in a set of frame images using Python face_recognition library.
 */
export async function detectFacesInFrames(
  framePaths: string[],
  frameTimestamps: number[],
  clipId: string
): Promise<DetectFacesResult> {
  // Validate inputs
  if (framePaths.length !== frameTimestamps.length) {
    throw new Error("Frame paths and timestamps must have same length");
  }

  // Filter to existing files
  const validFrames: Array<{ path: string; timestamp: number }> = [];
  for (let i = 0; i < framePaths.length; i++) {
    if (fs.existsSync(framePaths[i])) {
      validFrames.push({ path: framePaths[i], timestamp: frameTimestamps[i] });
    }
  }

  if (validFrames.length === 0) {
    return {
      clip_id: clipId,
      faces_detected: 0,
      faces: [],
      errors: ["No valid frame files found"],
    };
  }

  // Call Python script
  const input = { frames: validFrames.map((f) => f.path) };
  let output: PythonDetectionOutput;

  try {
    const stdout = await runPythonScript(FACE_DETECTION_SCRIPT, input);
    output = JSON.parse(stdout);
  } catch (error) {
    return {
      clip_id: clipId,
      faces_detected: 0,
      faces: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }

  // Convert results to FaceDetection format
  const faces: FaceDetection[] = [];
  const errors: string[] = [];
  let faceIndex = 0;

  for (let i = 0; i < output.results.length; i++) {
    const result = output.results[i];
    const timestamp = validFrames[i].timestamp;

    if (result.error) {
      errors.push(`Frame ${timestamp}s: ${result.error}`);
      continue;
    }

    for (const face of result.faces) {
      faces.push({
        face_id: `face_${clipId}_${faceIndex++}`,
        frame_timestamp: timestamp,
        location: face.location,
        embedding: face.embedding,
        character_id: null,
      });
    }
  }

  return {
    clip_id: clipId,
    faces_detected: faces.length,
    faces,
    errors,
  };
}

/**
 * Detect faces in a clip's extracted frames.
 * Frames must already be extracted (via extract_clip_metadata).
 */
export async function detectFacesForClip(
  clipId: string,
  options: { reprocess?: boolean } = {}
): Promise<DetectFacesResult> {
  const { reprocess = false } = options;
  const db = loadClipsDatabase();

  const clip = db.clips[clipId];
  if (!clip) {
    throw new Error(`Clip not found: ${clipId}`);
  }

  // Check if already processed
  if (clip.faces && !reprocess) {
    return {
      clip_id: clipId,
      faces_detected: clip.faces.total_faces,
      faces: clip.faces.faces,
      errors: [],
    };
  }

  // Get frame paths from temp directory
  const framesDir = path.join(TEMP_DIR, `frames_${clipId}`);
  if (!fs.existsSync(framesDir)) {
    // Try to find frames in the standard pattern
    const timestamps = clip.frames.sampled_at;
    if (!timestamps || timestamps.length === 0) {
      throw new Error(
        `No frames found for clip ${clipId}. Extract frames first with extract_clip_metadata.`
      );
    }

    // Frames might not exist if metadata was already completed
    throw new Error(
      `Frame directory not found: ${framesDir}. Re-extract frames with extract_clip_metadata(skipExisting: false).`
    );
  }

  // List frame files
  const frameFiles = fs
    .readdirSync(framesDir)
    .filter((f) => f.endsWith(".png"))
    .sort();

  const framePaths = frameFiles.map((f) => path.join(framesDir, f));
  const frameTimestamps = frameFiles.map((f) => {
    const match = f.match(/frame_(\d+\.\d+)s/);
    return match ? parseFloat(match[1]) : 0;
  });

  // Run face detection
  const result = await detectFacesInFrames(framePaths, frameTimestamps, clipId);

  // Update clip metadata
  clip.faces = {
    detected_at: new Date().toISOString(),
    faces: result.faces,
    total_faces: result.faces_detected,
    unique_characters: [],
  };
  saveClipsDatabase(db);

  return result;
}

// ============================================================================
// Batch Processing
// ============================================================================

export interface BatchDetectResult {
  processed: number;
  skipped: number;
  failed: number;
  total_faces: number;
  clips: Array<{
    clip_id: string;
    faces_detected: number;
    skipped: boolean;
    error?: string;
  }>;
}

/**
 * Batch detect faces across multiple clips.
 */
export async function batchDetectFaces(options: {
  limit?: number;
  skipExisting?: boolean;
  projectId?: string;
}): Promise<BatchDetectResult> {
  const { limit, skipExisting = true, projectId } = options;

  const db = loadClipsDatabase();
  let clipIds = Object.keys(db.clips);

  // Filter by project if specified
  if (projectId) {
    clipIds = clipIds.filter((id) => {
      const clip = db.clips[id] as { provenance?: { project_id?: string } };
      return clip.provenance?.project_id === projectId;
    });
  }

  // Filter to clips without faces if skipExisting
  if (skipExisting) {
    clipIds = clipIds.filter((id) => !db.clips[id].faces);
  }

  // Apply limit
  if (limit) {
    clipIds = clipIds.slice(0, limit);
  }

  const results: BatchDetectResult = {
    processed: 0,
    skipped: 0,
    failed: 0,
    total_faces: 0,
    clips: [],
  };

  for (const clipId of clipIds) {
    // Check if frames exist
    const framesDir = path.join(TEMP_DIR, `frames_${clipId}`);
    if (!fs.existsSync(framesDir)) {
      results.skipped++;
      results.clips.push({
        clip_id: clipId,
        faces_detected: 0,
        skipped: true,
        error: "Frames not extracted",
      });
      continue;
    }

    try {
      const result = await detectFacesForClip(clipId, { reprocess: !skipExisting });
      results.processed++;
      results.total_faces += result.faces_detected;
      results.clips.push({
        clip_id: clipId,
        faces_detected: result.faces_detected,
        skipped: false,
      });
    } catch (error) {
      results.failed++;
      results.clips.push({
        clip_id: clipId,
        faces_detected: 0,
        skipped: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

// ============================================================================
// Character Clustering
// ============================================================================

export interface ClusterResult {
  characters_found: number;
  faces_assigned: number;
  faces_unassigned: number;
  characters: Character[];
}

/**
 * Cluster all detected faces into character groups using DBSCAN.
 */
export async function clusterCharacters(options: {
  eps?: number;
  minSamples?: number;
  recluster?: boolean;
}): Promise<ClusterResult> {
  const { eps = 0.5, minSamples = 2, recluster = false } = options;

  // Check if already clustered
  const charDb = loadCharacterDatabase();
  if (Object.keys(charDb.characters).length > 0 && !recluster) {
    const characters = Object.values(charDb.characters);
    return {
      characters_found: characters.length,
      faces_assigned: characters.reduce((sum, c) => sum + c.occurrence_count, 0),
      faces_unassigned: 0,
      characters,
    };
  }

  // Collect all faces from all clips
  const db = loadClipsDatabase();
  const allFaces: Array<{ face_id: string; embedding: number[]; clip_id: string }> = [];

  for (const clipId of Object.keys(db.clips)) {
    const clip = db.clips[clipId];
    if (clip.faces?.faces) {
      for (const face of clip.faces.faces) {
        allFaces.push({
          face_id: face.face_id,
          embedding: face.embedding,
          clip_id: clipId,
        });
      }
    }
  }

  if (allFaces.length === 0) {
    return {
      characters_found: 0,
      faces_assigned: 0,
      faces_unassigned: 0,
      characters: [],
    };
  }

  // Call Python clustering script
  const input = {
    faces: allFaces.map((f) => ({ face_id: f.face_id, embedding: f.embedding })),
    eps,
    min_samples: minSamples,
  };

  let output: PythonClusterOutput;
  try {
    const stdout = await runPythonScript(CHARACTER_CLUSTER_SCRIPT, input);
    output = JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Clustering failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Build character database and centroids database (stored separately)
  const faceToClip = new Map(allFaces.map((f) => [f.face_id, f.clip_id]));
  const characters: Character[] = [];
  const centroidsDb: CentroidsDatabase = {
    version: "1.0.0",
    description: "Character face embedding centroids (128-dim vectors). Used for face matching.",
    centroids: {},
  };
  const now = new Date().toISOString();

  for (const cluster of output.characters) {
    const clipIds = [...new Set(cluster.face_ids.map((fid) => faceToClip.get(fid)!))];

    // Store centroid separately
    centroidsDb.centroids[cluster.character_id] = cluster.centroid;

    characters.push({
      character_id: cluster.character_id,
      // centroid stored separately in character_centroids.json
      face_ids: cluster.face_ids,
      clip_ids: clipIds,
      occurrence_count: cluster.occurrence_count,
      representative_frame: null,
      metadata: {
        first_seen: now,
        last_clustered: now,
      },
    });
  }

  // Update character database (metadata only, no centroids)
  charDb.characters = {};
  for (const char of characters) {
    charDb.characters[char.character_id] = char;
  }
  saveCharacterDatabase(charDb);

  // Save centroids to separate file
  saveCentroidsDatabase(centroidsDb);

  // Update clip metadata with character assignments
  const faceToCharacter = new Map<string, string>();
  for (const char of characters) {
    for (const faceId of char.face_ids) {
      faceToCharacter.set(faceId, char.character_id);
    }
  }

  for (const clipId of Object.keys(db.clips)) {
    const clip = db.clips[clipId];
    if (clip.faces?.faces) {
      const uniqueChars = new Set<string>();

      for (const face of clip.faces.faces) {
        const charId = faceToCharacter.get(face.face_id);
        if (charId) {
          face.character_id = charId;
          uniqueChars.add(charId);
        }
      }

      clip.faces.unique_characters = [...uniqueChars].sort();
    }
  }
  saveClipsDatabase(db);

  return {
    characters_found: output.stats.characters_found,
    faces_assigned: output.stats.faces_assigned,
    faces_unassigned: output.stats.faces_unassigned,
    characters,
  };
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Get all clips containing a specific character.
 */
export function searchClipsByCharacter(characterId: string): string[] {
  const charDb = loadCharacterDatabase();
  const char = charDb.characters[characterId];
  return char?.clip_ids || [];
}

/**
 * List all detected characters with their occurrence counts.
 */
export function listCharacters(): Array<{
  character_id: string;
  occurrence_count: number;
  clip_count: number;
}> {
  const charDb = loadCharacterDatabase();
  return Object.values(charDb.characters).map((char) => ({
    character_id: char.character_id,
    occurrence_count: char.occurrence_count,
    clip_count: char.clip_ids.length,
  }));
}

/**
 * Get detailed information about a specific character.
 */
export function getCharacter(characterId: string): Character | null {
  const charDb = loadCharacterDatabase();
  return charDb.characters[characterId] || null;
}

/**
 * Find which character(s) match a face in an image.
 * Lazy-loads centroids only when this function is called.
 */
export async function findCharacterByImage(
  imagePath: string,
  threshold: number = 0.5
): Promise<Array<{ character_id: string; distance: number }>> {
  const resolvedPath = resolvePath(imagePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  // Detect face in input image
  const detectionInput = { frames: [resolvedPath] };
  let detectionOutput: PythonDetectionOutput;

  try {
    const stdout = await runPythonScript(FACE_DETECTION_SCRIPT, detectionInput);
    detectionOutput = JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Face detection failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const faces = detectionOutput.results[0]?.faces || [];
  if (faces.length === 0) {
    return [];
  }

  // Get embedding of first face
  const embedding = faces[0].embedding;

  // Load centroids (lazy-loaded, separate from character metadata)
  const centroids = getAllCentroids();
  const characterIds = Object.keys(centroids);

  if (characterIds.length === 0) {
    return [];
  }

  // Call Python script to find matching character
  const matchInput = {
    faces: [],
    find_match: {
      embedding,
      characters: characterIds.map((id) => ({
        character_id: id,
        centroid: centroids[id],
      })),
      threshold,
    },
  };

  try {
    const stdout = await runPythonScript(CHARACTER_CLUSTER_SCRIPT, matchInput);
    const result = JSON.parse(stdout);

    if (result.match) {
      return [result.match];
    }
    return [];
  } catch (error) {
    throw new Error(
      `Character matching failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// Character Metadata Updates
// ============================================================================

export interface UpdateCharacterOptions {
  name?: string;
  description?: string;
  generation_prompt?: string;
  tags?: string[];
  notes?: string;
}

/**
 * Update user-annotated metadata for a character.
 * Only updates fields that are provided (undefined fields are ignored).
 */
export function updateCharacter(
  characterId: string,
  updates: UpdateCharacterOptions
): Character {
  const charDb = loadCharacterDatabase();
  const char = charDb.characters[characterId];

  if (!char) {
    throw new Error(`Character not found: ${characterId}`);
  }

  // Merge updates (only set fields that are provided)
  if (updates.name !== undefined) char.name = updates.name;
  if (updates.description !== undefined) char.description = updates.description;
  if (updates.generation_prompt !== undefined) char.generation_prompt = updates.generation_prompt;
  if (updates.tags !== undefined) char.tags = updates.tags;
  if (updates.notes !== undefined) char.notes = updates.notes;

  // Save updated database
  saveCharacterDatabase(charDb);

  return char;
}
