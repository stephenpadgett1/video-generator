import fs from "fs";
import { getGoogleAccessToken, buildVertexUrl } from "./google-auth.js";
import { resolvePath } from "../utils/paths.js";

const GEMINI_MODEL = "gemini-2.5-flash";

export interface GeminiAnalysisOptions {
  imagePath: string;
  prompt?: string;
}

/**
 * Analyze an image using Gemini Vision
 */
export async function analyzeImageWithGemini(
  options: GeminiAnalysisOptions
): Promise<string> {
  const { accessToken, projectId } = await getGoogleAccessToken();

  const {
    imagePath,
    prompt = "Describe this image briefly (2-3 sentences). Focus on the main subject, setting, and any notable visual details.",
  } = options;

  const resolvedPath = resolvePath(imagePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Image not found: ${resolvedPath}`);
  }

  const base64Image = fs.readFileSync(resolvedPath).toString("base64");
  const mimeType = imagePath.toLowerCase().endsWith(".png")
    ? "image/png"
    : "image/jpeg";

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  };

  const url = buildVertexUrl(projectId, GEMINI_MODEL, "generateContent");

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
    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("");

  return text || "";
}

/**
 * Analyze a video using Gemini
 */
export async function analyzeVideoWithGemini(options: {
  videoPath: string;
  prompt: string;
}): Promise<string> {
  const { accessToken, projectId } = await getGoogleAccessToken();

  const resolvedPath = resolvePath(options.videoPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Video not found: ${resolvedPath}`);
  }

  const base64Video = fs.readFileSync(resolvedPath).toString("base64");

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "video/mp4", data: base64Video } },
          { text: options.prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  };

  const url = buildVertexUrl(projectId, GEMINI_MODEL, "generateContent");

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
    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("");

  return text || "";
}
