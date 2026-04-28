import fs from "fs";
import path from "path";
import { getGoogleAccessToken, buildVertexUrl } from "./google-auth.js";
import {
  uploadFileToGcs,
  buildObjectName,
  inferImageMimeType,
} from "./gcs.js";
import { VIDEO_DIR, resolvePath } from "../utils/paths.js";
import { loadConfig } from "../utils/config.js";

const VEO_MODEL_DEFAULT = "veo-3.1-generate-001";

export const VEO_MODELS = {
  "veo-3.1": "veo-3.1-generate-preview",
  "veo-3.1-prod": "veo-3.1-generate-001",
  "veo-3.1-fast": "veo-3.1-fast-generate-preview",
  "veo-3.1-fast-prod": "veo-3.1-fast-generate-001",
  "veo-2.0": "veo-2.0-generate-001",
} as const;

export type VeoModelAlias = keyof typeof VEO_MODELS;

export interface VeoSubmitOptions {
  prompt: string;
  aspectRatio?: string;
  durationSeconds?: number;
  firstFramePath?: string;
  lastFramePath?: string;
  model?: VeoModelAlias;
  seed?: number;
  generateAudio?: boolean;
  resolution?: "720p" | "1080p" | "4k";
}

export interface VeoSubmitResult {
  operationName: string;
  model: string;
  seed?: number;
}

export interface VeoPollResult {
  done: boolean;
  operationName: string;
  video?: {
    bytesBase64Encoded?: string;
    uri?: string;
    gcsUri?: string;
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
 * Load image as base64 (fallback path when GCS bucket is not configured)
 */
function loadImageBase64(imagePath: string): string {
  const resolved = resolvePath(imagePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Image not found: ${resolved}`);
  }
  return fs.readFileSync(resolved).toString("base64");
}

async function buildImageField(
  imagePath: string,
  bucket: string | undefined,
  gcsPrefix: string
): Promise<Record<string, string>> {
  const mimeType = inferImageMimeType(imagePath);
  if (bucket) {
    const objectName = buildObjectName(gcsPrefix, imagePath);
    const gcsUri = await uploadFileToGcs(imagePath, bucket, objectName, mimeType);
    return { gcsUri, mimeType };
  }
  return {
    bytesBase64Encoded: loadImageBase64(imagePath),
    mimeType,
  };
}

/**
 * Submit a video generation request to Veo
 * Returns operation name for polling
 */
export async function submitVeoGeneration(
  options: VeoSubmitOptions
): Promise<VeoSubmitResult> {
  const { accessToken, projectId } = await getGoogleAccessToken();
  const bucket = loadConfig().veoGcsBucket;

  const {
    prompt,
    aspectRatio = "9:16",
    durationSeconds = 8,
    firstFramePath,
    lastFramePath,
    model,
    seed,
    generateAudio,
    resolution,
  } = options;

  const validDuration = snapDuration(durationSeconds);
  const modelId = model ? VEO_MODELS[model] : VEO_MODEL_DEFAULT;

  // Generate a random seed if none provided, so we can replay later
  const effectiveSeed = seed ?? Math.floor(Math.random() * 4294967295);

  // Build instance with optional reference frames
  const instance: Record<string, unknown> = { prompt };

  if (firstFramePath) {
    instance.image = await buildImageField(
      firstFramePath,
      bucket,
      "veo-inputs/image"
    );
  }

  if (lastFramePath) {
    instance.lastFrame = await buildImageField(
      lastFramePath,
      bucket,
      "veo-inputs/last-frame"
    );
  }

  const parameters: Record<string, unknown> = {
    aspectRatio,
    durationSeconds: validDuration,
    seed: effectiveSeed,
  };

  // generateAudio is supported on Veo 3+ models
  if (generateAudio !== undefined) {
    parameters.generateAudio = generateAudio;
  }

  // Resolution: 720p, 1080p, 4k (4k only on 3.1 preview models)
  if (resolution) {
    parameters.resolution = resolution;
  }

  // storageUri tells Veo to write the output MP4 to GCS and return a URI,
  // instead of returning a multi-MB base64-encoded video inline.
  if (bucket) {
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    parameters.storageUri = `gs://${bucket}/veo-outputs/${stamp}-${rand}/`;
  }

  const requestBody = {
    instances: [instance],
    parameters,
  };

  const url = buildVertexUrl(projectId, modelId, "predictLongRunning");

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
  return { operationName: data.name, model: modelId, seed: effectiveSeed };
}

/**
 * Poll Veo operation status
 */
export async function pollVeoOperation(
  operationName: string,
  modelId?: string
): Promise<VeoPollResult> {
  const { accessToken, projectId } = await getGoogleAccessToken();

  // Extract model from operation name if not provided (e.g. .../models/veo-3.1-generate-001/operations/...)
  if (!modelId) {
    const match = operationName.match(/models\/([^/]+)\/operations/);
    if (match) modelId = match[1];
  }

  const url = buildVertexUrl(projectId, modelId || VEO_MODEL_DEFAULT, "fetchPredictOperation");

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
    response?: { videos?: Array<{ bytesBase64Encoded?: string; uri?: string; gcsUri?: string }> };
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

  const gcsUri = result.video.gcsUri || result.video.uri;
  if (result.video.bytesBase64Encoded) {
    const buffer = Buffer.from(result.video.bytesBase64Encoded, "base64");
    fs.writeFileSync(outputPath, buffer);
  } else if (gcsUri) {
    const { accessToken } = await getGoogleAccessToken();
    const videoData = await downloadFromGcs(gcsUri, accessToken);
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
