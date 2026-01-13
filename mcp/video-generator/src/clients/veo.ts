import fs from "fs";
import path from "path";
import { getGoogleAccessToken, buildVertexUrl } from "./google-auth.js";
import { VIDEO_DIR, resolvePath } from "../utils/paths.js";

const VEO_MODEL = "veo-3.1-generate-preview";

export interface VeoSubmitOptions {
  prompt: string;
  aspectRatio?: string;
  durationSeconds?: number;
  referenceImagePath?: string;
  lastFramePath?: string;
}

export interface VeoSubmitResult {
  operationName: string;
}

export interface VeoPollResult {
  done: boolean;
  operationName: string;
  video?: {
    bytesBase64Encoded?: string;
    uri?: string;
  };
  error?: string;
}

export interface VeoDownloadResult {
  filename: string;
  path: string;
  duration: number | null;
}

/**
 * Snap duration to Veo-supported values (4, 6, or 8 seconds)
 */
function snapDuration(seconds: number): number {
  if (seconds <= 5) return 4;
  if (seconds <= 7) return 6;
  return 8;
}

/**
 * Load image as base64
 */
function loadImageBase64(imagePath: string): string {
  const resolved = resolvePath(imagePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Image not found: ${resolved}`);
  }
  return fs.readFileSync(resolved).toString("base64");
}

/**
 * Submit a video generation request to Veo
 * Returns operation name for polling
 */
export async function submitVeoGeneration(
  options: VeoSubmitOptions
): Promise<VeoSubmitResult> {
  const { accessToken, projectId } = await getGoogleAccessToken();

  const {
    prompt,
    aspectRatio = "9:16",
    durationSeconds = 8,
    referenceImagePath,
    lastFramePath,
  } = options;

  const validDuration = snapDuration(durationSeconds);

  // Build instance with optional reference frames
  const instance: Record<string, unknown> = { prompt };

  if (referenceImagePath) {
    instance.image = {
      bytesBase64Encoded: loadImageBase64(referenceImagePath),
      mimeType: "image/png",
    };
  }

  if (lastFramePath) {
    instance.lastFrame = {
      bytesBase64Encoded: loadImageBase64(lastFramePath),
      mimeType: "image/png",
    };
  }

  const requestBody = {
    instances: [instance],
    parameters: {
      aspectRatio,
      durationSeconds: validDuration,
    },
  };

  const url = buildVertexUrl(projectId, VEO_MODEL, "predictLongRunning");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Veo submission failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { name: string };
  return { operationName: data.name };
}

/**
 * Poll Veo operation status
 */
export async function pollVeoOperation(
  operationName: string
): Promise<VeoPollResult> {
  const { accessToken, projectId } = await getGoogleAccessToken();

  const url = buildVertexUrl(projectId, VEO_MODEL, "fetchPredictOperation");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ operationName }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Veo poll failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    done?: boolean;
    response?: { videos?: Array<{ bytesBase64Encoded?: string; uri?: string }> };
    error?: { message?: string };
  };

  if (data.error) {
    return {
      done: true,
      operationName,
      error: data.error.message || "Unknown error",
    };
  }

  if (data.done && data.response?.videos?.[0]) {
    return {
      done: true,
      operationName,
      video: data.response.videos[0],
    };
  }

  return { done: false, operationName };
}

/**
 * Download video from Veo result and save to disk
 */
export async function downloadVeoVideo(
  result: VeoPollResult
): Promise<VeoDownloadResult> {
  if (!result.video) {
    throw new Error("No video in result");
  }

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const filename = `veo_${timestamp}_${randomId}.mp4`;
  const outputPath = path.join(VIDEO_DIR, filename);

  // Ensure video directory exists
  if (!fs.existsSync(VIDEO_DIR)) {
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
  }

  if (result.video.bytesBase64Encoded) {
    // Direct base64 - decode and save
    const buffer = Buffer.from(result.video.bytesBase64Encoded, "base64");
    fs.writeFileSync(outputPath, buffer);
  } else if (result.video.uri) {
    // GCS URI - download via HTTPS
    const { accessToken } = await getGoogleAccessToken();
    const videoData = await downloadFromGcs(result.video.uri, accessToken);
    fs.writeFileSync(outputPath, videoData);
  } else {
    throw new Error("No video data or URI in result");
  }

  // Get video duration via ffprobe
  const duration = await getVideoDuration(outputPath);

  return {
    filename,
    path: `/video/${filename}`,
    duration,
  };
}

/**
 * Download file from GCS URI
 */
async function downloadFromGcs(
  gcsUri: string,
  accessToken: string
): Promise<Buffer> {
  // Convert gs://bucket/path to https://storage.googleapis.com/bucket/path
  const httpsUrl = gcsUri.replace(
    /^gs:\/\/([^/]+)\/(.+)$/,
    "https://storage.googleapis.com/$1/$2"
  );

  const response = await fetch(httpsUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download from GCS: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(filepath: string): Promise<number | null> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filepath}"`
    );
    return parseFloat(stdout.trim());
  } catch {
    return null;
  }
}
