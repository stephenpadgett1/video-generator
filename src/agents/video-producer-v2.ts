/**
 * Video Producer Agent v2 - Using Claude Agent SDK
 *
 * Takes raw video ideas and produces finished videos.
 * Uses Agent SDK for interpretation (with full CLAUDE.md context).
 *
 * Usage:
 *   npx tsx video-producer-v2.ts                 # Process next idea
 *   npx tsx video-producer-v2.ts idea.txt        # Process specific file
 *   npx tsx video-producer-v2.ts --instructions "Be experimental"
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, unlinkSync, existsSync } from "fs";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";
import * as api from "./lib/api-client.js";
import type { Project, ArcType, ProductionStyle } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");
const SLUSH_DIR = resolve(PROJECT_ROOT, "data/slush-pile");
const DONE_DIR = resolve(SLUSH_DIR, "done");
const FAILED_DIR = resolve(SLUSH_DIR, "failed");
const IN_PROGRESS_DIR = resolve(SLUSH_DIR, "in-progress");

interface Checkpoint {
  ideaFile: string;
  ideaText: string;
  project: Project;
  jobIds: string[];
  submittedAt: string;
}

interface InterpretedIdea {
  duration: number;
  arc: ArcType;
  style: string;
  production_style: ProductionStyle;
  include_vo: boolean;
  reasoning: string;
}

function ensureDirectories() {
  for (const dir of [SLUSH_DIR, DONE_DIR, FAILED_DIR, IN_PROGRESS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

function getNextIdea(): string | null {
  if (!existsSync(SLUSH_DIR)) return null;
  const files = readdirSync(SLUSH_DIR).filter(f => f.endsWith('.txt') || f.endsWith('.md')).sort();
  return files[0] || null;
}

function moveFile(filename: string, success: boolean) {
  const src = join(SLUSH_DIR, filename);
  if (existsSync(src)) {
    renameSync(src, join(success ? DONE_DIR : FAILED_DIR, filename));
  }
}

function saveCheckpoint(cp: Checkpoint) {
  const filename = cp.ideaFile.replace(/\.(txt|md)$/, '') + '.json';
  writeFileSync(join(IN_PROGRESS_DIR, filename), JSON.stringify(cp, null, 2));
}

function loadCheckpoints(): Checkpoint[] {
  if (!existsSync(IN_PROGRESS_DIR)) return [];
  return readdirSync(IN_PROGRESS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(IN_PROGRESS_DIR, f), 'utf-8')));
}

function removeCheckpoint(ideaFile: string) {
  const filename = ideaFile.replace(/\.(txt|md)$/, '') + '.json';
  const path = join(IN_PROGRESS_DIR, filename);
  if (existsSync(path)) unlinkSync(path);
}

// Use Agent SDK for interpretation - gets full CLAUDE.md context
async function interpretIdea(ideaText: string, instructions?: string): Promise<InterpretedIdea> {
  console.log("\n[1/5] Interpreting idea (with project context)...");
  if (instructions) console.log(`  Instructions: ${instructions}`);

  const instructionBlock = instructions ? `\nAdditional guidance: ${instructions}\n` : "";

  let result: InterpretedIdea | null = null;

  for await (const message of query({
    prompt: `You are deciding production parameters for an AI video.
${instructionBlock}
VIDEO IDEA:
${ideaText}

Based on your knowledge of this project (from CLAUDE.md), decide on:
- duration (15-60 seconds)
- arc type (linear-build, tension-release, wave, flat-punctuate, bookend)
- style (cinematic guidance, 10-20 words)
- production_style (stage_play, documentary, music_video, noir, or null)
- include_vo (true if narration needed, false for visual-only)

Consider the Known Veo Limitations when making style choices.

Respond with ONLY a JSON object:
{
  "duration": <number>,
  "arc": "<arc_type>",
  "style": "<style_description>",
  "production_style": <"preset"|null>,
  "include_vo": <boolean>,
  "reasoning": "<1-2 sentences>"
}`,
    options: {
      allowedTools: [],  // No tools needed - just reasoning
      settingSources: ["project"],
      cwd: PROJECT_ROOT,
      maxTurns: 1
    }
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block && block.text) {
          try {
            // Extract JSON from response
            const jsonMatch = block.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              result = JSON.parse(jsonMatch[0]);
            }
          } catch { /* continue */ }
        }
      }
    }
  }

  if (!result) throw new Error("Failed to interpret idea");

  console.log(`  Duration: ${result.duration}s`);
  console.log(`  Arc: ${result.arc}`);
  console.log(`  Style: ${result.style}`);
  console.log(`  VO: ${result.include_vo}`);
  console.log(`  Reasoning: ${result.reasoning}`);

  return result;
}

