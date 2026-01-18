import * as fs from "fs";
import * as path from "path";
import { loadConfig } from "../utils/config.js";
import { resolvePath } from "../utils/paths.js";

// ============================================================================
// Text-only message types (original)
// ============================================================================

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

// ============================================================================
// Multimodal message types (for vision)
// ============================================================================

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
    data: string;
  };
}

export type ContentBlock = TextContent | ImageContent;

export interface ClaudeMultimodalMessage {
  role: "user" | "assistant";
  content: ContentBlock[] | string;
}

// ============================================================================
// Rate limiting configuration
// ============================================================================

export interface RateLimitConfig {
  baseDelayMs: number;
  maxRetries: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  baseDelayMs: 1500,
  maxRetries: 5,
  backoffMultiplier: 2,
  maxDelayMs: 60000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRateLimit<T>(
  fn: () => Promise<T>,
  config: RateLimitConfig,
  attempt: number = 0
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const is429 = errorMessage.includes("429") || errorMessage.includes("rate");
    const isRetryable = is429 || errorMessage.includes("529") || errorMessage.includes("overloaded");

    if (isRetryable && attempt < config.maxRetries) {
      const delay = Math.min(
        config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelayMs
      );
      console.error(`Rate limited (attempt ${attempt + 1}/${config.maxRetries}), waiting ${delay}ms...`);
      await sleep(delay);
      return withRateLimit(fn, config, attempt + 1);
    }
    throw error;
  }
}

export interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Call Claude API with system prompt and messages
 */
export async function callClaude(options: {
  system: string;
  messages: ClaudeMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const config = loadConfig();
  const apiKey = (config.anthropicKey || config.claudeKey) as string | undefined;

  if (!apiKey) {
    throw new Error("anthropicKey or claudeKey not configured in data/config.json");
  }

  const {
    system,
    messages,
    model = "claude-opus-4-20250514",
    maxTokens = 2048,
    temperature = 0.7,
  } = options;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ClaudeResponse;
  const textContent = data.content.find((c) => c.type === "text");
  return textContent?.text || "";
}

/**
 * Parse JSON from Claude response (handles markdown code blocks)
 */
export function parseClaudeJson<T>(text: string): T {
  // Remove markdown code blocks if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return JSON.parse(cleaned.trim());
}

// ============================================================================
// Vision API support
// ============================================================================

/**
 * Load an image file as a base64-encoded content block for Claude Vision
 */
export function loadImageAsBase64(imagePath: string): ImageContent {
  const resolvedPath = resolvePath(imagePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Image not found: ${resolvedPath}`);
  }

  const data = fs.readFileSync(resolvedPath).toString("base64");
  const ext = path.extname(imagePath).toLowerCase();

  let mediaType: ImageContent["source"]["media_type"] = "image/png";
  if (ext === ".jpg" || ext === ".jpeg") mediaType = "image/jpeg";
  else if (ext === ".gif") mediaType = "image/gif";
  else if (ext === ".webp") mediaType = "image/webp";

  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data },
  };
}

/**
 * Call Claude API with multimodal (vision) support
 *
 * Supports images in messages via base64 encoding.
 * Includes rate limiting with exponential backoff.
 */
export async function callClaudeVision(options: {
  system: string;
  messages: ClaudeMultimodalMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  rateLimitConfig?: Partial<RateLimitConfig>;
}): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number } }> {
  const config = loadConfig();
  const apiKey = (config.anthropicKey || config.claudeKey) as string | undefined;

  if (!apiKey) {
    throw new Error("anthropicKey or claudeKey not configured in data/config.json");
  }

  const {
    system,
    messages,
    model = "claude-opus-4-5-20251101",
    maxTokens = 4096,
    temperature = 0.5,
    rateLimitConfig = {},
  } = options;

  const rateLimit: RateLimitConfig = {
    ...DEFAULT_RATE_LIMIT,
    ...rateLimitConfig,
  };

  const makeRequest = async () => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as ClaudeResponse;
    const textContent = data.content.find((c) => c.type === "text");
    return {
      text: textContent?.text || "",
      usage: data.usage,
    };
  };

  return withRateLimit(makeRequest, rateLimit);
}

/**
 * Analyze an image using Claude Vision (Opus 4.5)
 *
 * Uses Claude for accurate image analysis without hallucinating precision.
 * Preferred over Gemini for tasks requiring precise counting or detail verification.
 */
export async function analyzeImageWithClaude(options: {
  imagePath: string;
  prompt?: string;
}): Promise<string> {
  const {
    imagePath,
    prompt = "Describe this image briefly (2-3 sentences). Focus on the main subject, setting, and any notable visual details.",
  } = options;

  const imageContent = loadImageAsBase64(imagePath);

  const result = await callClaudeVision({
    system: "You are a precise image analyst. Describe exactly what you see. If asked to count items, count carefully and report accurately. If you cannot determine something with certainty, say so rather than guessing.",
    messages: [
      {
        role: "user",
        content: [imageContent, { type: "text", text: prompt }],
      },
    ],
    temperature: 0.2, // Lower temperature for more precise analysis
  });

  return result.text;
}
