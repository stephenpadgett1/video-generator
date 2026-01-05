/**
 * Project Reviewer Agent
 *
 * Evaluates video-producer agent decisions without seeing the video.
 * Reviews interpretation, structure, and feasibility.
 * Uses Agent SDK for full project context and tool access.
 *
 * Usage:
 *   npx tsx project-reviewer.ts <project_id or path>
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, readdirSync } from "fs";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");
const PROJECTS_DIR = resolve(PROJECT_ROOT, "data/projects");

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

async function reviewProject(project: object): Promise<void> {
  console.log("Reviewing project...\n");

  for await (const message of query({
    prompt: `You are reviewing the creative decisions made by an AI video production agent.

Given this project structure, evaluate the agent's choices. Be direct and specific.

PROJECT:
${JSON.stringify(project, null, 2)}

Consider (use your knowledge from CLAUDE.md about Veo limitations):
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

Be concise. Focus on actionable observations.`,
    options: {
      settingSources: ["project"],
      cwd: PROJECT_ROOT
    }
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block && block.text) {
          console.log(block.text);
        }
      }
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
