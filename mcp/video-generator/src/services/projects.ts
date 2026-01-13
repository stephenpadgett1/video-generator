import fs from "fs";
import path from "path";
import { PROJECTS_DIR } from "../utils/paths.js";

export interface Shot {
  shot_id?: string;
  job_id?: string;
  take_job_ids?: string[];
  take_results?: Array<{
    job_id: string;
    path?: string;
  }>;
  result?: {
    path?: string;
  };
  energy?: number;
  tension?: number;
  mood?: string;
  duration_target?: number;
  role?: string;
  description?: string;
  vo?: string;
  dialogue?: Array<{
    speaker: string;
    text: string;
    mood?: string;
  }>;
}

export interface Character {
  id: string;
  description?: string;
  locked_description?: string;
  base_image_path?: string;
  locked?: boolean;
}

export interface Environment {
  id: string;
  description?: string;
  locked_description?: string;
  base_image_path?: string;
  locked?: boolean;
}

export interface Project {
  id?: string;
  title?: string;
  concept?: string;
  duration?: number;
  arc?: string;
  style?: string;
  production_style?: string;
  characters?: Character[];
  environments?: Environment[];
  shots?: Shot[];
  voiceCasting?: Record<string, string>;
  createdAt?: string;
  savedAt?: string;
  annotations?: unknown[];
}

/**
 * Load a project by ID
 */
export function loadProject(projectId: string): Project | null {
  const filepath = path.join(PROJECTS_DIR, `${projectId}.json`);

  if (!fs.existsSync(filepath)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filepath, "utf-8"));
    return data as Project;
  } catch {
    return null;
  }
}

/**
 * Save a project
 */
export function saveProject(projectId: string, project: Project): void {
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  }

  const filepath = path.join(PROJECTS_DIR, `${projectId}.json`);
  const dataToSave = {
    ...project,
    id: projectId,
    savedAt: new Date().toISOString(),
  };

  fs.writeFileSync(filepath, JSON.stringify(dataToSave, null, 2));
}

/**
 * List all project IDs
 */
export function listProjectIds(): string[] {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.basename(f, ".json"));
}
