import fs from "fs";
import path from "path";
import { generateVeoPrompt, MOOD_VISUALS } from "./generation.js";
import { createVeoJob, waitForJobComplete, type Job } from "./jobs.js";
import { VIDEO_DIR, GENERATED_IMAGES_DIR, resolvePath } from "../utils/paths.js";

export interface Character {
  id: string;
  description: string;
  locked_description?: string;
  base_image_path?: string;
  locked?: boolean;
}

export interface Environment {
  id: string;
  description: string;
  locked_description?: string;
  base_image_path?: string;
  primary?: boolean;
}

export interface DialogueLine {
  speaker: string;
  text: string;
  mood?: string;
  voiceDescription?: string;
}

export interface Shot {
  shot_id: string;
  description: string;
  duration_target: number;
  energy?: number;
  tension?: number;
  mood?: string;
  characters?: string[];
  environment?: string;
  dialogue?: DialogueLine[];
  vo?: string;
  job_id?: string;
  take_job_ids?: string[];
}

export interface Project {
  project_id: string;
  concept: string;
  duration: number;
  arc?: string;
  style?: string;
  characters?: Character[];
  environments?: Environment[];
  shots: Shot[];
  production_rules?: Record<string, unknown>;
}

export interface ExecutionResult {
  project_id: string;
  shots: Array<{
    shot_id: string;
    job_id: string;
    veo_prompt: string;
    status: string;
  }>;
}

/**
 * Calculate dialogue duration based on word count
 * 150 words per minute + 0.5s pause between speakers
 */
function calculateDialogueDuration(dialogue: DialogueLine[]): number {
  let totalWords = 0;
  for (const line of dialogue) {
    totalWords += line.text.split(/\s+/).length;
  }
  const speechDuration = (totalWords / 150) * 60;
  const pauseDuration = (dialogue.length - 1) * 0.5;
  return speechDuration + pauseDuration;
}

/**
 * Extract last frame from a video file using ffmpeg
 */
async function extractLastFrame(videoPath: string): Promise<string> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  const resolvedPath = resolvePath(videoPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  // Get video duration
  const { stdout: durationStr } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${resolvedPath}"`
  );
  const duration = parseFloat(durationStr.trim());
  const timestamp = Math.max(0, duration - 0.1);

  // Ensure images dir exists
  if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
    fs.mkdirSync(GENERATED_IMAGES_DIR, { recursive: true });
  }

  // Extract frame
  const randomId = Math.random().toString(36).substring(2, 8);
  const filename = `frame_last_${Date.now()}_${randomId}.png`;
  const outputPath = path.join(GENERATED_IMAGES_DIR, filename);

  await execAsync(
    `ffmpeg -y -ss ${timestamp} -i "${resolvedPath}" -vframes 1 "${outputPath}"`
  );

  return `generated-images/${filename}`;
}

/**
 * Execute a project - generate Veo prompts and submit jobs for all shots
 */
