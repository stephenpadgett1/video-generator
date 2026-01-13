import { fileURLToPath } from "url";
import path from "path";

// Get the MCP server directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Navigate up to project root: mcp/video-generator/src/utils -> project root
export const PROJECT_ROOT = path.resolve(__dirname, "../../../../");

// Data directories
export const DATA_DIR = path.join(PROJECT_ROOT, "data");
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const VIDEO_DIR = path.join(DATA_DIR, "video");
export const AUDIO_DIR = path.join(DATA_DIR, "audio");
export const EXPORTS_DIR = path.join(DATA_DIR, "exports");
export const EDITS_DIR = path.join(DATA_DIR, "edits");
export const JOBS_PATH = path.join(PROJECT_ROOT, "jobs.json");

// Generated content
export const GENERATED_IMAGES_DIR = path.join(PROJECT_ROOT, "generated-images");

// Clip metadata (git-tracked)
export const CLIP_METADATA_DIR = path.join(PROJECT_ROOT, "docs/clip-metadata");
export const CLIPS_JSON_PATH = path.join(CLIP_METADATA_DIR, "clips.json");
export const CLIP_METADATA_INDEX_PATH = path.join(CLIP_METADATA_DIR, "index.json");

// Temp files
export const TEMP_DIR = path.join(DATA_DIR, "temp");

// Python scripts
export const SCRIPTS_DIR = path.join(PROJECT_ROOT, "scripts");
export const FACE_DETECTION_SCRIPT = path.join(SCRIPTS_DIR, "face-detection/detect_faces.py");
export const CHARACTER_CLUSTER_SCRIPT = path.join(SCRIPTS_DIR, "face-detection/cluster_characters.py");

// Character database
export const CHARACTERS_JSON_PATH = path.join(CLIP_METADATA_DIR, "characters.json");
export const CHARACTER_CENTROIDS_PATH = path.join(CLIP_METADATA_DIR, "character_centroids.json");

// Ensure a path is absolute (relative to project root if not)
export function resolvePath(filepath: string): string {
  if (path.isAbsolute(filepath)) {
    return filepath;
  }
  return path.join(PROJECT_ROOT, filepath);
}
