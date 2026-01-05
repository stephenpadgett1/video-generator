/**
 * QA Reviewer Agent
 *
 * AI-powered quality assurance for video generation projects.
 * Uses Agent SDK with full project context to evaluate:
 * - Pre-generation: project structure, narrative, Veo feasibility
 * - Post-generation: visual coherence, emotional impact (with video paths)
 *
 * Usage:
 *   npx tsx qa-reviewer.ts <project.json>               # Pre-gen review
 *   npx tsx qa-reviewer.ts <project.json> --video <dir> # Post-gen review
 *   npx tsx qa-reviewer.ts --project-id <id>            # Review by ID
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, readdirSync, existsSync } from "fs";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";
import type { Project } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");
const PROJECTS_DIR = resolve(PROJECT_ROOT, "data/projects");
const VIDEO_DIR = resolve(PROJECT_ROOT, "data/video");

interface QAResult {
  stage: "pre-generation" | "post-generation";
  pass: boolean;
  scores: {
    structural: number;
    narrative: number;
    feasibility: number;
    audio: number;
    visual?: number;
    emotional?: number;
  };
  issues: string[];
  suggestions: string[];
}

function loadProject(idOrPath: string): Project {
  // Try as direct path first
  if (existsSync(idOrPath)) {
    return JSON.parse(readFileSync(idOrPath, "utf-8"));
  }

  // Try as project ID
  const files = readdirSync(PROJECTS_DIR).filter(f => f.includes(idOrPath));
  if (files.length === 0) {
    throw new Error(`No project found matching: ${idOrPath}`);
  }
  return JSON.parse(readFileSync(join(PROJECTS_DIR, files[0]), "utf-8"));
}

function findVideosForProject(projectId: string): string[] {
  if (!existsSync(VIDEO_DIR)) return [];

  return readdirSync(VIDEO_DIR)
    .filter(f => f.includes(projectId) && f.endsWith('.mp4'))
    .map(f => join(VIDEO_DIR, f));
}

async function reviewPreGeneration(project: Project): Promise<QAResult> {
  console.log("\n=== Pre-Generation QA Review ===\n");
  console.log(`Project: ${project.project_id}`);
  console.log(`Concept: ${project.concept.slice(0, 80)}...`);
  console.log(`Shots: ${project.shots?.length || 0}`);
  console.log("");

  let result: QAResult | null = null;

  for await (const message of query({
    prompt: `You are a QA reviewer for an AI video generation system. Review this project BEFORE video generation.

PROJECT:
${JSON.stringify(project, null, 2)}

Evaluate using your knowledge from CLAUDE.md about:
- Veo limitations (VFX risks, character consistency, physics)
- Narrative model (energy/tension/mood independence)
- Arc types and their expected curves
- Production style constraints
- Audio/VO timing rules

For each dimension, score 0-1:
- structural: Required fields present, valid references, proper types
- narrative: Arc curve matches type, mood flow coherent, energy/tension logic
- feasibility: No VFX risks, concrete descriptions, achievable prompts
- audio: VO timing feasible, voice settings appropriate

Respond with ONLY a JSON object:
{
  "stage": "pre-generation",
  "pass": <true if all scores >= 0.7 and no critical issues>,
  "scores": {
    "structural": <0-1>,
    "narrative": <0-1>,
    "feasibility": <0-1>,
    "audio": <0-1>
  },
  "issues": ["<specific issue 1>", "<issue 2>"],
  "suggestions": ["<actionable improvement 1>", "<improvement 2>"]
}`,
    options: {
      settingSources: ["project"],
      cwd: PROJECT_ROOT
    }
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block && block.text) {
          try {
            const jsonMatch = block.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              result = JSON.parse(jsonMatch[0]);
            }
          } catch { /* continue */ }
        }
      }
    }
  }

  if (!result) {
    throw new Error("Failed to get QA review result");
  }

  return result;
}