export async function executeProject(options: {
  project: Project;
  style?: string;
  aspectRatio?: string;
}): Promise<ExecutionResult> {
  const { project, style, aspectRatio = "9:16" } = options;

  // Build lookup maps
  const characterMap = new Map<string, Character>();
  if (project.characters) {
    for (const char of project.characters) {
      characterMap.set(char.id, char);
    }
  }

  const environmentMap = new Map<string, Environment>();
  if (project.environments) {
    for (const env of project.environments) {
      environmentMap.set(env.id, env);
    }
  }

  const projectStyle = style || project.style;
  const results: ExecutionResult["shots"] = [];

  for (const shot of project.shots) {
    if (!shot.description) {
      console.warn(`Shot ${shot.shot_id} has no description, skipping`);
      continue;
    }

    // Build character context
    let characterContext: string | undefined;
    let referenceImagePath: string | undefined;

    if (shot.characters && shot.characters.length > 0) {
      const lockedDescriptions: string[] = [];
      for (const charId of shot.characters) {
        const char = characterMap.get(charId);
        if (char?.locked_description) {
          lockedDescriptions.push(`${charId}: ${char.locked_description}`);
        }
        if (!referenceImagePath && char?.base_image_path) {
          referenceImagePath = char.base_image_path;
        }
      }
      if (lockedDescriptions.length > 0) {
        characterContext = `CHARACTER APPEARANCE (must match exactly): ${lockedDescriptions.join("; ")}`;
      }
    }

    // Build environment context
    let environmentContext: string | undefined;
    let environmentImagePath: string | undefined;

    if (shot.environment) {
      const env = environmentMap.get(shot.environment);
      if (env?.locked_description) {
        environmentContext = `ENVIRONMENT (must match exactly): ${env.locked_description}`;
      }
      if (env?.base_image_path) {
        environmentImagePath = env.base_image_path;
      }
    }

    // Combine contexts
    const contextParts: string[] = [];
    if (characterContext) contextParts.push(characterContext);
    if (environmentContext) contextParts.push(environmentContext);
    const additionalContext = contextParts.length > 0 ? contextParts.join("\n\n") : undefined;

    // Determine reference image (character takes priority over environment)
    const finalReferenceImage = referenceImagePath || environmentImagePath;

    // Check if shot needs multi-take handling (dialogue duration > 7s)
    const dialogueDuration = shot.dialogue ? calculateDialogueDuration(shot.dialogue) : 0;
    const needsMultiTake = dialogueDuration > 7;

    if (needsMultiTake && shot.dialogue && shot.dialogue.length > 1) {
      // Multi-take handling for long dialogue
      const takeJobIds: string[] = [];
      let prevVideoPath: string | undefined;

      // Simple split: divide dialogue roughly in half
      const midpoint = Math.ceil(shot.dialogue.length / 2);
      const dialogueParts = [
        shot.dialogue.slice(0, midpoint),
        shot.dialogue.slice(midpoint),
      ];

      for (let takeIndex = 0; takeIndex < dialogueParts.length; takeIndex++) {
        const takeDialogue = dialogueParts[takeIndex];
        const takeDuration = calculateDialogueDuration(takeDialogue) + 1; // +1s buffer

        // Get reference frame from previous take if available
        let takeReferenceImage = takeIndex === 0 ? finalReferenceImage : undefined;
        if (takeIndex > 0 && prevVideoPath) {
          try {
            takeReferenceImage = await extractLastFrame(prevVideoPath);
          } catch (err) {
            console.warn(`Failed to extract last frame for chaining: ${err}`);
          }
        }

        // Generate prompt for this take
        const veoPrompt = await generateVeoPrompt({
          description: shot.description,
          durationSeconds: Math.min(8, Math.max(4, takeDuration)),
          style: projectStyle,
          veoOptions: {
            aspectRatio,
            additionalContext,
            mood: shot.mood,
            dialogue: takeDialogue,
          },
        });

        // Submit job
        const job = await createVeoJob({
          prompt: veoPrompt,
          aspectRatio,
          durationSeconds: Math.min(8, Math.max(4, takeDuration)),
          referenceImagePath: takeReferenceImage,
        });

        takeJobIds.push(job.id);

        // Wait for this take to complete before starting next (for frame chaining)
        if (takeIndex < dialogueParts.length - 1) {
          try {
            const completedJob = await waitForJobComplete(job.id);
            if (completedJob.result?.path) {
              prevVideoPath = completedJob.result.path;
            }
          } catch (err) {
            console.warn(`Job ${job.id} failed, continuing anyway: ${err}`);
          }
        }
      }

      shot.take_job_ids = takeJobIds;
      shot.job_id = takeJobIds[0];

      results.push({
        shot_id: shot.shot_id,
        job_id: takeJobIds[0],
        veo_prompt: `[Multi-take: ${takeJobIds.length} takes]`,
        status: "submitted",
      });
    } else {
      // Single take - standard flow
      const veoPrompt = await generateVeoPrompt({
        description: shot.description,
        durationSeconds: shot.duration_target,
        style: projectStyle,
        veoOptions: {
          aspectRatio,
          additionalContext,
          mood: shot.mood,
          dialogue: shot.dialogue,
        },
      });

      // Submit job
      const job = await createVeoJob({
        prompt: veoPrompt,
        aspectRatio,
        durationSeconds: shot.duration_target,
        referenceImagePath: finalReferenceImage,
      });

      shot.job_id = job.id;

      results.push({
        shot_id: shot.shot_id,
        job_id: job.id,
        veo_prompt: veoPrompt,
        status: "submitted",
      });
    }
  }

  return {
    project_id: project.project_id,
    shots: results,
  };
}
