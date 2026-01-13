import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { VIDEO_DIR, AUDIO_DIR, EXPORTS_DIR, resolvePath } from "../utils/paths.js";
import { loadProject, type Project, type Shot } from "./projects.js";
import { loadManifest, getEditDir } from "./editing.js";
import { generateTTS, computeVoiceSettings } from "./audio.js";

const execAsync = promisify(exec);

/**
 * Resolve a video path (handles /video/ prefix and relative paths)
 */
function resolveVideoPath(videoPath: string): string {
  if (videoPath.startsWith("/video/")) {
    return path.join(VIDEO_DIR, videoPath.replace("/video/", ""));
  }
  if (!path.isAbsolute(videoPath)) {
    return resolvePath(videoPath);
  }
  return videoPath;
}

export interface AssemblyShot {
  videoPath: string;
  trimStart?: number;
  trimEnd?: number;
  energy?: number;
  tension?: number;
  mood?: string;
  skipTransition?: boolean;
}

export interface AudioLayer {
  type: "music" | "vo" | "sfx" | "ambient";
  path?: string;
  text?: string;
  voice_id?: string;
  model_id?: string;
  volume?: number;
  startTime?: number;
  mood?: string;
  tension?: number;
  energy?: number;
}

export interface TextOverlay {
  text: string;
  startTime: number;
  duration: number;
  position?: "top" | "center" | "bottom";
}

export interface AssemblyOptions {
  shots?: AssemblyShot[];
  outputFilename?: string;
  textOverlays?: TextOverlay[];
  audioLayers?: AudioLayer[];
  videoVolume?: number;
  project_id?: string;
  voice_id?: string;
}

export interface AssemblyResult {
  success: boolean;
  filename: string;
  path: string;
  duration: number;
  shotCount: number;
}

type TransitionType = "hard_cut" | "crossfade" | "crossfade_long" | "black" | "cut";

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
 * Determine transition type based on tension and energy
 */
function getTransitionType(prevShot: AssemblyShot | null, currShot: AssemblyShot): TransitionType {
  if (!prevShot) return "cut";

  const prevTension = prevShot.tension ?? 0.5;
  const currTension = currShot.tension ?? 0.5;
  const tensionChange = currTension - prevTension;

  const prevEnergy = prevShot.energy ?? 0.5;
  const currEnergy = currShot.energy ?? 0.5;
  const energyChange = currEnergy - prevEnergy;

  // Tension-aware transitions (priority)
  if (tensionChange <= -0.4 && currTension < 0.3) {
    return "crossfade_long"; // Release
  }
  if (tensionChange >= 0.4 && prevTension < 0.3) {
    return "black"; // Breath before impact
  }
  if (prevTension >= 0.6 && currTension >= 0.6) {
    return "hard_cut"; // Sustained high tension
  }

  // Fall back to energy-based
  if (energyChange <= -0.4) return "black";
  if (energyChange >= 0.4) return "hard_cut";
  if (Math.abs(energyChange) < 0.2) return "crossfade";

  return "cut";
}

/**
 * Get selected variation path for a job (if edited)
 */