async function reviewPostGeneration(project: Project, videoPaths: string[]): Promise<QAResult> {
  console.log("\n=== Post-Generation QA Review ===\n");
  console.log(`Project: ${project.project_id}`);
  console.log(`Concept: ${project.concept.slice(0, 80)}...`);
  console.log(`Videos found: ${videoPaths.length}`);
  videoPaths.forEach(v => console.log(`  - ${v}`));
  console.log("");

  // Build video info for context (without actual video content since SDK can't process video)
  const videoInfo = videoPaths.map(p => {
    const filename = p.split(/[/\\]/).pop() || "";
    const shotMatch = filename.match(/shot[_-]?(\d+)/i);
    return {
      path: p,
      filename,
      shot: shotMatch ? parseInt(shotMatch[1]) : null
    };
  });

  let result: QAResult | null = null;

  for await (const message of query({
    prompt: `You are a QA reviewer for an AI video generation system. Review this project AFTER video generation.

PROJECT:
${JSON.stringify(project, null, 2)}

GENERATED VIDEOS:
${JSON.stringify(videoInfo, null, 2)}

Since you cannot view the videos directly, evaluate based on:
1. Whether the expected number of videos were generated
2. Project structure quality (pre-gen checks still apply)
3. Narrative and audio planning quality

For post-gen specific assessments, provide your best evaluation of:
- visual: Based on shot descriptions and Veo feasibility analysis
- emotional: Based on mood/tension/energy progression design

Score 0-1 for each dimension:
- structural: Fields, references, video count matches shots
- narrative: Arc execution potential, mood flow
- feasibility: Were risky prompts likely to succeed?
- audio: VO coverage and timing
- visual: Description quality for visual coherence
- emotional: Designed emotional impact

Respond with ONLY a JSON object:
{
  "stage": "post-generation",
  "pass": <true if all scores >= 0.6>,
  "scores": {
    "structural": <0-1>,
    "narrative": <0-1>,
    "feasibility": <0-1>,
    "audio": <0-1>,
    "visual": <0-1>,
    "emotional": <0-1>
  },
  "issues": ["<specific issue 1>", "<issue 2>"],
  "suggestions": ["<actionable improvement 1>", "<improvement 2>"]
}`,
    options: {
      settingSources: ["project"],
      cwd: PROJECT_ROOT
    }
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block && block.text) {
          try {
            const jsonMatch = block.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              result = JSON.parse(jsonMatch[0]);
            }
          } catch { /* continue */ }
        }
      }
    }
  }

  if (!result) {
    throw new Error("Failed to get QA review result");
  }

  return result;
}

function printResult(result: QAResult) {
  console.log("\n" + "=".repeat(50));
  console.log(`Stage: ${result.stage}`);
  console.log(`Result: ${result.pass ? "PASS" : "FAIL"}`);
  console.log("=".repeat(50));

  console.log("\nScores:");
  for (const [key, value] of Object.entries(result.scores)) {
    if (value !== undefined) {
      const bar = "█".repeat(Math.round(value * 10)) + "░".repeat(10 - Math.round(value * 10));
      const status = value >= 0.7 ? "✓" : value >= 0.5 ? "~" : "✗";
      console.log(`  ${status} ${key.padEnd(12)} ${bar} ${value.toFixed(2)}`);
    }
  }

  if (result.issues.length > 0) {
    console.log("\nIssues:");
    result.issues.forEach(i => console.log(`  ✗ ${i}`));
  }

  if (result.suggestions.length > 0) {
    console.log("\nSuggestions:");
    result.suggestions.forEach(s => console.log(`  → ${s}`));
  }

  console.log("");
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`Usage:
  npx tsx qa-reviewer.ts <project.json>               # Pre-gen review
  npx tsx qa-reviewer.ts <project.json> --video <dir> # Post-gen review
  npx tsx qa-reviewer.ts --project-id <id>            # Review by ID`);
    process.exit(1);
  }

  // Parse arguments
  const projectIdIdx = args.indexOf("--project-id");
  const videoIdx = args.indexOf("--video");

  let project: Project;
  let videoPaths: string[] = [];

  if (projectIdIdx !== -1) {
    const projectId = args[projectIdIdx + 1];
    if (!projectId) {
      console.error("Missing project ID");
      process.exit(1);
    }
    project = loadProject(projectId);
    videoPaths = findVideosForProject(projectId);
  } else {
    const projectPath = args.find(a => !a.startsWith("--") && a !== args[videoIdx + 1]);
    if (!projectPath) {
      console.error("Missing project path");
      process.exit(1);
    }
    project = loadProject(projectPath);

    if (videoIdx !== -1) {
      const videoDir = args[videoIdx + 1];
      if (existsSync(videoDir)) {
        videoPaths = readdirSync(videoDir)
          .filter(f => f.endsWith('.mp4'))
          .map(f => join(videoDir, f));
      }
    } else {
      // Auto-find videos for this project
      videoPaths = findVideosForProject(project.project_id);
    }
  }

  // Decide review type
  const isPostGen = videoPaths.length > 0 || args.includes("--video");

  try {
    const result = isPostGen
      ? await reviewPostGeneration(project, videoPaths)
      : await reviewPreGeneration(project);

    printResult(result);

    // Exit with appropriate code
    process.exit(result.pass ? 0 : 1);
  } catch (err) {
    console.error("Review failed:", err);
    process.exit(1);
  }
}

main();