// Decide on locking based on project structure
async function decideLocking(project: Project): Promise<{ characters: string[], environments: string[] }> {
  console.log("\n[2/5] Analyzing locking needs...");

  const charCounts = new Map<string, number>();
  const envCounts = new Map<string, number>();

  for (const shot of project.shots || []) {
    for (const charId of shot.characters || []) {
      charCounts.set(charId, (charCounts.get(charId) || 0) + 1);
    }
    if (shot.environment) {
      envCounts.set(shot.environment, (envCounts.get(shot.environment) || 0) + 1);
    }
  }

  const lockChars = [...charCounts.entries()].filter(([_, n]) => n >= 2).map(([id]) => id);
  const lockEnvs = [...envCounts.entries()].filter(([_, n]) => n >= 2).map(([id]) => id);

  console.log(`  Characters to lock: ${lockChars.join(", ") || "none"}`);
  console.log(`  Environments to lock: ${lockEnvs.join(", ") || "none"}`);

  return { characters: lockChars, environments: lockEnvs };
}

// Perform locking via API
async function performLocking(project: Project, toLock: { characters: string[], environments: string[] }): Promise<Project> {
  if (toLock.characters.length === 0 && toLock.environments.length === 0) return project;

  console.log("\n[3/5] Locking characters/environments...");

  const chars = [...(project.characters || [])];
  const envs = [...(project.environments || [])];

  for (const charId of toLock.characters) {
    const idx = chars.findIndex(c => c.id === charId);
    if (idx !== -1) {
      console.log(`  Locking: ${charId}`);
      chars[idx] = await api.lockCharacter(chars[idx], project.style);
    }
  }

  for (const envId of toLock.environments) {
    const idx = envs.findIndex(e => e.id === envId);
    if (idx !== -1) {
      console.log(`  Locking: ${envId}`);
      envs[idx] = await api.lockEnvironment(envs[idx], project.style);
    }
  }

  return { ...project, characters: chars, environments: envs };
}

// Select voice using Agent SDK (with context)
async function selectVoice(project: Project): Promise<string | undefined> {
  if (!project.shots?.some(s => s.vo)) return undefined;

  console.log("\n[4/5] Selecting voice...");

  const voices = await api.getVoices();
  const voiceList = voices.slice(0, 15).map(v => `${v.voice_id}: ${v.name}`).join("\n");
  const sampleVo = project.shots.filter(s => s.vo).map(s => s.vo!.text).join(" | ").slice(0, 200);

  let voiceId: string | undefined;

  for await (const message of query({
    prompt: `Select the best voice for this video's narration.

CONCEPT: ${project.concept}
STYLE: ${project.style || "cinematic"}
SAMPLE VO: ${sampleVo}

AVAILABLE VOICES:
${voiceList}

Respond with ONLY the voice_id (nothing else).`,
    options: {
      allowedTools: [],
      settingSources: ["project"],
      cwd: PROJECT_ROOT,
      maxTurns: 1
    }
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block && block.text) {
          const match = block.text.match(/[a-zA-Z0-9]{20,}/);
          if (match) voiceId = match[0];
        }
      }
    }
  }

  if (voiceId) console.log(`  Selected: ${voiceId}`);
  return voiceId;
}

