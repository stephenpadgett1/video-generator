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
// Ensure a path is absolute (relative to project root if not)
export function resolvePath(filepath) {
    if (path.isAbsolute(filepath)) {
        return filepath;
    }
    return path.join(PROJECT_ROOT, filepath);
}
//# sourceMappingURL=paths.js.map