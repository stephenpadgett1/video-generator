/**
 * Project Reviewer Agent
 *
 * Evaluates video-producer agent decisions without seeing the video.
 * Reviews interpretation, structure, and feasibility.
 *
 * Usage:
 *   npx tsx project-reviewer.ts <project_id or path>
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, readdirSync } from "fs";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = resolve(__dirname, "../../data/projects");

function getApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  const configPath = resolve(__dirname, "../../data/config.json");
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    if (config.claudeKey) return config.claudeKey;
  } catch { /* fall through */ }
  throw new Error("No API key found");
}

function loadProject(idOrPath: string): object {
  // Try as direct path first
  try {
    return JSON.parse(readFileSync(idOrPath, "utf-8"));
  } catch { /* try as project id */ }

  // Try as project ID
  const files = readdirSync(PROJECTS_DIR).filter(f => f.includes(idOrPath));
  if (files.length === 0) {
    throw new Error(`No project found matching: ${idOrPath}`);
  }
  return JSON.parse(readFileSync(join(PROJECTS_DIR, files[0]), "utf-8"));
}

const REVIEW_PROMPT = `You are reviewing the creative decisions made by an AI video production agent.

Given a project structure, evaluate the agent's choices. Be direct and specific.

Consider:
- Did the agent understand the original concept?
- Are the parameter choices (duration, arc, style) appropriate?
- Does the shot structure tell a coherent story?
- Is the energy/tension progression logical?
- Do the mood choices support the emotional intent?
- Are the shot descriptions specific enough for AI video generation?
- Are there any known risk factors (VFX, complex physics, abstract concepts)?

Provide:
1. A brief overall assessment (1-2 sentences)
2. What worked well (bullet points)
3. Potential issues (bullet points)
4. Suggestions for improvement (bullet points, if any)

Be concise. Focus on actionable observations.`;

async function reviewProject(project: object): Promise<void> {
  const client = new Anthropic({ apiKey: getApiKey() });

  console.log("Reviewing project...\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: REVIEW_PROMPT,
    messages: [{
      role: "user",
      content: `Review this project:\n\n${JSON.stringify(project, null, 2)}`
    }]
  });

  for (const block of response.content) {
    if (block.type === "text") {
      console.log(block.text);
    }
  }
}

// CLI
const target = process.argv[2];
if (!target) {
  // Review most recent project
  const files = readdirSync(PROJECTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log("No projects found. Run video-producer first.");
    process.exit(1);
  }

  console.log(`Reviewing most recent: ${files[0]}\n`);
  const project = JSON.parse(readFileSync(join(PROJECTS_DIR, files[0]), "utf-8"));
  reviewProject(project).catch(console.error);
} else {
  const project = loadProject(target);
  reviewProject(project).catch(console.error);
}
