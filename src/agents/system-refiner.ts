/**
 * System Refiner Agent
 *
 * Autonomously proposes and tests improvements to the video production
 * system's decision-making logic. Works entirely at the conceptual level -
 * no actual video generation.
 *
 * Usage:
 *   npx tsx system-refiner.ts                     # Run autonomous refinement cycle
 *   npx tsx system-refiner.ts --hints "focus on arc selection"
 *   npx tsx system-refiner.ts --dry-run           # Show what it would test
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_CORPUS_DIR = resolve(__dirname, "../../data/test-corpus");
const REFINER_STATE_PATH = resolve(__dirname, "../../data/refiner-state.json");

function getApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const configPath = resolve(__dirname, "../../data/config.json");
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    if (config.claudeKey) return config.claudeKey;
  } catch { /* fall through */ }
  throw new Error("No API key found");
}

const claude = new Anthropic({ apiKey: getApiKey() });

// The current interpretation prompt (extracted from video-producer)
const CURRENT_INTERPRETATION_PROMPT = `Analyze this video idea and decide on production parameters.

VIDEO IDEA:
{idea}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "duration": <15-60 seconds based on complexity>,
  "arc": "<linear-build|tension-release|wave|flat-punctuate|bookend>",
  "style": "<cinematic style guidance, 10-20 words>",
  "production_style": <"stage_play"|"documentary"|"music_video"|"noir"|null>,
  "include_vo": <true if narrative/story needs narration, false if abstract/visual>,
  "reasoning": "<1-2 sentences explaining your choices>"
}`;

interface RefinerState {
  currentPrompt: string;
  history: Array<{
    timestamp: string;
    change: string;
    accepted: boolean;
    reasoning: string;
  }>;
}

interface TestResult {
  idea: string;
  interpretation: object;
  evaluation: {
    feasibility: number;    // 0-1: How likely Veo can render this
    coherence: number;      // 0-1: Does structure make narrative sense
    creativity: number;     // 0-1: Interesting choices vs generic
    appropriateness: number; // 0-1: Do choices fit the idea
  };
  issues: string[];
}

function loadState(): RefinerState {
  if (existsSync(REFINER_STATE_PATH)) {
    return JSON.parse(readFileSync(REFINER_STATE_PATH, "utf-8"));
  }
  return {
    currentPrompt: CURRENT_INTERPRETATION_PROMPT,
    history: []
  };
}

function saveState(state: RefinerState) {
  writeFileSync(REFINER_STATE_PATH, JSON.stringify(state, null, 2));
}

function loadTestCorpus(): string[] {
  if (!existsSync(TEST_CORPUS_DIR)) {
    mkdirSync(TEST_CORPUS_DIR, { recursive: true });
    // Create some default test ideas
    const defaults = [
      "A robot learning to paint discovers it can only create self-portraits.",
      "Rain falls upward in a city where gravity forgot which way was down.",
      "Two strangers share an umbrella. Neither speaks the other's language.",
      "A lighthouse keeper's last night before automation takes over.",
      "The moment between a coin flip and its landing.",
    ];
    defaults.forEach((idea, i) => {
      writeFileSync(join(TEST_CORPUS_DIR, `test-${i + 1}.txt`), idea);
    });
    return defaults;
  }
  return readdirSync(TEST_CORPUS_DIR)
    .filter(f => f.endsWith('.txt'))
    .map(f => readFileSync(join(TEST_CORPUS_DIR, f), 'utf-8').trim());
}

async function interpretWithPrompt(idea: string, prompt: string): Promise<object> {
  const filledPrompt = prompt.replace('{idea}', idea);

  const response = await claude.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: filledPrompt }]
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(text);
}