function getSelectedVideoPath(jobId: string, originalPath: string): string {
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

/**
 * Build shots from project data
 */
function buildShotsFromProject(project: Project): AssemblyShot[] {
  const shots: AssemblyShot[] = [];

  for (const shot of project.shots || []) {
    // Handle multi-take shots
    if (shot.take_job_ids && shot.take_job_ids.length > 0) {
      shot.take_job_ids.forEach((jobId, idx) => {
        const videoPath = getVideoPathForJob(project, jobId);
        if (videoPath) {
          shots.push({
            videoPath: getSelectedVideoPath(jobId, videoPath),
            energy: shot.energy,
            tension: shot.tension,
            mood: shot.mood,
            skipTransition: idx > 0, // Skip transition for sequential takes
          });
        }
      });
    } else if (shot.job_id) {
      const videoPath = getVideoPathForJob(project, shot.job_id);
      if (videoPath) {
        shots.push({
          videoPath: getSelectedVideoPath(shot.job_id, videoPath),
          energy: shot.energy,
          tension: shot.tension,
          mood: shot.mood,
        });
      }
    }
  }

  return shots;
}

/**
 * Get video path for a job from project
 */
function getVideoPathForJob(project: Project, jobId: string): string | null {
  // Search project shots for job result
  for (const shot of project.shots || []) {
    if (shot.job_id === jobId && shot.result?.path) {
      return resolveVideoPath(shot.result.path);
    }
    // Check multi-take results
    if (shot.take_results) {
      const result = shot.take_results.find((r: { job_id: string }) => r.job_id === jobId);
      if (result?.path) {
        return resolveVideoPath(result.path);
      }
    }
  }
  return null;
}

/**
 * Normalize video to target specs
 */
async function normalizeVideo(inputPath: string, outputPath: string): Promise<void> {
  const cmd = `ffmpeg -y -i "${inputPath}" -c:v libx264 -preset fast -crf 23 -r 24 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 "${outputPath}"`;
  await execAsync(cmd);
}

/**
 * Create black frame video
 */
async function createBlackFrame(outputPath: string, duration: number = 0.5): Promise<void> {
  // Default to 720p - will be scaled during concat
  const cmd = `ffmpeg -y -f lavfi -i "color=c=black:s=1280x720:r=24:d=${duration}" -f lavfi -i "anullsrc=r=48000:cl=stereo" -c:v libx264 -c:a aac -t ${duration} -pix_fmt yuv420p "${outputPath}"`;
  await execAsync(cmd);
}

/**
 * Apply crossfade between two clips
 */
async function applyCrossfade(
  clip1: string,
  clip2: string,
  outputPath: string,
  duration: number = 0.25
): Promise<void> {
  const clip1Duration = await getVideoDuration(clip1);
  const offset = Math.max(0, clip1Duration - duration);

  const cmd = `ffmpeg -y -i "${clip1}" -i "${clip2}" -filter_complex "[0:v][1:v]xfade=transition=fade:duration=${duration}:offset=${offset}[v];[0:a][1:a]acrossfade=d=${duration}[a]" -map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac "${outputPath}"`;
  await execAsync(cmd);
}

/**
 * Generate TTS for a text layer if needed
 */
async function processAudioLayer(
  layer: AudioLayer,
  defaultVoiceId?: string
): Promise<{ path: string; duration: number }> {
  if (layer.path) {
    // Use existing file
    const resolvedPath = layer.path.startsWith("/audio/")
      ? path.join(AUDIO_DIR, layer.path.replace("/audio/", ""))
      : resolvePath(layer.path);
    const duration = await getVideoDuration(resolvedPath);
    return { path: resolvedPath, duration };
  }

  if (layer.text && (layer.voice_id || defaultVoiceId)) {
    // Generate TTS
    const voiceId = layer.voice_id || defaultVoiceId!;
    const result = await generateTTS({
      voice_id: voiceId,
      text: layer.text,
      mood: layer.mood,
      tension: layer.tension,
      energy: layer.energy,
      model_id: layer.model_id,
    });
    // Get duration from generated file
    const duration = await getVideoDuration(result.path);
    return { path: result.path, duration };
  }

  throw new Error("Audio layer must have either path or text with voice_id");
}

/**
 * Apply audio layers to video
 */
async function mixAudioLayers(
  videoPath: string,
  outputPath: string,
  audioLayers: Array<{ path: string; startTime: number; volume: number; duration: number }>,
  videoVolume: number = 1.0
): Promise<void> {
  if (audioLayers.length === 0) {
    fs.copyFileSync(videoPath, outputPath);
    return;
  }

  // Build filter complex
  const inputs = [`-i "${videoPath}"`];
  audioLayers.forEach((layer) => {
    inputs.push(`-i "${layer.path}"`);
  });

  const filterParts: string[] = [];
  const mixInputs: string[] = [];

  // Video audio with volume
  filterParts.push(`[0:a]volume=${videoVolume}[vid]`);
  mixInputs.push("[vid]");

  // Each audio layer
  audioLayers.forEach((layer, idx) => {
    const delayMs = Math.round((layer.startTime || 0) * 1000);
    filterParts.push(
      `[${idx + 1}:a]adelay=${delayMs}|${delayMs},volume=${layer.volume || 1.0}[a${idx}]`
    );
    mixInputs.push(`[a${idx}]`);
  });

  // Mix all
  filterParts.push(`${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first[out]`);

  const filterComplex = filterParts.join(";");
  const cmd = `ffmpeg -y ${inputs.join(" ")} -filter_complex "${filterComplex}" -map 0:v -map "[out]" -c:v copy -c:a aac "${outputPath}"`;

  await execAsync(cmd);
}

/**
 * Apply text overlays to video
 */
async function applyTextOverlays(
  videoPath: string,
  outputPath: string,
  overlays: TextOverlay[]
): Promise<void> {
  if (overlays.length === 0) {
    fs.copyFileSync(videoPath, outputPath);
    return;
  }

  const filters = overlays.map((overlay) => {
    const y = overlay.position === "top" ? "h/10" : overlay.position === "center" ? "(h-th)/2" : "h-h/10-th";
    const endTime = overlay.startTime + overlay.duration;
    return `drawtext=text='${overlay.text.replace(/'/g, "\\'")}':fontsize=(w/36):fontcolor=white:borderw=2:x=(w-tw)/2:y=${y}:enable='between(t,${overlay.startTime},${endTime})'`;
  });

  const cmd = `ffmpeg -y -i "${videoPath}" -vf "${filters.join(",")}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a copy "${outputPath}"`;
  await execAsync(cmd);
}

/**
 * Assemble video from shots with transitions, audio, and overlays
 */
export async function assembleVideo(options: AssemblyOptions): Promise<AssemblyResult> {
  const { outputFilename, textOverlays, audioLayers, videoVolume = 1.0, project_id, voice_id } = options;
  let { shots } = options;

  // If project_id provided, load shots from project
  if (project_id) {
    const project = loadProject(project_id);
    if (!project) {
      throw new Error(`Project not found: ${project_id}`);
    }
    shots = buildShotsFromProject(project);
  }

  if (!shots || shots.length === 0) {
    throw new Error("No shots provided for assembly");
  }

  // Create temp directory for intermediate files
  const tempDir = path.join(EXPORTS_DIR, `temp_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Phase 1: Normalize all clips
    const normalizedClips: string[] = [];
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      let videoPath = shot.videoPath;

      // Resolve path
      if (videoPath.startsWith("/video/")) {
        videoPath = path.join(VIDEO_DIR, videoPath.replace("/video/", ""));
      } else if (!path.isAbsolute(videoPath)) {
        videoPath = resolvePath(videoPath);
      }

      if (!fs.existsSync(videoPath)) {
        throw new Error(`Video not found: ${videoPath}`);
      }

      const normalizedPath = path.join(tempDir, `norm_${i}.mp4`);
      await normalizeVideo(videoPath, normalizedPath);
      normalizedClips.push(normalizedPath);
    }

    // Phase 2: Apply transitions
    const assembledClips: string[] = [];
    let currentClip = normalizedClips[0];

    for (let i = 1; i < normalizedClips.length; i++) {
      const prevShot = shots[i - 1];
      const currShot = shots[i];
      const nextClip = normalizedClips[i];

      // Skip transition for multi-take continuity
      if (currShot.skipTransition) {
        assembledClips.push(currentClip);
        currentClip = nextClip;
        continue;
      }

      const transition = getTransitionType(prevShot, currShot);
      const outputPath = path.join(tempDir, `trans_${i}.mp4`);

      switch (transition) {
        case "crossfade":
          await applyCrossfade(currentClip, nextClip, outputPath, 0.25);
          currentClip = outputPath;
          break;

        case "crossfade_long":
          await applyCrossfade(currentClip, nextClip, outputPath, 0.5);
          currentClip = outputPath;
          break;

        case "black": {
          const blackPath = path.join(tempDir, `black_${i}.mp4`);
          await createBlackFrame(blackPath, 0.5);
          // Concatenate: prev + black + next
          const concatList = path.join(tempDir, `concat_${i}.txt`);
          fs.writeFileSync(concatList, `file '${currentClip}'\nfile '${blackPath}'\nfile '${nextClip}'`);
          await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${outputPath}"`);
          currentClip = outputPath;
          break;
        }

        case "hard_cut":
        case "cut":
        default:
          // Simple concatenation
          const concatList = path.join(tempDir, `concat_${i}.txt`);
          fs.writeFileSync(concatList, `file '${currentClip}'\nfile '${nextClip}'`);
          await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${outputPath}"`);
          currentClip = outputPath;
          break;
      }
    }

    // Add final clip
    assembledClips.push(currentClip);

    // Phase 3: Get assembled video
    let finalVideo = assembledClips[assembledClips.length - 1];

    // Phase 4: Apply text overlays
    if (textOverlays && textOverlays.length > 0) {
      const overlayPath = path.join(tempDir, "with_overlays.mp4");
      await applyTextOverlays(finalVideo, overlayPath, textOverlays);
      finalVideo = overlayPath;
    }

    // Phase 5: Process and mix audio layers
    if (audioLayers && audioLayers.length > 0) {
      const processedLayers: Array<{ path: string; startTime: number; volume: number; duration: number }> = [];

      for (const layer of audioLayers) {
        const { path: audioPath, duration } = await processAudioLayer(layer, voice_id);
        processedLayers.push({
          path: audioPath,
          startTime: layer.startTime || 0,
          volume: layer.volume || 1.0,
          duration,
        });
      }

      const mixedPath = path.join(tempDir, "with_audio.mp4");
      await mixAudioLayers(finalVideo, mixedPath, processedLayers, videoVolume);
      finalVideo = mixedPath;
    }

    // Phase 6: Move to final destination
    const filename = outputFilename || `assembly_${Date.now()}.mp4`;
    const finalPath = path.join(EXPORTS_DIR, filename);

    if (!fs.existsSync(EXPORTS_DIR)) {
      fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    }

    fs.copyFileSync(finalVideo, finalPath);
    const duration = await getVideoDuration(finalPath);

    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });

    return {
      success: true,
      filename,
      path: finalPath,
      duration,
      shotCount: shots.length,
    };
  } catch (error) {
    // Cleanup on error
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

/**
 * Extract a frame from a video at a specific timestamp
 */
export async function extractFrame(
  videoPath: string,
  timestamp: number,
  outputPath?: string
): Promise<string> {
  // Resolve video path
  let resolved = videoPath;
  if (videoPath.startsWith("/video/")) {
    resolved = path.join(VIDEO_DIR, videoPath.replace("/video/", ""));
  } else if (!path.isAbsolute(videoPath)) {
    resolved = resolvePath(videoPath);
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  // Generate output path if not provided
  const output =
    outputPath ||
    path.join(EXPORTS_DIR, `frame_${Date.now()}_${timestamp.toFixed(2).replace(".", "_")}s.png`);

  if (!fs.existsSync(path.dirname(output))) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
  }

  const cmd = `ffmpeg -y -ss ${timestamp} -i "${resolved}" -frames:v 1 -q:v 2 "${output}"`;
  await execAsync(cmd);

  return output;
}
