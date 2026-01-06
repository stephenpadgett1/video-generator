/**
 * Cut Point Analyzer Agent
 *
 * Analyzes generated video clips using audio timeline (ffmpeg + Whisper) to find optimal trim points.
 * Detects: dead time at start/end, significant pauses, dialogue completeness.
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
  CutPointIssue,
  DialogueLine
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = resolve(__dirname, '../../data/video');
const PROJECTS_DIR = resolve(__dirname, '../../data/projects');
const JOBS_FILE = resolve(__dirname, '../../jobs.json');
const API_BASE = 'http://localhost:3000';

interface JobRecord {
  id: string;
  status: string;
  result?: { filename: string; path: string; duration: number; };
}

let jobsCache: Map<string, JobRecord> | null = null;

function loadJobsCache(): Map<string, JobRecord> {
  if (jobsCache) return jobsCache;
  try {
    const content = readFileSync(JOBS_FILE, 'utf-8');
    const jobs: JobRecord[] = JSON.parse(content);
    jobsCache = new Map(jobs.map(j => [j.id, j]));
  } catch { jobsCache = new Map(); }
  return jobsCache;
}

function getVideoPath(jobId: string): string | null {
  const jobs = loadJobsCache();
  const job = jobs.get(jobId);
  if (!job || !job.result?.filename) return null;
  return resolve(VIDEO_DIR, job.result.filename);
}

function generateAnnotationId(): string {
  const ts = Date.now();
  const rnd = Math.random().toString(36).substring(2, 8);
  return 'ann_' + ts + '_' + rnd;
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

interface AudioTimelineResponse {
  clip_duration: number;
  whisper: { text: string; words: Array<{ word: string; start: number; end: number }>; };
  silences: Array<{ start: number; end: number; duration: number }>;
  reconciled: {
    speech_segments: Array<{ start: number; end: number; words: string; word_count: number }>;
  };
  summary: { total_words: number; total_silences: number; longest_silence: number; };
}

function analyzeAudioTimeline(timeline: AudioTimelineResponse, expectedDialogue?: string): CutPointAnalysis {
  const { silences, reconciled, clip_duration, whisper } = timeline;
  const segments = reconciled.speech_segments;
  const issues: CutPointIssue[] = [];

  if (segments.length === 0) {
    return {
      actual_action_start: 0, actual_action_end: clip_duration,
      suggested_trim_start: 0, suggested_trim_end: null, usable_duration: clip_duration,
      issues_detected: [{ type: 'other', at_seconds: 0, description: 'No speech detected' }],
      reasoning: 'No speech detected', confidence: 'low'
    };
  }

  const firstSeg = segments[0], lastSeg = segments[segments.length - 1];

  if (firstSeg.start > 0.3) {
    issues.push({ type: 'late_action', at_seconds: 0, description: 'Speech starts at ' + firstSeg.start.toFixed(2) + 's' });
  }
  if (clip_duration - lastSeg.end > 0.3) {
    issues.push({ type: 'dead_time', at_seconds: lastSeg.end, description: 'Speech ends at ' + lastSeg.end.toFixed(2) + 's, clip is ' + clip_duration.toFixed(2) + 's' });
  }

  for (const s of silences) {
    if (s.duration > 0.5 && s.start > 0.2 && s.end < clip_duration - 0.2) {
      issues.push({ type: 'other', at_seconds: s.start, description: s.duration.toFixed(2) + 's pause' });
    }
  }

  if (expectedDialogue) {
    const norm = (t: string) => t.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const expected = norm(expectedDialogue).split(/\s+/);
    const actual = norm(whisper.text).split(/\s+/);
    const missing = expected.filter(w => !actual.includes(w));
    if (missing.length > 0) {
      issues.push({ type: 'other', at_seconds: 0, description: 'Missing: ' + missing.join(', ') });
    }
  }

  const BUFFER = 0.15;
  const trimStart = Math.max(0, firstSeg.start - BUFFER);
  const trimEnd = Math.min(clip_duration, lastSeg.end + BUFFER);

  const parts: string[] = [];
  if (trimStart > 0.1) parts.push(trimStart.toFixed(1) + 's dead at start');
  if (clip_duration - trimEnd > 0.1) parts.push((clip_duration - trimEnd).toFixed(1) + 's dead at end');
  if (segments.length > 1) parts.push(segments.length + ' speech segments');

  return {
    actual_action_start: firstSeg.start, actual_action_end: lastSeg.end,
    suggested_trim_start: Math.round(trimStart * 100) / 100,
    suggested_trim_end: trimEnd < clip_duration - 0.1 ? Math.round(trimEnd * 100) / 100 : null,
    usable_duration: Math.round((trimEnd - trimStart) * 100) / 100,
    issues_detected: issues,
    reasoning: parts.length > 0 ? parts.join('; ') : 'Clean clip',
    confidence: issues.length === 0 ? 'high' : issues.length <= 2 ? 'medium' : 'low'
  };
}

function createCutPointAnnotation(shotId: string, analysis: CutPointAnalysis, takeIndex?: number): Annotation {
  const hasTrimStart = analysis.suggested_trim_start > 0.3;
  const hasTrimEnd = analysis.suggested_trim_end !== null && analysis.suggested_trim_end < analysis.actual_action_end - 0.3;
  const type: 'issue' | 'passed' = (hasTrimStart || hasTrimEnd || analysis.issues_detected.length > 0) ? 'issue' : 'passed';
  const severity: AnnotationSeverity = analysis.confidence === 'high' ? 'info' : 'warning';

  const parts: string[] = [];
  if (hasTrimStart) parts.push('trim ' + analysis.suggested_trim_start.toFixed(1) + 's from start');
  if (hasTrimEnd) parts.push('end at ' + analysis.suggested_trim_end!.toFixed(1) + 's');

  return {
    id: generateAnnotationId(), agent: 'cut-point-analyzer', timestamp: new Date().toISOString(),
    target: { shot_id: shotId, ...(takeIndex !== undefined && { take_index: takeIndex }), ...(hasTrimStart && { frame: analysis.suggested_trim_start }) },
    type, category: 'timing' as AnnotationCategory,
    message: (parts.length > 0 ? parts.join(', ') : 'no trim needed') + ' (' + analysis.reasoning + ')',
    severity, resolved: false
  };
}

async function analyzeClip(shot: Shot & { job_id?: string; take_job_ids?: string[] }, jobId: string, takeIndex?: number): Promise<{ annotation: Annotation; analysis: CutPointAnalysis } | null> {
  const videoPath = getVideoPath(jobId);
  if (!videoPath || !existsSync(videoPath)) { console.log('  Skipping ' + shot.shot_id + ': video not found'); return null; }

  console.log('  Analyzing ' + shot.shot_id + (takeIndex !== undefined ? ' (take ' + takeIndex + ')' : '') + '...');

  const expectedDialogue = shot.dialogue ? shot.dialogue.map(d => d.text).join(' ') : undefined;

  try {
    const response = await fetch(API_BASE + '/api/audio-timeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoPath })
    });
    if (!response.ok) { console.error('    API error: ' + await response.text()); return null; }

    const timeline: AudioTimelineResponse = await response.json();
    const analysis = analyzeAudioTimeline(timeline, expectedDialogue);

    console.log('    -> Speech: ' + timeline.reconciled.speech_segments.length + ' segment(s)');
    console.log('    -> Silences: ' + timeline.silences.length + ' (longest: ' + timeline.summary.longest_silence.toFixed(2) + 's)');
    if (analysis.suggested_trim_start > 0 || analysis.suggested_trim_end !== null) {
      console.log('    -> Trim: ' + analysis.suggested_trim_start.toFixed(2) + 's start, ' + (analysis.suggested_trim_end?.toFixed(2) || 'end') + 's end');
    } else {
      console.log('    -> No trim needed (' + analysis.confidence + ')');
    }
    analysis.issues_detected.forEach(i => console.log('    -> Issue: ' + i.type + ' - ' + i.description));

    return { annotation: createCutPointAnnotation(shot.shot_id, analysis, takeIndex), analysis };
  } catch (err: any) { console.error('    Error: ' + err.message); return null; }
}

interface AnalysisResult {
  annotations: Annotation[];
  analyses: Map<string, CutPointAnalysis>;
  summary: { total_clips: number; analyzed: number; needs_trim: number; errors: number; };
}

async function analyzeProject(project: AnnotatedProject, options: { shots?: string[]; dryRun?: boolean }): Promise<AnalysisResult> {
  const annotations: Annotation[] = [], analyses = new Map<string, CutPointAnalysis>();
  let totalClips = 0, analyzed = 0, needsTrim = 0, errors = 0;

  for (const shot of project.shots) {
    if (options.shots && !options.shots.includes(shot.shot_id)) continue;
    const s = shot as Shot & { job_id?: string; take_job_ids?: string[] };

    if (s.take_job_ids && s.take_job_ids.length > 0) {
      for (let i = 0; i < s.take_job_ids.length; i++) {
        totalClips++;
        const r = await analyzeClip(s, s.take_job_ids[i], i);
        if (r) { annotations.push(r.annotation); analyses.set(shot.shot_id + '_take' + i, r.analysis); analyzed++; if (r.annotation.type === 'issue') needsTrim++; }
        else errors++;
      }
    } else if (s.job_id) {
      totalClips++;
      const r = await analyzeClip(s, s.job_id);
      if (r) { annotations.push(r.annotation); analyses.set(shot.shot_id, r.analysis); analyzed++; if (r.annotation.type === 'issue') needsTrim++; }
      else errors++;
    } else { console.log('  Skipping ' + shot.shot_id + ': no job_id'); }
  }
  return { annotations, analyses, summary: { total_clips: totalClips, analyzed, needs_trim: needsTrim, errors } };
}

function printSummary(result: AnalysisResult): void {
  console.log('\n=== Cut Point Analysis Summary ===\n');
  console.log('Total: ' + result.summary.total_clips + ' | Analyzed: ' + result.summary.analyzed + ' | Needs trim: ' + result.summary.needs_trim + ' | Errors: ' + result.summary.errors);
  if (result.summary.needs_trim > 0) {
    console.log('\nRECOMMENDED TRIMS:');
    result.annotations.filter(a => a.type === 'issue').forEach(a => {
      const take = a.target.take_index !== undefined ? ' (take ' + a.target.take_index + ')' : '';
      console.log('  [' + a.target.shot_id + take + '] ' + a.message);
    });
  }
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: npx tsx cut-point-analyzer.ts <project.json> [--shot <id>] [--dry-run]');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const shotFilter: string[] = [];
  let projectArg = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') continue;
    if (args[i] === '--shot' && args[i + 1]) { shotFilter.push(args[++i]); continue; }
    if (args[i] === '--project-id' && args[i + 1]) { projectArg = args[++i]; continue; }
    if (!projectArg) projectArg = args[i];
  }
  if (!projectArg) { console.error('Missing project'); process.exit(1); }

  console.log('Loading project...');
  const { project, path: projectPath } = loadProject(projectArg);
  console.log('Project: ' + project.project_id + ' | Shots: ' + project.shots.length);
  if (dryRun) console.log('DRY RUN');

  console.log('\nAnalyzing clips (audio timeline)...\n');
  const result = await analyzeProject(project, { shots: shotFilter.length > 0 ? shotFilter : undefined, dryRun });

  if (!dryRun) {
    const existing = project.annotations || [];
    const newAnns = result.annotations.filter(a => !existing.some(e => e.agent === a.agent && e.target.shot_id === a.target.shot_id && e.target.take_index === a.target.take_index));
    project.annotations = [...existing, ...newAnns];
    writeFileSync(projectPath, JSON.stringify(project, null, 2));
    console.log('Saved ' + newAnns.length + ' new annotations');
  }
  printSummary(result);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