async function evaluateInterpretation(idea: string, interpretation: object): Promise<TestResult['evaluation'] & { issues: string[] }> {
  const response = await claude.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Evaluate this video interpretation. Be critical but fair.

ORIGINAL IDEA:
${idea}

INTERPRETATION:
${JSON.stringify(interpretation, null, 2)}

Consider:
- Feasibility: Can AI video generation (Veo) actually render this? VFX, glowing, holograms are risky.
- Coherence: Does the arc/duration/structure make narrative sense?
- Creativity: Are the choices interesting or generic?
- Appropriateness: Do the choices fit the original idea's tone/intent?

Respond with ONLY JSON:
{
  "feasibility": <0-1>,
  "coherence": <0-1>,
  "creativity": <0-1>,
  "appropriateness": <0-1>,
  "issues": ["<specific issue 1>", "<specific issue 2>"]
}`
    }]
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(text);
}

async function proposeChange(state: RefinerState, testResults: TestResult[], hints?: string): Promise<{ newPrompt: string; rationale: string }> {
  const avgScores = {
    feasibility: testResults.reduce((s, r) => s + r.evaluation.feasibility, 0) / testResults.length,
    coherence: testResults.reduce((s, r) => s + r.evaluation.coherence, 0) / testResults.length,
    creativity: testResults.reduce((s, r) => s + r.evaluation.creativity, 0) / testResults.length,
    appropriateness: testResults.reduce((s, r) => s + r.evaluation.appropriateness, 0) / testResults.length,
  };

  const allIssues = testResults.flatMap(r => r.issues);
  const recentHistory = state.history.slice(-5);

  const response = await claude.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `You are refining a video production system's interpretation prompt.

CURRENT PROMPT:
${state.currentPrompt}

AVERAGE SCORES ACROSS TEST CORPUS:
- Feasibility: ${avgScores.feasibility.toFixed(2)}
- Coherence: ${avgScores.coherence.toFixed(2)}
- Creativity: ${avgScores.creativity.toFixed(2)}
- Appropriateness: ${avgScores.appropriateness.toFixed(2)}

COMMON ISSUES FOUND:
${allIssues.slice(0, 10).map(i => `- ${i}`).join('\n')}

RECENT CHANGES (avoid repeating failed approaches):
${recentHistory.map(h => `- ${h.change}: ${h.accepted ? 'ACCEPTED' : 'REJECTED'}`).join('\n') || 'None yet'}

${hints ? `USER HINTS:\n${hints}\n` : ''}

Propose ONE specific change to improve the prompt. Focus on the lowest-scoring dimension.
Do not make the prompt dramatically longer. Small, targeted changes.

Respond with ONLY JSON:
{
  "newPrompt": "<the full updated prompt>",
  "rationale": "<1-2 sentences explaining the change>"
}`
    }]
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(text);
}

async function runTestSuite(prompt: string, corpus: string[]): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const idea of corpus) {
    console.log(`  Testing: "${idea.slice(0, 50)}..."`);
    try {
      const interpretation = await interpretWithPrompt(idea, prompt);
      const evaluation = await evaluateInterpretation(idea, interpretation);
      results.push({
        idea,
        interpretation,
        evaluation: {
          feasibility: evaluation.feasibility,
          coherence: evaluation.coherence,
          creativity: evaluation.creativity,
          appropriateness: evaluation.appropriateness,
        },
        issues: evaluation.issues
      });
    } catch (err) {
      console.log(`    Error: ${err}`);
    }
  }

  return results;
}

function compareResults(baseline: TestResult[], candidate: TestResult[]): { improved: boolean; delta: Record<string, number> } {
  const avg = (results: TestResult[], key: keyof TestResult['evaluation']) =>
    results.reduce((s, r) => s + r.evaluation[key], 0) / results.length;

  const delta = {
    feasibility: avg(candidate, 'feasibility') - avg(baseline, 'feasibility'),
    coherence: avg(candidate, 'coherence') - avg(baseline, 'coherence'),
    creativity: avg(candidate, 'creativity') - avg(baseline, 'creativity'),
    appropriateness: avg(candidate, 'appropriateness') - avg(baseline, 'appropriateness'),
  };

  const totalDelta = Object.values(delta).reduce((a, b) => a + b, 0);
  const noRegression = Object.values(delta).every(d => d >= -0.1); // Allow small regressions

  return {
    improved: totalDelta > 0.05 && noRegression,
    delta
  };
}

async function main() {
  const args = process.argv.slice(2);
  const hints = args.includes('--hints') ? args[args.indexOf('--hints') + 1] : undefined;
  const dryRun = args.includes('--dry-run');

  console.log("\n=== System Refiner ===\n");

  const state = loadState();
  const corpus = loadTestCorpus();
  console.log(`Test corpus: ${corpus.length} ideas`);

  // Run baseline
  console.log("\n[1/4] Running baseline tests...");
  const baselineResults = await runTestSuite(state.currentPrompt, corpus);

  const avgBaseline = {
    feasibility: baselineResults.reduce((s, r) => s + r.evaluation.feasibility, 0) / baselineResults.length,
    coherence: baselineResults.reduce((s, r) => s + r.evaluation.coherence, 0) / baselineResults.length,
    creativity: baselineResults.reduce((s, r) => s + r.evaluation.creativity, 0) / baselineResults.length,
    appropriateness: baselineResults.reduce((s, r) => s + r.evaluation.appropriateness, 0) / baselineResults.length,
  };
  console.log(`\nBaseline scores:`);
  console.log(`  Feasibility: ${avgBaseline.feasibility.toFixed(2)}`);
  console.log(`  Coherence: ${avgBaseline.coherence.toFixed(2)}`);
  console.log(`  Creativity: ${avgBaseline.creativity.toFixed(2)}`);
  console.log(`  Appropriateness: ${avgBaseline.appropriateness.toFixed(2)}`);

  // Propose change
  console.log("\n[2/4] Proposing change...");
  const proposal = await proposeChange(state, baselineResults, hints);
  console.log(`\nProposed change: ${proposal.rationale}`);

  if (dryRun) {
    console.log("\n[Dry run - not testing proposal]");
    console.log("\nProposed prompt:");
    console.log(proposal.newPrompt);
    return;
  }

  // Test candidate
  console.log("\n[3/4] Testing proposed change...");
  const candidateResults = await runTestSuite(proposal.newPrompt, corpus);

  // Compare
  console.log("\n[4/4] Evaluating...");
  const comparison = compareResults(baselineResults, candidateResults);

  console.log("\nDelta:");
  for (const [key, value] of Object.entries(comparison.delta)) {
    const sign = value >= 0 ? '+' : '';
    console.log(`  ${key}: ${sign}${value.toFixed(3)}`);
  }

  if (comparison.improved) {
    console.log("\n✓ ACCEPTED - Change improves the system");
    state.currentPrompt = proposal.newPrompt;
    state.history.push({
      timestamp: new Date().toISOString(),
      change: proposal.rationale,
      accepted: true,
      reasoning: `Delta: ${JSON.stringify(comparison.delta)}`
    });
  } else {
    console.log("\n✗ REJECTED - Change does not improve the system");
    state.history.push({
      timestamp: new Date().toISOString(),
      change: proposal.rationale,
      accepted: false,
      reasoning: `Delta: ${JSON.stringify(comparison.delta)}`
    });
  }

  saveState(state);
  console.log(`\nHistory: ${state.history.length} changes evaluated`);
}

main().catch(console.error);
