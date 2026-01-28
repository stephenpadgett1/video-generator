import fs from "fs";
import path from "path";
import { getGoogleAccessToken, buildVertexUrl } from "./google-auth.js";
import { GENERATED_IMAGES_DIR } from "../utils/paths.js";

/**
 * Available image generation models
 *
 * Imagen models use :predict endpoint with instances/parameters format
 * Gemini models use :generateContent endpoint with contents format + responseModalities
 *
 * Model reference:
 * - imagen-3.0-generate-002: Imagen 3 text-to-image (default), max 1024px
 * - imagen-3.0-capability-001: Imagen 3 edit/inpaint
 * - imagen-4.0-generate-001: Imagen 4, improved quality, max 2048px
 * - gemini-2.5-flash-image: Nano Banana Flash, speed optimized, max 1024px
 * - gemini-3-pro-image-preview: Nano Banana Pro, highest quality, 4K, reasoning
 */
export type ImageModel =
  | "imagen-3.0-generate-002" // Imagen 3 text-to-image (default)
  | "imagen-3.0-capability-001" // Imagen 3 edit/inpaint
  | "imagen-4.0-generate-001" // Imagen 4 (improved quality, 2048px)
  | "gemini-2.5-flash-image" // Nano Banana Flash (speed optimized)
  | "gemini-3-pro-image-preview"; // Nano Banana Pro (highest quality, 4K)

const DEFAULT_IMAGE_MODEL: ImageModel = "imagen-3.0-generate-002";

export interface ImagenGenerateOptions {
  prompt: string;
  aspectRatio?: string;
  outputFilename?: string;
  model?: ImageModel;
}

export interface ImagenGenerateResult {
  filename: string;
  path: string;
  model: ImageModel;
}

export interface ImageEditOptions {
  sourceImagePath: string;
  prompt: string;
  maskPath?: string;
  editMode?: "inpaint-insert" | "inpaint-remove" | "outpaint" | "bgswap";
  outputFilename?: string;
}

export interface ImageEditResult {
  filename: string;
  path: string;
  model: ImageModel;
}

/**
 * Check if a model is Imagen-based (uses :predict endpoint)
 */
function isImagenModel(model: ImageModel): boolean {
  return model.startsWith("imagen-");
}

/**
 * Models that require the global endpoint instead of regional endpoints.
 * gemini-3-pro-image-preview is only available on global, not us-central1.
 */
const GLOBAL_ONLY_MODELS: ImageModel[] = ["gemini-3-pro-image-preview"];

/**
 * Get the appropriate Vertex AI location for a model.
 * Most models work with us-central1, but some require global.
 */
function getModelLocation(model: ImageModel): string {
  return GLOBAL_ONLY_MODELS.includes(model) ? "global" : "us-central1";
}

/**
 * Read image file and return base64 encoded string
 */
function readImageAsBase64(imagePath: string): string {
  const resolvedPath = path.isAbsolute(imagePath)
    ? imagePath
    : path.resolve(imagePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Image file not found: ${resolvedPath}`);
  }

  const buffer = fs.readFileSync(resolvedPath);
  return buffer.toString("base64");
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return mimeTypes[ext] || "image/png";
}

/**
 * Generate an image using Imagen models via :predict endpoint
 */
async function generateWithImagen(
  prompt: string,
  aspectRatio: string,
  model: ImageModel,
  accessToken: string,
  projectId: string
): Promise<string> {
  const requestBody = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio,
    },
  };

  const url = buildVertexUrl(projectId, model, "predict");

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
    throw new Error(`Imagen API error (${model}): ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    predictions?: Array<{ bytesBase64Encoded?: string }>;
  };

  const base64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!base64) {
    throw new Error(`No image data in ${model} response`);
  }

  return base64;
}

/**
 * Generate an image using Gemini models via :generateContent endpoint
 */
