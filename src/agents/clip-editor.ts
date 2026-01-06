/**
 * Clip Editor Agent
 *
 * Reads cut-point-analyzer annotations and automatically creates trimmed variations.
 * Can also adjust speed to hit target duration.
 *
 * Usage:
 *   npx tsx clip-editor.ts project.json
 *   npx tsx clip-editor.ts --project-id <id>
 *   npx tsx clip-editor.ts project.json --shot shot_3
 *   npx tsx clip-editor.ts project.json --auto-approve   # Also select the created variations
 *   npx tsx clip-editor.ts project.json --dry-run
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type {
  AnnotatedProject,
  Annotation,
  Shot,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = resolve(__dirname, '../../data/projects');
const API_BASE = 'http://localhost:3000';

interface JobRecord {
  id: string;
  status: string;
  result?: { filename: string; path: string; duration: number; };
}

function loadProject(pathOrId: string): { project: AnnotatedProject; path: string } {
  let projectPath: string;
  if (pathOrId.endsWith('.json')) {
    projectPath = resolve(pathOrId);
  } else {
    const files = readdirSync(PROJECTS_DIR);
    const match = files.find((f: string) => f.includes(pathOrId) && f.endsWith('.json'));
    if (!match) throw new Error('No project found with ID containing: ' + pathOrId);
    projectPath = resolve(PROJECTS_DIR, match);
  }
  if (!existsSync(projectPath)) throw new Error('Project file not found: ' + projectPath);
  return { project: JSON.parse(readFileSync(projectPath, 'utf-8')), path: projectPath };
}

interface EditManifest {
  job_id: string;
  source: { path: string; duration: number };
  context: { project_id?: string; shot_id?: string; take_index?: number; expected_dialogue?: string };
  analysis: any;
  variations: Array<{
    id: string;
    filename: string;
    edits: { trim_start?: number; trim_end?: number; speed?: number };
    duration: number;
    notes?: string;
  }>;
  selected: string | null;
  status: string;
}

interface TrimAnnotation extends Annotation {
  target: {
    shot_id: string;
    take_index?: number;
    frame?: number;  // suggested_trim_start
  };
}

function extractTrimFromAnnotation(annotation: Annotation): { trim_start: number; trim_end: number | null } | null {
  // Parse annotation message for trim recommendations
  // Format: "trim 0.15s from start, end at 7.56s (reason)"
  // or "no trim needed (reason)"
  const msg = annotation.message;

  if (msg.startsWith('no trim needed')) {
    return null;
  }

  let trim_start = 0;
  let trim_end: number | null = null;

  const startMatch = msg.match(/trim ([\d.]+)s from start/);
  if (startMatch) {
    trim_start = parseFloat(startMatch[1]);
  }

  const endMatch = msg.match(/end at ([\d.]+)s/);
  if (endMatch) {
    trim_end = parseFloat(endMatch[1]);
  }

  // Also check annotation target.frame for trim_start
  if (annotation.target.frame && !startMatch) {
    trim_start = annotation.target.frame;
  }

  if (trim_start > 0 || trim_end !== null) {
    return { trim_start, trim_end };
  }

  return null;
}

async function startEdit(jobId: string, context: { project_id?: string; shot_id?: string; take_index?: number; expected_dialogue?: string }): Promise<EditManifest | null> {
  try {
    const response = await fetch(`${API_BASE}/api/edit/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        ...context
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`  Failed to start edit for ${jobId}: ${err}`);
      return null;
    }

    const result = await response.json();
    return result.manifest;
  } catch (err: any) {
    console.error(`  Error starting edit: ${err.message}`);
    return null;
  }
}

async function createTrimVariation(jobId: string, trim_start: number, trim_end: number | null, notes?: string): Promise<any> {
  try {
    const body: any = { job_id: jobId, trim_start };
    if (trim_end !== null) body.trim_end = trim_end;
    if (notes) body.notes = notes;

    const response = await fetch(`${API_BASE}/api/edit/trim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`  Failed to create trim: ${err}`);
      return null;
    }

    return await response.json();
  } catch (err: any) {
    console.error(`  Error creating trim: ${err.message}`);
    return null;
  }
}

async function selectVariation(jobId: string, variationId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/edit/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, variation_id: variationId })
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function getExistingEdit(jobId: string): Promise<EditManifest | null> {
  try {
    const response = await fetch(`${API_BASE}/api/edit/${jobId}`);
    if (response.ok) {
      return await response.json();
    }
  } catch {}
  return null;
}

interface EditResult {
  job_id: string;
  shot_id: string;
  take_index?: number;
  action: 'created' | 'skipped' | 'exists' | 'no_trim_needed';
  variation_id?: string;
  notes?: string;
}

async function processClip(
  jobId: string,
  shotId: string,
  takeIndex: number | undefined,
  annotation: Annotation | null,
  project: AnnotatedProject,
  options: { dryRun: boolean; autoApprove: boolean }
): Promise<EditResult> {
  const result: EditResult = {
    job_id: jobId,
    shot_id: shotId,
    take_index: takeIndex,
    action: 'skipped'
  };

  // Check for existing edit
  const existing = await getExistingEdit(jobId);
  if (existing && existing.variations.length > 0) {
    result.action = 'exists';
    result.notes = `${existing.variations.length} variations exist`;
    return result;
  }

  // Check if we have trim recommendations
  if (!annotation) {
    result.action = 'skipped';
    result.notes = 'No cut-point-analyzer annotation';
    return result;
  }

  const trimParams = extractTrimFromAnnotation(annotation);
  if (!trimParams) {
    result.action = 'no_trim_needed';
    result.notes = annotation.message;
    return result;
  }

  if (options.dryRun) {
    result.action = 'skipped';
    result.notes = `DRY RUN: would trim ${trimParams.trim_start.toFixed(2)}s - ${trimParams.trim_end?.toFixed(2) || 'end'}`;
    return result;
  }

  // Get shot context
  const shot = project.shots.find(s => s.shot_id === shotId);
  const expectedDialogue = shot?.dialogue?.map(d => d.text).join(' ');

  // Start edit
  console.log(`  Starting edit for ${shotId}${takeIndex !== undefined ? ` (take ${takeIndex})` : ''}...`);
  const manifest = await startEdit(jobId, {
    project_id: project.project_id,
    shot_id: shotId,
    take_index: takeIndex,
    expected_dialogue: expectedDialogue
  });

  if (!manifest) {
    result.action = 'skipped';
    result.notes = 'Failed to start edit';
    return result;
  }

  // Create trim variation
  console.log(`  Creating trim: ${trimParams.trim_start.toFixed(2)}s - ${trimParams.trim_end?.toFixed(2) || 'end'}...`);
  const trimResult = await createTrimVariation(
    jobId,
    trimParams.trim_start,
    trimParams.trim_end,
    `Auto-trim from cut-point-analyzer: ${annotation.message}`
  );

  if (!trimResult) {
    result.action = 'skipped';
    result.notes = 'Failed to create trim variation';
    return result;
  }

  result.action = 'created';
  result.variation_id = trimResult.variation.id;
  result.notes = trimResult.variation.notes;

  // Auto-approve if requested
  if (options.autoApprove) {
    const selected = await selectVariation(jobId, trimResult.variation.id);
    if (selected) {
      result.notes += ' (auto-approved)';
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx tsx clip-editor.ts <project.json> [--shot <id>] [--auto-approve] [--dry-run]');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const autoApprove = args.includes('--auto-approve');
  const shotFilter: string[] = [];
  let projectArg = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run' || args[i] === '--auto-approve') continue;
    if (args[i] === '--shot' && args[i + 1]) { shotFilter.push(args[++i]); continue; }
    if (args[i] === '--project-id' && args[i + 1]) { projectArg = args[++i]; continue; }
    if (!projectArg) projectArg = args[i];
  }

  if (!projectArg) {
    console.error('Missing project');
    process.exit(1);
  }

  console.log('Loading project...');
  const { project, path: projectPath } = loadProject(projectArg);
  console.log(`Project: ${project.project_id} | Shots: ${project.shots.length}`);
  if (dryRun) console.log('DRY RUN');
  if (autoApprove) console.log('AUTO-APPROVE enabled');

  // Get cut-point-analyzer annotations
  const cutPointAnnotations = (project.annotations || []).filter(
    (a: Annotation) => a.agent === 'cut-point-analyzer' && a.category === 'timing'
  );
  console.log(`Found ${cutPointAnnotations.length} cut-point-analyzer annotations\n`);

  const results: EditResult[] = [];

  for (const shot of project.shots) {
    if (shotFilter.length > 0 && !shotFilter.includes(shot.shot_id)) continue;

    const s = shot as Shot & { job_id?: string; take_job_ids?: string[] };

    if (s.take_job_ids && s.take_job_ids.length > 0) {
      // Multi-take shot
      for (let i = 0; i < s.take_job_ids.length; i++) {
        const jobId = s.take_job_ids[i];
        const annotation = cutPointAnnotations.find(
          (a: Annotation) => a.target.shot_id === shot.shot_id && a.target.take_index === i
        ) || null;

        console.log(`Processing ${shot.shot_id} (take ${i})...`);
        const result = await processClip(jobId, shot.shot_id, i, annotation, project, { dryRun, autoApprove });
        results.push(result);
        console.log(`  -> ${result.action}: ${result.notes || ''}`);
      }
    } else if (s.job_id) {
      // Single-take shot
      const annotation = cutPointAnnotations.find(
        (a: Annotation) => a.target.shot_id === shot.shot_id && a.target.take_index === undefined
      ) || null;

      console.log(`Processing ${shot.shot_id}...`);
      const result = await processClip(s.job_id, shot.shot_id, undefined, annotation, project, { dryRun, autoApprove });
      results.push(result);
      console.log(`  -> ${result.action}: ${result.notes || ''}`);
    } else {
      console.log(`Skipping ${shot.shot_id}: no job_id`);
    }
  }

  // Summary
  console.log('\n=== Clip Editor Summary ===\n');
  const created = results.filter(r => r.action === 'created').length;
  const exists = results.filter(r => r.action === 'exists').length;
  const noTrim = results.filter(r => r.action === 'no_trim_needed').length;
  const skipped = results.filter(r => r.action === 'skipped').length;

  console.log(`Created: ${created} | Already exists: ${exists} | No trim needed: ${noTrim} | Skipped: ${skipped}`);

  if (created > 0) {
    console.log('\nNEW VARIATIONS CREATED:');
    results.filter(r => r.action === 'created').forEach(r => {
      const take = r.take_index !== undefined ? ` (take ${r.take_index})` : '';
      console.log(`  [${r.shot_id}${take}] ${r.variation_id}: ${r.notes}`);
    });
  }

  if (!autoApprove && created > 0) {
    console.log('\nTo auto-approve all created variations, run with --auto-approve flag');
    console.log('Or use: POST /api/edit/select { job_id, variation_id }');
  }

  console.log('');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
