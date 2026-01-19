/**
 * Video Upscaling Service
 *
 * Wraps Video2X CLI for video upscaling using Real-ESRGAN, RealCUGAN, or Anime4K.
 * Video2X uses Vulkan for GPU acceleration on NVIDIA RTX cards.
 *
 * @see https://github.com/k4yt3x/video2x
 */

import fs from "fs";
import path from "path";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { VIDEO2X_PATH, resolvePath } from "../utils/paths.js";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

/**
 * Available upscaling processors:
 * - realesrgan: Best for real/AI-generated content (uses realesrgan-plus model)
 * - realcugan: Good for anime, produces fewer artifacts
 * - anime4k: Fast, uses libplacebo with anime4k shaders
 */
export type UpscaleModel = "realesrgan" | "realcugan" | "anime4k";
export type ScaleFactor = 2 | 3 | 4;

export interface UpscaleOptions {
  outputPath?: string;
  scale?: ScaleFactor;
  model?: UpscaleModel;
  gpuId?: number;
}

export interface UpscaleResult {
  inputPath: string;
  outputPath: string;
  scale: ScaleFactor;
  model: UpscaleModel;
  gpuId: number;
  duration: number; // Processing time in milliseconds
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate output filename with scale suffix
 * e.g., veo_abc123.mp4 -> veo_abc123_4k.mp4
 */
function generateOutputPath(inputPath: string, scale: ScaleFactor): string {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);

  const suffix = scale === 4 ? "_4k" : `_${scale}x`;
  return path.join(dir, `${base}${suffix}${ext}`);
}

/**
 * Check if Video2X is installed
 */
export async function checkVideo2XInstalled(): Promise<boolean> {
  try {
    // Check if the configured path exists
    if (fs.existsSync(VIDEO2X_PATH)) {
      return true;
    }

    // Try running video2x to see if it's in PATH
    await execAsync("video2x --version");
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Video2X version
 */
export async function getVideo2XVersion(): Promise<string | null> {
  try {
    const video2xCmd = fs.existsSync(VIDEO2X_PATH) ? `"${VIDEO2X_PATH}"` : "video2x";
    const { stdout } = await execAsync(`${video2xCmd} --version`);
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * List available Vulkan devices (GPUs)
 */
export async function listDevices(): Promise<string | null> {
  try {
    const video2xCmd = fs.existsSync(VIDEO2X_PATH) ? `"${VIDEO2X_PATH}"` : "video2x";
    const { stdout, stderr } = await execAsync(`${video2xCmd} --list-devices`);
    // Video2X outputs device info to stderr
    return (stderr || stdout).trim();
  } catch (error: unknown) {
    const err = error as { stderr?: string };
    // Device list is output to stderr even on success
    if (err.stderr && err.stderr.includes("NVIDIA")) {
      return err.stderr.trim();
    }
    return null;
  }
}

// ============================================================================
// Core Upscaling
// ============================================================================

/**
 * Run Video2X using spawn for better process control
 */
function runVideo2X(
  args: string[],
  timeout: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const video2xPath = fs.existsSync(VIDEO2X_PATH) ? VIDEO2X_PATH : "video2x";

    const proc = spawn(video2xPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Video2X process timed out after ${timeout / 1000}s`));
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      // Video2X may return non-zero even on success, check stderr for success message
      if (stderr.includes("Video processed successfully") || code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Video2X exited with code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to spawn Video2X: ${err.message}`));
    });
  });
}

/**
 * Upscale a video using Video2X
 *
 * @param inputPath - Path to input video file
 * @param options - Upscaling options
 * @returns Upscale result with output path and processing info
 */
export async function upscaleVideo(
  inputPath: string,
  options: UpscaleOptions = {}
): Promise<UpscaleResult> {
  const {
    outputPath,
    scale = 4,
    model = "realesrgan",
    gpuId = 0,
  } = options;

  // Resolve input path
  const resolvedInput = resolvePath(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`Input video not found: ${inputPath}`);
  }

  // Check Video2X installation
  const isInstalled = await checkVideo2XInstalled();
  if (!isInstalled) {
    throw new Error(
      `Video2X not found. Please install from https://github.com/k4yt3x/video2x/releases\n` +
      `Expected location: ${VIDEO2X_PATH}\n` +
      `Or set VIDEO2X_PATH environment variable to the correct path.`
    );
  }

  // Determine output path
  const resolvedOutput = outputPath
    ? resolvePath(outputPath)
    : generateOutputPath(resolvedInput, scale);

  // Ensure output directory exists
  const outputDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Build arguments array (not quoted, spawn handles that)
  const args: string[] = [
    "-i", resolvedInput,
    "-o", resolvedOutput,
    "-s", scale.toString(),
    "-d", gpuId.toString(),
    "--no-progress", // Disable progress bar for cleaner output
  ];

  // Add processor-specific options
  switch (model) {
    case "realesrgan":
      // Use realesrgan-plus for real/AI content (not anime-specific)
      args.push("-p", "realesrgan");
      args.push("--realesrgan-model", "realesrgan-plus");
      break;
    case "realcugan":
      args.push("-p", "realcugan");
      args.push("--realcugan-model", "models-se");
      break;
    case "anime4k":
      // anime4k is via libplacebo with shaders
      args.push("-p", "libplacebo");
      args.push("--libplacebo-shader", "anime4k-v4-a+a");
      break;
  }

  // Execute upscaling
  const startTime = Date.now();

  await runVideo2X(args, 30 * 60 * 1000); // 30 minute timeout

  const duration = Date.now() - startTime;

  // Verify output exists
  if (!fs.existsSync(resolvedOutput)) {
    throw new Error(`Upscaling completed but output file not found: ${resolvedOutput}`);
  }

  return {
    inputPath: resolvedInput,
    outputPath: resolvedOutput,
    scale,
    model,
    gpuId,
    duration,
  };
}