// Check job status
async function checkJobs(jobIds: string[]): Promise<{ done: boolean; completed: number; failed: string[] }> {
  let completed = 0;
  const failed: string[] = [];

  for (const jobId of jobIds) {
    try {
      const job = await api.getJob(jobId);
      if (job.status === 'complete') completed++;
      else if (job.status === 'error') failed.push(jobId);
    } catch { /* still pending */ }
  }

  return {
    done: completed === jobIds.length,
    completed,
    failed
  };
}

// Resume from checkpoint
async function resumeCheckpoint(cp: Checkpoint): Promise<string | null> {
  console.log(`\nResuming: ${cp.ideaFile}`);

  const status = await checkJobs(cp.jobIds);
  console.log(`  Jobs: ${status.completed}/${cp.jobIds.length} complete`);

  if (status.failed.length > 0) {
    throw new Error(`Jobs failed: ${status.failed.join(", ")}`);
  }

  if (!status.done) {
    console.log("  Still processing...");
    return null;
  }

  console.log("  All complete - assembling...");

  const voiceId = await selectVoice(cp.project);
  const result = await api.assemble({
    project_id: cp.project.project_id,
    voice_id: voiceId,
    outputFilename: `${cp.project.project_id}.mp4`
  });

  removeCheckpoint(cp.ideaFile);
  moveFile(cp.ideaFile, true);

  return result.path;
}

// Main production flow
async function produce(ideaFile: string, instructions?: string): Promise<string | null> {
  const ideaText = readFileSync(join(SLUSH_DIR, ideaFile), "utf-8").trim();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing: ${ideaFile}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\n${ideaText}\n`);

  if (!await api.healthCheck()) {
    throw new Error("Server not running. Start with: npm start");
  }

  // Interpret with SDK (gets CLAUDE.md context)
  const params = await interpretIdea(ideaText, instructions);

  // Generate project via API
  console.log("\n[2/5] Generating project...");
  let project = await api.generateProject({
    concept: ideaText,
    duration: params.duration,
    arc: params.arc,
    style: params.style,
    include_vo: params.include_vo,
    production_style: params.production_style
  });
  console.log(`  Project: ${project.project_id}`);
  console.log(`  Shots: ${project.shots?.length || 0}`);

  // Lock if needed
  const toLock = await decideLocking(project);
  project = await performLocking(project, toLock);

  // Execute
  console.log("\n[4/5] Submitting to Veo...");
  const execution = await api.executeProject(project);
  console.log(`  Submitted ${execution.jobs.length} jobs`);

  // Checkpoint
  saveCheckpoint({
    ideaFile,
    ideaText,
    project,
    jobIds: execution.jobs.map(j => j.job_id),
    submittedAt: new Date().toISOString()
  });

  console.log("\n[5/5] Checkpointed - run again to check status");
  return null;
}

// CLI
async function main() {
  ensureDirectories();
  const args = process.argv.slice(2);

  // Parse --instructions
  const instIdx = args.indexOf("--instructions");
  const instructions = instIdx !== -1 ? args[instIdx + 1] : undefined;

  // Check in-progress first
  const checkpoints = loadCheckpoints();
  if (checkpoints.length > 0) {
    console.log(`\nChecking ${checkpoints.length} in-progress job(s)...`);
    for (const cp of checkpoints) {
      try {
        const result = await resumeCheckpoint(cp);
        if (result) console.log(`\nCOMPLETE: ${result}`);
      } catch (err) {
        console.error(`Failed: ${cp.ideaFile}`, err);
        removeCheckpoint(cp.ideaFile);
        moveFile(cp.ideaFile, false);
      }
    }
    if (loadCheckpoints().length > 0) {
      console.log("\nJobs still processing. Run again later.");
      return;
    }
  }

  // Process new idea
  const specificFile = args.find(a => !a.startsWith("--") && a !== instructions);
  const ideaFile = specificFile || getNextIdea();

  if (!ideaFile) {
    console.log("No ideas in slush pile.");
    return;
  }

  try {
    await produce(ideaFile, instructions);
  } catch (err) {
    console.error(`Failed: ${ideaFile}`, err);
    moveFile(ideaFile, false);
    process.exit(1);
  }
}

main().catch(console.error);
