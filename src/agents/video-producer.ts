/**
 * Autonomous Video Producer Agent
 *
 * Takes raw video ideas from slush pile and produces finished videos.
 *
 * Usage:
 *   npx tsx video-producer.ts                 # Process next idea or check in-progress
 *   npx tsx video-producer.ts idea.txt        # Process specific file
 *   npx tsx video-producer.ts --all           # Process entire queue
 *   npx tsx video-producer.ts --status        # Check status of in-progress jobs
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, unlinkSync, existsSync } from "fs";
import { dirname, resolve, basename, join } from "path";
import { fileURLToPath } from "url";
import * as api from "./lib/api-client.js";
import type { InterpretedIdea, Project, Character, Environment, VoiceSelection, ElevenLabsVoice, Job } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SLUSH_DIR = resolve(__dirname, "../../data/slush-pile");
const DONE_DIR = resolve(__dirname, "../../data/slush-pile/done");
const FAILED_DIR = resolve(__dirname, "../../data/slush-pile/failed");
const IN_PROGRESS_DIR = resolve(__dirname, "../../data/slush-pile/in-progress");

interface Checkpoint {
  ideaFile: string;
  ideaText: string;
  project: Project;
  jobIds: string[];
  voiceId?: string;
  submittedAt: string;
}

// Load API key from project config
function getApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  const configPath = resolve(__dirname, "../../data/config.json");
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    if (config.claudeKey) return config.claudeKey;
  } catch { /* fall through */ }
  throw new Error("No API key found. Set ANTHROPIC_API_KEY or configure claudeKey in data/config.json");
}

const claude = new Anthropic({ apiKey: getApiKey() });

