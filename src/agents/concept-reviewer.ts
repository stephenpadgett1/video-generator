/**
 * Concept Reviewer Agent
 *
 * Reviews a video concept and provides feedback on:
 * - Clarity and coherence
 * - Visual feasibility for AI video generation
 * - Suggestions for improvement
 *
 * Usage:
 *   npx tsx concept-reviewer.ts "A robot walks through a neon-lit city at night"
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load API key from project config
function getApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  const configPath = resolve(__dirname, "../../data/config.json");
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    if (config.claudeKey) {
      return config.claudeKey;
    }
  } catch {
    // Fall through to error
  }

  throw new Error("No API key found. Set ANTHROPIC_API_KEY or configure claudeKey in data/config.json");
}

const SYSTEM_PROMPT = `You are a video production expert specializing in AI-generated video.
Your job is to review video concepts and provide constructive feedback.

When reviewing a concept, consider:
1. CLARITY - Is the visual description specific enough for AI video generation?
2. FEASIBILITY - Can current AI video models (like Veo) render this well?
3. MOOD/TONE - Is the emotional intent clear?
4. PACING - Does it suggest appropriate energy/tension levels?

Known limitations of AI video generation:
- VFX-heavy prompts (neon, hologram, glowing) often fail
- Complex physics is unreliable
- Character consistency is challenging without locking
- Abstract concepts need concrete visual anchors

Provide specific, actionable suggestions. Be direct and concise.`;

async function reviewConcept(concept: string): Promise<void> {
  const client = new Anthropic({ apiKey: getApiKey() });

  console.log("Reviewing concept...\n");
  console.log(`"${concept}"\n`);
  console.log("---\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Review this video concept:\n\n"${concept}"`
      }
    ]
  });

  for (const block of response.content) {
    if (block.type === "text") {
      console.log(block.text);
    }
  }
}

// CLI entry point
const concept = process.argv.slice(2).join(" ");

if (!concept) {
  console.log("Usage: npx tsx concept-reviewer.ts <concept>");
  console.log('Example: npx tsx concept-reviewer.ts "A robot walks through a neon-lit city"');
  process.exit(1);
}

reviewConcept(concept).catch(console.error);
