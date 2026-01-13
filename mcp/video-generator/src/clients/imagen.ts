import fs from "fs";
import path from "path";
import { getGoogleAccessToken, buildVertexUrl } from "./google-auth.js";
import { GENERATED_IMAGES_DIR } from "../utils/paths.js";

const IMAGEN_MODEL = "imagen-3.0-generate-002";

export interface ImagenGenerateOptions {
  prompt: string;
  aspectRatio?: string;
  outputFilename?: string;
}

export interface ImagenGenerateResult {
  filename: string;
  path: string;
}

/**
 * Generate an image using Imagen 3.0
 */
export async function generateImage(
  options: ImagenGenerateOptions
): Promise<ImagenGenerateResult> {
  const { accessToken, projectId } = await getGoogleAccessToken();

  const { prompt, aspectRatio = "9:16", outputFilename } = options;

  const requestBody = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio,
    },
  };

  const url = buildVertexUrl(projectId, IMAGEN_MODEL, "predict");

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
    throw new Error(`Imagen API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    predictions?: Array<{ bytesBase64Encoded?: string }>;
  };

  const base64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!base64) {
    throw new Error("No image data in Imagen response");
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
  };
}