// Ensure directories exist
function ensureDirectories() {
  for (const dir of [SLUSH_DIR, DONE_DIR, FAILED_DIR, IN_PROGRESS_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

// Checkpoint management
function saveCheckpoint(checkpoint: Checkpoint) {
  const filename = basename(checkpoint.ideaFile, '.txt').replace(/\.md$/, '') + '.json';
  const path = join(IN_PROGRESS_DIR, filename);
  writeFileSync(path, JSON.stringify(checkpoint, null, 2));
  console.log(`  Checkpoint saved: ${filename}`);
}

function loadCheckpoints(): Checkpoint[] {
  if (!existsSync(IN_PROGRESS_DIR)) return [];
  return readdirSync(IN_PROGRESS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(IN_PROGRESS_DIR, f), 'utf-8')) as Checkpoint);
}

function removeCheckpoint(ideaFile: string) {
  const filename = basename(ideaFile, '.txt').replace(/\.md$/, '') + '.json';
  const path = join(IN_PROGRESS_DIR, filename);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

// Get next idea file from slush pile
function getNextIdea(): string | null {
  if (!existsSync(SLUSH_DIR)) return null;
  const files = readdirSync(SLUSH_DIR)
    .filter(f => f.endsWith('.txt') || f.endsWith('.md'))
    .sort();
  return files[0] || null;
}

// Move file to done/failed directory
function moveFile(filename: string, success: boolean) {
  const src = join(SLUSH_DIR, filename);
  if (existsSync(src)) {
    const dest = join(success ? DONE_DIR : FAILED_DIR, filename);
    renameSync(src, dest);
  }
}

// Check job statuses for a checkpoint
async function checkJobStatuses(jobIds: string[]): Promise<{
  allComplete: boolean;
  anyFailed: boolean;
  completed: number;
  pending: number;
  failed: string[];
}> {
  let completed = 0;
  let pending = 0;
  const failed: string[] = [];

  for (const jobId of jobIds) {
    try {
      const job = await api.getJob(jobId);
      if (job.status === 'complete') {
        completed++;
      } else if (job.status === 'error') {
        failed.push(jobId);
      } else {
        pending++;
      }
    } catch (err) {
      pending++; // Assume still processing if we can't reach server
    }
  }

  return {
    allComplete: completed === jobIds.length,
    anyFailed: failed.length > 0,
    completed,
    pending,
    failed,
  };
}

// Resume from checkpoint - returns final video path if complete, null if still pending
async function resumeFromCheckpoint(checkpoint: Checkpoint): Promise<string | null> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Resuming: ${checkpoint.ideaFile}`);
  console.log(`Submitted: ${checkpoint.submittedAt}`);
  console.log(`${"=".repeat(60)}`);

  const status = await checkJobStatuses(checkpoint.jobIds);

  console.log(`\nJob status: ${status.completed}/${checkpoint.jobIds.length} complete, ${status.pending} pending`);

  if (status.anyFailed) {
    console.log(`  Failed jobs: ${status.failed.join(', ')}`);
    throw new Error(`Jobs failed: ${status.failed.join(', ')}`);
  }

  if (!status.allComplete) {
    console.log(`  Still waiting for ${status.pending} jobs...`);
    return null; // Not ready yet
  }

  console.log(`  All jobs complete! Proceeding to assembly...`);

  // All done - proceed to voice selection and assembly
  let voiceId = checkpoint.voiceId;

  if (!voiceId && checkpoint.project.shots?.some(s => s.vo)) {
    console.log("\n[Voice] Selecting voice...");
    const voices = await api.getVoices();
    const selection = await selectVoice(checkpoint.project, voices);
    voiceId = selection?.voice_id;
  }

  // Assemble
  console.log("\n[Assembly] Assembling final video...");
  const outputFilename = `${checkpoint.project.project_id}.mp4`;
  const result = await api.assemble({
    project_id: checkpoint.project.project_id,
    voice_id: voiceId,
    outputFilename,
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`COMPLETE: ${result.path}`);
  console.log(`Duration: ${result.duration}s | Shots: ${result.shotCount}`);
  console.log(`${"=".repeat(60)}\n`);

  // Cleanup
  removeCheckpoint(checkpoint.ideaFile);
  moveFile(checkpoint.ideaFile, true);

  return result.path;
}

// Step 1: Interpret the idea
async function interpretIdea(ideaText: string): Promise<InterpretedIdea> {
  console.log("\n[1/7] Interpreting idea...");

  const response = await claude.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Analyze this video idea and decide on production parameters.

VIDEO IDEA:
${ideaText}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "duration": <15-60 seconds based on complexity>,
  "arc": "<linear-build|tension-release|wave|flat-punctuate|bookend>",
  "style": "<cinematic style guidance, 10-20 words>",
  "production_style": <"stage_play"|"documentary"|"music_video"|"noir"|null>,
  "include_vo": <true if narrative/story needs narration, false if abstract/visual>,
  "reasoning": "<1-2 sentences explaining your choices>"
}`
    }]
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = JSON.parse(text) as InterpretedIdea;

  console.log(`  Duration: ${parsed.duration}s`);
  console.log(`  Arc: ${parsed.arc}`);
  console.log(`  Style: ${parsed.style}`);
  console.log(`  VO: ${parsed.include_vo}`);
  console.log(`  Reasoning: ${parsed.reasoning}`);

  return parsed;
}

// Step 2: Decide on locking
async function decideLocking(project: Project): Promise<{ characters: string[], environments: string[] }> {
  console.log("\n[3/7] Deciding on character/environment locking...");

  // Count character appearances across shots
  const charAppearances = new Map<string, number>();
  const envAppearances = new Map<string, number>();

  for (const shot of project.shots || []) {
    for (const charId of shot.characters || []) {
      charAppearances.set(charId, (charAppearances.get(charId) || 0) + 1);
    }
    if (shot.environment) {
      envAppearances.set(shot.environment, (envAppearances.get(shot.environment) || 0) + 1);
    }
  }

  // Lock characters/environments that appear in 2+ shots
  const lockChars = [...charAppearances.entries()]
    .filter(([_, count]) => count >= 2)
    .map(([id]) => id);

  const lockEnvs = [...envAppearances.entries()]
    .filter(([_, count]) => count >= 2)
    .map(([id]) => id);

  console.log(`  Characters to lock: ${lockChars.length > 0 ? lockChars.join(", ") : "none"}`);
  console.log(`  Environments to lock: ${lockEnvs.length > 0 ? lockEnvs.join(", ") : "none"}`);

  return { characters: lockChars, environments: lockEnvs };
}