async function generateWithGemini(
  prompt: string,
  aspectRatio: string,
  model: ImageModel,
  accessToken: string,
  projectId: string
): Promise<string> {
  // Gemini uses imageConfig for aspect ratio and resolution
  // Supported ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      temperature: 1.0,
      imageConfig: {
        aspectRatio: aspectRatio,
      },
    },
  };

  const location = getModelLocation(model);
  const url = buildVertexUrl(projectId, model, "generateContent", location);

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
    throw new Error(`Gemini API error (${model}): ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: { mimeType: string; data: string };
        }>;
      };
    }>;
  };

  // Find the image part in the response
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    throw new Error(`No image data in ${model} response`);
  }

  return imagePart.inlineData.data;
}

/**
 * Generate an image using the specified model (Imagen or Gemini)
 */
export async function generateImage(
  options: ImagenGenerateOptions
): Promise<ImagenGenerateResult> {
  const { accessToken, projectId } = await getGoogleAccessToken();
  const { prompt, aspectRatio = "9:16", outputFilename, model = DEFAULT_IMAGE_MODEL } = options;

  let base64: string;

  if (isImagenModel(model)) {
    base64 = await generateWithImagen(prompt, aspectRatio, model, accessToken, projectId);
  } else {
    base64 = await generateWithGemini(prompt, aspectRatio, model, accessToken, projectId);
  }

  // Ensure output directory exists
  if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
    fs.mkdirSync(GENERATED_IMAGES_DIR, { recursive: true });
  }

  // Generate filename if not provided
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const filename = outputFilename || `frame_${timestamp}_${randomId}.png`;
  const outputPath = path.join(GENERATED_IMAGES_DIR, filename);

  // Save image
  const buffer = Buffer.from(base64, "base64");
  fs.writeFileSync(outputPath, buffer);

  return {
    filename,
    path: `generated-images/${filename}`,
    model,
  };
}

/**
 * Edit an image using Imagen capability model for inpainting/editing
 *
 * Supports:
 * - inpaint-insert: Add new content to masked area
 * - inpaint-remove: Remove content from masked area
 * - outpaint: Extend the image beyond its boundaries
 * - bgswap: Replace background while preserving foreground
 */
export async function editImage(
  options: ImageEditOptions
): Promise<ImageEditResult> {
  const { accessToken, projectId } = await getGoogleAccessToken();
  const {
    sourceImagePath,
    prompt,
    maskPath,
    editMode = "inpaint-insert",
    outputFilename,
  } = options;

  const model: ImageModel = "imagen-3.0-capability-001";

  // Read source image
  const sourceBase64 = readImageAsBase64(sourceImagePath);

  // Build referenceImages array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const referenceImages: any[] = [
    {
      referenceType: "REFERENCE_TYPE_RAW",
      referenceId: 1,
      referenceImage: {
        bytesBase64Encoded: sourceBase64,
      },
    },
  ];

  // Add mask if provided
  if (maskPath) {
    const maskBase64 = readImageAsBase64(maskPath);
    referenceImages.push({
      referenceType: "REFERENCE_TYPE_MASK",
      referenceId: 2,
      referenceImage: {
        bytesBase64Encoded: maskBase64,
      },
      maskImageConfig: {
        maskMode: "MASK_MODE_USER_PROVIDED",
        dilation: 0.01,
      },
    });
  }

  // Map friendly mode names to API values
  const editModeMap: Record<string, string> = {
    "inpaint-insert": "EDIT_MODE_INPAINT_INSERTION",
    "inpaint-remove": "EDIT_MODE_INPAINT_REMOVAL",
    "outpaint": "EDIT_MODE_OUTPAINT",
    "bgswap": "EDIT_MODE_BGSWAP",
  };
  const apiEditMode = editModeMap[editMode] || "EDIT_MODE_INPAINT_INSERTION";

  const requestBody = {
    instances: [
      {
        prompt,
        referenceImages,
      },
    ],
    parameters: {
      sampleCount: 1,
      editMode: apiEditMode,
    },
  };

  const url = buildVertexUrl(projectId, model, "predict");

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
    throw new Error(`Imagen Edit API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    predictions?: Array<{ bytesBase64Encoded?: string }>;
  };

  const base64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!base64) {
    throw new Error("No image data in Imagen Edit response");
  }

  // Ensure output directory exists
  if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
    fs.mkdirSync(GENERATED_IMAGES_DIR, { recursive: true });
  }

  // Generate filename if not provided
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const filename = outputFilename || `edited_${timestamp}_${randomId}.png`;
  const outputPath = path.join(GENERATED_IMAGES_DIR, filename);

  // Save image
  const buffer = Buffer.from(base64, "base64");
  fs.writeFileSync(outputPath, buffer);

  return {
    filename,
    path: `generated-images/${filename}`,
    model,
  };
}
