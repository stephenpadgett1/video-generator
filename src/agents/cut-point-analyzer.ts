/**
 * Cut Point Analyzer Agent
 *
 * Analyzes generated video clips using Gemini to find optimal trim points.
 * Detects common Veo issues: entrance movement, dead time, rushed action.
 *
 * Usage:
 *   npx tsx cut-point-analyzer.ts project.json
 *   npx tsx cut-point-analyzer.ts --project-id <id>
 *   npx tsx cut-point-analyzer.ts project.json --shot shot_3
 *   npx tsx cut-point-analyzer.ts project.json --dry-run
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type {
  AnnotatedProject,
  Annotation,
  AnnotationCategory,
  AnnotationSeverity,
  Shot,
  CutPointAnalysis,
  DialogueLine
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = resolve(__dirname, '../../data/video');
const PROJECTS_DIR = resolve(__dirname, '../../data/projects');
const JOBS_FILE = resolve(__dirname, '../../jobs.json');
const API_BASE = 'http://localhost:3000';

// Job lookup cache
interface JobRecord {
  id: string;
  status: string;
  result?: {
    filename: string;
    path: string;
    duration: number;
  };
}

let jobsCache: Map<string, JobRecord> | null = null;

function loadJobsCache(): Map<string, JobRecord> {
  if (jobsCache) return jobsCache;

  try {
    const content = readFileSync(JOBS_FILE, 'utf-8');
    const jobs: JobRecord[] = JSON.parse(content);
    jobsCache = new Map(jobs.map(j => [j.id, j]));
  } catch {
    jobsCache = new Map();
  }
  return jobsCache;
}

function getVideoPath(jobId: string): string | null {
  const jobs = loadJobsCache();
  const job = jobs.get(jobId);

  if (!job || !job.result?.filename) {
    return null;
  }

  return resolve(VIDEO_DIR, job.result.filename);
}

function generateAnnotationId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `ann_${timestamp}_${random}`;
}

function loadProject(pathOrId: string): { project: AnnotatedProject; path: string } {
  let projectPath: string;

  if (pathOrId.endsWith('.json')) {
    projectPath = resolve(pathOrId);
  } else if (pathOrId.startsWith('--project-id')) {
    throw new Error('Use --project-id <id> format');
  } else {
    // Project ID - find in projects directory
    const files = readdirSync(PROJECTS_DIR);
    const match = files.find((f: string) => f.includes(pathOrId) && f.endsWith('.json'));
    if (!match) {
      throw new Error(`No project found with ID containing: ${pathOrId}`);
    }
    projectPath = resolve(PROJECTS_DIR, match);
  }

  if (!existsSync(projectPath)) {
    throw new Error(`Project file not found: ${projectPath}`);
  }

  const content = readFileSync(projectPath, 'utf-8');
  return { project: JSON.parse(content), path: projectPath };
}

function createCutPointAnnotation(
  shotId: string,
  analysis: CutPointAnalysis,
  takeIndex?: number
): Annotation {
  // Determine severity based on trim amount
  let severity: AnnotationSeverity = 'info';
  let type: 'issue' | 'passed' = 'passed';

  const hasTrimStart = analysis.suggested_trim_start > 0.3;
  const hasTrimEnd = analysis.suggested_trim_end !== null &&
    analysis.suggested_trim_end < analysis.actual_action_end - 0.3;

  if (hasTrimStart || hasTrimEnd) {
    type = 'issue';
    severity = analysis.confidence === 'high' ? 'warning' : 'info';
  }

  // Build message
  const parts: string[] = [];
  if (hasTrimStart) {
    parts.push(`trim ${analysis.suggested_trim_start.toFixed(1)}s from start`);
  }
  if (hasTrimEnd) {
    parts.push(`end at ${analysis.suggested_trim_end!.toFixed(1)}s`);
  }
  const trimMsg = parts.length > 0 ? parts.join(', ') : 'no trim needed';
  const message = `${trimMsg} (${analysis.reasoning})`;

  return {
    id: generateAnnotationId(),
    agent: 'cut-point-analyzer',
    timestamp: new Date().toISOString(),
    target: {
      shot_id: shotId,
      ...(takeIndex !== undefined && { take_index: takeIndex }),
      // Use frame field to record the suggested trim start point
      ...(hasTrimStart && { frame: analysis.suggested_trim_start })
    },
    type,
    category: 'timing' as AnnotationCategory,
    message,
    severity,
    resolved: false
  };
}

interface ShotContext {
  role: string;
  description: string;
  duration_target: number;
  mood: string;
  energy: number;
  tension: number;
  dialogue?: DialogueLine[];
  timing_hints?: string;
}

async function analyzeClip(
  shot: Shot & { job_id?: string; take_job_ids?: string[] },
  jobId: string,
  takeIndex?: number
): Promise<{ annotation: Annotation; analysis: CutPointAnalysis } | null> {
  const videoPath = getVideoPath(jobId);

  if (!videoPath || !existsSync(videoPath)) {
    console.log(`  Skipping ${shot.shot_id}: video not found`);
    return null;
  }

  const relVideoPath = videoPath.replace(/.*[\/\\]data[\/\\]/, '/');

  console.log(`  Analyzing ${shot.shot_id}${takeIndex !== undefined ? ` (take ${takeIndex})` : ''}...`);

  // Build shot context for API
  const shotContext: ShotContext = {
    role: shot.role,
    description: shot.description,
    duration_target: shot.duration_target,
    mood: shot.mood,
    energy: shot.energy,
    tension: shot.tension
  };

  if (shot.dialogue) {
    shotContext.dialogue = shot.dialogue;
  }

  try {
    const response = await fetch(`${API_BASE}/api/gemini/analyze-cut-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoPath: relVideoPath,
        shotContext
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`    API error: ${errText}`);
      return null;
    }

    const data = await response.json();
    const analysis: CutPointAnalysis = data.analysis;

    // Log summary
    if (analysis.suggested_trim_start > 0 || analysis.suggested_trim_end !== null) {
      console.log(`    -> Trim: ${analysis.suggested_trim_start.toFixed(1)}s start, ${analysis.suggested_trim_end?.toFixed(1) || 'end'}s end`);
      console.log(`    -> Reason: ${analysis.reasoning}`);
      if (analysis.issues_detected.length > 0) {
        analysis.issues_detected.forEach(issue => {
          console.log(`    -> Issue at ${issue.at_seconds.toFixed(1)}s: ${issue.type} - ${issue.description}`);
        });
      }
    } else {
      console.log(`    -> No trim needed (${analysis.confidence} confidence)`);
    }

    const annotation = createCutPointAnnotation(shot.shot_id, analysis, takeIndex);
    return { annotation, analysis };
  } catch (err: any) {
    console.error(`    Error: ${err.message}`);
    return null;
  }
}

interface AnalysisResult {
  annotations: Annotation[];
  analyses: Map<string, CutPointAnalysis>;  // shotId -> analysis (or shotId_takeN for multi-take)
  summary: {
    total_clips: number;
    analyzed: number;
    needs_trim: number;
    errors: number;
  };
}

async function analyzeProject(
  project: AnnotatedProject,
  options: { shots?: string[]; dryRun?: boolean }
): Promise<AnalysisResult> {
  const annotations: Annotation[] = [];
  const analyses = new Map<string, CutPointAnalysis>();
  let totalClips = 0;
  let analyzed = 0;
  let needsTrim = 0;
  let errors = 0;

  for (const shot of project.shots) {
    // Filter by shot ID if specified
    if (options.shots && !options.shots.includes(shot.shot_id)) {
      continue;
    }

    const shotWithJobs = shot as Shot & { job_id?: string; take_job_ids?: string[] };
    const takeJobIds = shotWithJobs.take_job_ids;

    if (takeJobIds && takeJobIds.length > 0) {
      // Multi-take shot
      for (let i = 0; i < takeJobIds.length; i++) {
        totalClips++;
        const result = await analyzeClip(shotWithJobs, takeJobIds[i], i);
        if (result) {
          annotations.push(result.annotation);
          analyses.set(`${shot.shot_id}_take${i}`, result.analysis);
          analyzed++;
          if (result.annotation.type === 'issue') {
            needsTrim++;
          }
        } else {
          errors++;
        }
      }
    } else if (shotWithJobs.job_id) {
      // Single-take shot
      totalClips++;
      const result = await analyzeClip(shotWithJobs, shotWithJobs.job_id);
      if (result) {
        annotations.push(result.annotation);
        analyses.set(shot.shot_id, result.analysis);
        analyzed++;
        if (result.annotation.type === 'issue') {
          needsTrim++;
        }
      } else {
        errors++;
      }
    } else {
      console.log(`  Skipping ${shot.shot_id}: no job_id`);
    }
  }

  return {
    annotations,
    analyses,
    summary: {
      total_clips: totalClips,
      analyzed,
      needs_trim: needsTrim,
      errors
    }
  };
}

function printSummary(result: AnalysisResult): void {
  console.log('\n=== Cut Point Analysis Summary ===\n');
  console.log(`Total clips: ${result.summary.total_clips}`);
  console.log(`Analyzed: ${result.summary.analyzed}`);
  console.log(`Needs trim: ${result.summary.needs_trim}`);
  console.log(`Errors: ${result.summary.errors}`);

  if (result.summary.needs_trim > 0) {
    console.log('\nRECOMMENDED TRIMS:');
    result.annotations
      .filter(a => a.type === 'issue')
      .forEach(a => {
        const take = a.target.take_index !== undefined ? ` (take ${a.target.take_index})` : '';
        console.log(`  [${a.target.shot_id}${take}] ${a.message}`);
      });
  }

  console.log('\n');
}

// CLI entry point
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx tsx cut-point-analyzer.ts <project.json> [options]');
    console.log('       npx tsx cut-point-analyzer.ts --project-id <id> [options]');
    console.log('\nOptions:');
    console.log('  --shot <shot_id>   Analyze specific shot(s) only (can repeat)');
    console.log('  --dry-run          Print analysis without saving annotations');
    process.exit(1);
  }

  // Parse flags
  const dryRun = args.includes('--dry-run');
  const shotFilter: string[] = [];
  let projectArg: string = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') continue;
    if (args[i] === '--shot') {
      if (args[i + 1]) {
        shotFilter.push(args[i + 1]);
        i++;
      }
      continue;
    }
    if (args[i] === '--project-id') {
      if (args[i + 1]) {
        projectArg = args[i + 1];
        i++;
      }
      continue;
    }
    if (!projectArg) {
      projectArg = args[i];
    }
  }

  if (!projectArg) {
    console.error('Missing project path or ID');
    process.exit(1);
  }

  console.log('Loading project...');
  const { project, path: projectPath } = loadProject(projectArg);
  console.log(`Project: ${project.project_id}`);
  console.log(`Shots: ${project.shots.length}`);
  if (shotFilter.length > 0) {
    console.log(`Filtering to shots: ${shotFilter.join(', ')}`);
  }
  if (dryRun) {
    console.log('DRY RUN: annotations will not be saved');
  }

  console.log('\nAnalyzing clips for cut points...\n');
  const result = await analyzeProject(project, {
    shots: shotFilter.length > 0 ? shotFilter : undefined,
    dryRun
  });

  if (!dryRun) {
    // Merge annotations (preserve existing, add new)
    const existingAnnotations = project.annotations || [];
    const newAnnotations = result.annotations.filter(
      a => !existingAnnotations.some(e =>
        e.agent === a.agent &&
        e.target.shot_id === a.target.shot_id &&
        e.target.take_index === a.target.take_index &&
        e.category === a.category
      )
    );

    project.annotations = [...existingAnnotations, ...newAnnotations];

    // Save updated project
    writeFileSync(projectPath, JSON.stringify(project, null, 2));
    console.log(`Saved ${newAnnotations.length} new annotations to project`);
  }

  printSummary(result);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
