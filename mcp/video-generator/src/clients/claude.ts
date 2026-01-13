import { loadConfig } from "../utils/config.js";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
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
  const apiKey = config.anthropicKey;

  if (!apiKey) {
    throw new Error("anthropicKey not configured in data/config.json");
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
      "x-api-key": apiKey,
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