// Step 3: Lock characters and environments
async function performLocking(
  project: Project,
  toLock: { characters: string[], environments: string[] }
): Promise<Project> {
  if (toLock.characters.length === 0 && toLock.environments.length === 0) {
    return project;
  }

  console.log("\n[4/7] Locking characters and environments...");

  const updatedChars = [...(project.characters || [])];
  const updatedEnvs = [...(project.environments || [])];

  for (const charId of toLock.characters) {
    const idx = updatedChars.findIndex(c => c.id === charId);
    if (idx !== -1) {
      console.log(`  Locking character: ${charId}`);
      updatedChars[idx] = await api.lockCharacter(updatedChars[idx], project.style);
    }
  }

  for (const envId of toLock.environments) {
    const idx = updatedEnvs.findIndex(e => e.id === envId);
    if (idx !== -1) {
      console.log(`  Locking environment: ${envId}`);
      updatedEnvs[idx] = await api.lockEnvironment(updatedEnvs[idx], project.style);
    }
  }

  return {
    ...project,
    characters: updatedChars,
    environments: updatedEnvs,
  };
}

// Step 4: Select voice
async function selectVoice(
  project: Project,
  voices: ElevenLabsVoice[]
): Promise<VoiceSelection | null> {
  if (!project.shots.some(s => s.vo)) {
    return null;
  }

  console.log("\n[5/7] Selecting voice...");

  // Build voice list for Claude
  const voiceDescriptions = voices.slice(0, 20).map(v => {
    const labels = v.labels ? Object.entries(v.labels).map(([k, val]) => `${k}:${val}`).join(", ") : "";
    return `- ${v.voice_id}: ${v.name} (${v.category || "custom"}) ${labels}`;
  }).join("\n");

  const voTexts = project.shots
    .filter(s => s.vo)
    .map(s => s.vo!.text)
    .join(" | ");

  const response = await claude.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `Select the best voice for this video narration.

CONCEPT: ${project.concept}
STYLE: ${project.style || "cinematic"}
SAMPLE VO TEXT: ${voTexts.slice(0, 200)}

AVAILABLE VOICES:
${voiceDescriptions}

Respond with ONLY a JSON object:
{
  "voice_id": "<selected voice_id>",
  "name": "<voice name>",
  "reasoning": "<why this voice fits>"
}`
    }]
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const selection = JSON.parse(text) as VoiceSelection;

  console.log(`  Selected: ${selection.name}`);
  console.log(`  Reasoning: ${selection.reasoning}`);

  return selection;
}

// Main production flow - submits jobs and checkpoints, returns null if waiting
async function produceVideo(ideaFile: string): Promise<string | null> {
  const ideaPath = join(SLUSH_DIR, ideaFile);
  const ideaText = readFileSync(ideaPath, "utf-8").trim();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing: ${ideaFile}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\nIdea:\n${ideaText}\n`);

  // Check server health
  const healthy = await api.healthCheck();
  if (!healthy) {
    throw new Error("Video generator server not running. Start with: npm start");
  }

  // Step 1: Interpret
  const params = await interpretIdea(ideaText);

  // Step 2: Generate project
  console.log("\n[2/7] Generating project structure...");
  let project = await api.generateProject({
    concept: ideaText,
    duration: params.duration,
    arc: params.arc,
    style: params.style,
    include_vo: params.include_vo,
    production_style: params.production_style,
  });
  console.log(`  Project ID: ${project.project_id}`);
  console.log(`  Shots: ${project.shots?.length || 0}`);
  console.log(`  Characters: ${project.characters?.map(c => c.id).join(", ") || "none"}`);

  // Step 3: Decide and perform locking
  const toLock = await decideLocking(project);
  project = await performLocking(project, toLock);

  // Step 4: Execute (submit Veo jobs)
  console.log("\n[5/7] Executing project (submitting to Veo)...");
  const execution = await api.executeProject(project);
  const jobIds = execution.jobs.map(j => j.job_id);
  console.log(`  Submitted ${execution.jobs.length} jobs`);

  // Save checkpoint and exit - don't wait for jobs
  const checkpoint: Checkpoint = {
    ideaFile,
    ideaText,
    project,
    jobIds,
    submittedAt: new Date().toISOString(),
  };
  saveCheckpoint(checkpoint);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`SUBMITTED - Jobs are processing in background`);
  console.log(`Run again to check status and complete assembly`);
  console.log(`${"=".repeat(60)}\n`);

  return null; // Indicates job is in progress, not complete
}

// CLI entry point
async function main() {
  ensureDirectories();

  const args = process.argv.slice(2);

  // --status: just show status of in-progress jobs
  if (args.includes("--status")) {
    const checkpoints = loadCheckpoints();
    if (checkpoints.length === 0) {
      console.log("No jobs in progress.");
      return;
    }
    console.log(`\n${checkpoints.length} job(s) in progress:\n`);
    for (const cp of checkpoints) {
      const status = await checkJobStatuses(cp.jobIds);
      console.log(`  ${cp.ideaFile}: ${status.completed}/${cp.jobIds.length} complete, ${status.pending} pending`);
      if (status.anyFailed) console.log(`    Failed: ${status.failed.join(', ')}`);
    }
    return;
  }

  // First, check any in-progress jobs
  const checkpoints = loadCheckpoints();
  if (checkpoints.length > 0) {
    console.log(`\nChecking ${checkpoints.length} in-progress job(s)...`);

    for (const checkpoint of checkpoints) {
      try {
        const result = await resumeFromCheckpoint(checkpoint);
        if (result) {
          console.log(`Completed: ${checkpoint.ideaFile} → ${result}`);
        }
      } catch (err) {
        console.error(`\nFailed to resume: ${checkpoint.ideaFile}`);
        console.error(err);
        removeCheckpoint(checkpoint.ideaFile);
        moveFile(checkpoint.ideaFile, false);
      }
    }

    // If there are still pending jobs, don't start new ones
    const remaining = loadCheckpoints();
    if (remaining.length > 0) {
      console.log(`\n${remaining.length} job(s) still processing. Run again later to check.`);
      return;
    }
  }

  if (args.includes("--all")) {
    // Process all ideas
    let submitted = 0;
    let failed = 0;
    while (true) {
      const next = getNextIdea();
      if (!next) break;

      try {
        await produceVideo(next);
        submitted++;
        // Don't process more until current batch completes
        console.log("Run again to check status and process more ideas.");
        break;
      } catch (err) {
        console.error(`\nFailed: ${next}`);
        console.error(err);
        moveFile(next, false);
        failed++;
      }
    }
    if (submitted === 0 && failed === 0) {
      console.log("\nNo ideas in slush pile.");
    }

  } else if (args.length > 0 && !args[0].startsWith("--")) {
    // Process specific file
    const filename = args[0];
    try {
      await produceVideo(filename);
    } catch (err) {
      console.error(`\nFailed: ${filename}`);
      console.error(err);
      moveFile(filename, false);
      process.exit(1);
    }

  } else {
    // Process next in queue
    const next = getNextIdea();
    if (!next) {
      console.log("No ideas in slush pile. Add .txt or .md files to data/slush-pile/");
      process.exit(0);
    }

    try {
      await produceVideo(next);
      // Job submitted - run again later to check status
    } catch (err) {
      console.error(`\nFailed: ${next}`);
      console.error(err);
      moveFile(next, false);
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
