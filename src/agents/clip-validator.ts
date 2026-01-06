/**
 * Clip Validator Agent
 *
 * Validates generated video clips using ffprobe.
 * Writes structured annotations to project JSON for other agents.
 *
 * Checks:
 * - Video file exists (completeness)
 * - Duration matches target ±0.5s (timing)
 * - Has audio track (audio)
 * - Audio not silent for dialogue shots (audio)
 * - Resolution matches expected aspect ratio (visual)
 *
 * Usage:
 *   npx tsx clip-validator.ts project.json
 *   npx tsx clip-validator.ts --project-id <id>
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve, basename, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import type {
  AnnotatedProject,
  Annotation,
  AnnotationCategory,
  AnnotationSeverity,
  Shot
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = resolve(__dirname, '../../data/video');
const PROJECTS_DIR = resolve(__dirname, '../../data/projects');
const JOBS_FILE = resolve(__dirname, '../../jobs.json');
const EXPORTS_DIR = resolve(__dirname, '../../data/exports');

// Tolerance for duration matching
const DURATION_TOLERANCE = 0.5;

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

// Volume threshold for "silent" detection (dB)
const SILENCE_THRESHOLD = -40;

interface FfprobeResult {
  streams: Array<{
    codec_type: string;
    width?: number;
    height?: number;
    duration?: string;
  }>;
  format: {
    duration: string;
    filename: string;
  };
}

interface VolumeDetectResult {
  mean_volume: number;
  max_volume: number;
}

function generateAnnotationId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `ann_${timestamp}_${random}`;
}

function ffprobe(videoPath: string): FfprobeResult | null {
  try {
    const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
    const output = execSync(cmd, { encoding: 'utf-8' });
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function detectVolume(videoPath: string): VolumeDetectResult | null {
  try {
    const cmd = `ffmpeg -i "${videoPath}" -af volumedetect -f null - 2>&1`;
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

    const meanMatch = output.match(/mean_volume:\s*([-\d.]+)\s*dB/);
    const maxMatch = output.match(/max_volume:\s*([-\d.]+)\s*dB/);

    if (meanMatch && maxMatch) {
      return {
        mean_volume: parseFloat(meanMatch[1]),
        max_volume: parseFloat(maxMatch[1])
      };
    }
    return null;
  } catch {
    return null;
  }
}

function getVideoPath(jobId: string): string | null {
  const jobs = loadJobsCache();
  const job = jobs.get(jobId);

  if (!job || !job.result?.filename) {
    return null;
  }

  return resolve(VIDEO_DIR, job.result.filename);
}

function createAnnotation(
  shotId: string,
  category: AnnotationCategory,
  type: 'issue' | 'passed',
  message: string,
  severity: AnnotationSeverity,
  takeIndex?: number
): Annotation {
  return {
    id: generateAnnotationId(),
    agent: 'clip-validator',
    timestamp: new Date().toISOString(),
    target: {
      shot_id: shotId,
      ...(takeIndex !== undefined && { take_index: takeIndex })
    },
    type,
    category,
    message,
    severity,
    resolved: false
  };
}

interface ValidationResult {
  annotations: Annotation[];
  summary: {
    total_clips: number;
    passed: number;
    warnings: number;
    errors: number;
  };
}

function validateClip(
  shot: Shot,
  jobId: string,
  takeIndex?: number
): Annotation[] {
  const annotations: Annotation[] = [];
  const videoPath = getVideoPath(jobId);
  const shotId = shot.shot_id;

  // Check 1: File exists (first check if job has a result)
  if (!videoPath) {
    annotations.push(createAnnotation(
      shotId,
      'completeness',
      'issue',
      `Job ${jobId} not found or has no video result`,
      'error',
      takeIndex
    ));
    return annotations; // Can't do other checks without the file
  }

  if (!existsSync(videoPath)) {
    annotations.push(createAnnotation(
      shotId,
      'completeness',
      'issue',
      `Video file not found: ${basename(videoPath)}`,
      'error',
      takeIndex
    ));
    return annotations; // Can't do other checks without the file
  }

  annotations.push(createAnnotation(
    shotId,
    'completeness',
    'passed',
    `Video file exists: ${basename(videoPath)}`,
    'info',
    takeIndex
  ));

  // Run ffprobe
  const probe = ffprobe(videoPath);
  if (!probe) {
    annotations.push(createAnnotation(
      shotId,
      'completeness',
      'issue',
      'Failed to probe video file',
      'error',
      takeIndex
    ));
    return annotations;
  }

  // Check 2: Duration matches target
  const actualDuration = parseFloat(probe.format.duration);
  const targetDuration = shot.duration_target;
  const durationDiff = Math.abs(actualDuration - targetDuration);

  if (durationDiff <= DURATION_TOLERANCE) {
    annotations.push(createAnnotation(
      shotId,
      'timing',
      'passed',
      `Duration ${actualDuration.toFixed(1)}s matches target ${targetDuration}s`,
      'info',
      takeIndex
    ));
  } else {
    annotations.push(createAnnotation(
      shotId,
      'timing',
      'issue',
      `Duration ${actualDuration.toFixed(1)}s differs from target ${targetDuration}s by ${durationDiff.toFixed(1)}s`,
      durationDiff > 2 ? 'warning' : 'info',
      takeIndex
    ));
  }

  // Check 3: Has audio track
  const audioStream = probe.streams.find(s => s.codec_type === 'audio');
  if (!audioStream) {
    annotations.push(createAnnotation(
      shotId,
      'audio',
      'issue',
      'No audio track found',
      'warning',
      takeIndex
    ));
  } else {
    annotations.push(createAnnotation(
      shotId,
      'audio',
      'passed',
      'Audio track present',
      'info',
      takeIndex
    ));

    // Check 4: Audio not silent for dialogue shots
    if (shot.dialogue && shot.dialogue.length > 0) {
      const volume = detectVolume(videoPath);
      if (volume) {
        if (volume.mean_volume < SILENCE_THRESHOLD) {
          annotations.push(createAnnotation(
            shotId,
            'audio',
            'issue',
            `Audio nearly silent (mean ${volume.mean_volume.toFixed(1)}dB) but shot has dialogue`,
            'warning',
            takeIndex
          ));
        } else {
          annotations.push(createAnnotation(
            shotId,
            'audio',
            'passed',
            `Dialogue audio levels OK (mean ${volume.mean_volume.toFixed(1)}dB)`,
            'info',
            takeIndex
          ));
        }
      }
    }
  }

  // Check 5: Resolution matches expected aspect ratio
  const videoStream = probe.streams.find(s => s.codec_type === 'video');
  if (videoStream && videoStream.width && videoStream.height) {
    const width = videoStream.width;
    const height = videoStream.height;
    const ratio = width / height;

    // Determine expected ratio from common sizes
    let aspectLabel: string;
    if (ratio > 1.5) {
      aspectLabel = '16:9 (landscape)';
    } else if (ratio < 0.7) {
      aspectLabel = '9:16 (portrait)';
    } else {
      aspectLabel = `${(ratio).toFixed(2)}:1`;
    }

    annotations.push(createAnnotation(
      shotId,
      'visual',
      'passed',
      `Resolution ${width}x${height} (${aspectLabel})`,
      'info',
      takeIndex
    ));
  }

  return annotations;
}

function validateProject(project: AnnotatedProject): ValidationResult {
  const annotations: Annotation[] = [];
  let totalClips = 0;

  for (const shot of project.shots) {
    // Check if multi-take shot
    const takeJobIds = (shot as any).take_job_ids as string[] | undefined;

    if (takeJobIds && takeJobIds.length > 0) {
      // Multi-take shot: validate each take
      for (let i = 0; i < takeJobIds.length; i++) {
        totalClips++;
        const clipAnnotations = validateClip(shot, takeJobIds[i], i);
        annotations.push(...clipAnnotations);
      }
    } else {
      // Single-take shot: use job_id
      const jobId = (shot as any).job_id as string | undefined;
      if (jobId) {
        totalClips++;
        const clipAnnotations = validateClip(shot, jobId);
        annotations.push(...clipAnnotations);
      }
    }
  }

  // Calculate summary
  const passed = annotations.filter(a => a.type === 'passed').length;
  const warnings = annotations.filter(a => a.type === 'issue' && a.severity === 'warning').length;
  const errors = annotations.filter(a => a.type === 'issue' && a.severity === 'error').length;

  return {
    annotations,
    summary: {
      total_clips: totalClips,
      passed,
      warnings,
      errors
    }
  };
}

function loadProject(pathOrId: string): { project: AnnotatedProject; path: string } {
  let projectPath: string;

  if (pathOrId.endsWith('.json')) {
    // Direct path
    projectPath = resolve(pathOrId);
  } else if (pathOrId.startsWith('--project-id')) {
    throw new Error('Use --project-id <id> format');
  } else {
    // Project ID - find in projects directory
    const files = require('fs').readdirSync(PROJECTS_DIR);
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

// Visual output types
interface ClipInfo {
  shotId: string;
  takeIndex?: number;
  videoPath: string;
  annotations: Annotation[];
}

function getSeverityColor(severity: AnnotationSeverity): string {
  switch (severity) {
    case 'error': return 'red';
    case 'warning': return 'yellow';
    case 'info': return 'green';
    default: return 'white';
  }
}

function getSeveritySymbol(type: 'issue' | 'passed', severity: AnnotationSeverity): string {
  if (type === 'passed') return 'OK';
  switch (severity) {
    case 'error': return 'ERR';
    case 'warning': return 'WARN';
    default: return 'OK';
  }
}

function escapeDrawtext(text: string): string {
  // Escape special characters for ffmpeg drawtext
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function buildClipList(project: AnnotatedProject, annotations: Annotation[]): ClipInfo[] {
  const clips: ClipInfo[] = [];

  for (const shot of project.shots) {
    const takeJobIds = (shot as any).take_job_ids as string[] | undefined;

    if (takeJobIds && takeJobIds.length > 0) {
      for (let i = 0; i < takeJobIds.length; i++) {
        const videoPath = getVideoPath(takeJobIds[i]);
        if (videoPath && existsSync(videoPath)) {
          const clipAnnotations = annotations.filter(
            a => a.target.shot_id === shot.shot_id && a.target.take_index === i
          );
          clips.push({
            shotId: shot.shot_id,
            takeIndex: i,
            videoPath,
            annotations: clipAnnotations
          });
        }
      }
    } else {
      const jobId = (shot as any).job_id as string | undefined;
      if (jobId) {
        const videoPath = getVideoPath(jobId);
        if (videoPath && existsSync(videoPath)) {
          const clipAnnotations = annotations.filter(
            a => a.target.shot_id === shot.shot_id && a.target.take_index === undefined
          );
          clips.push({
            shotId: shot.shot_id,
            videoPath,
            annotations: clipAnnotations
          });
        }
      }
    }
  }

  return clips;
}

function buildDrawtextFilter(clip: ClipInfo): string {
  const filters: string[] = [];

  // Header: shot ID and take
  const takeLabel = clip.takeIndex !== undefined ? ` (take ${clip.takeIndex})` : '';
  const header = escapeDrawtext(`${clip.shotId}${takeLabel}`);
  filters.push(
    `drawtext=text='${header}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=20:y=20`
  );

  // Agent name
  filters.push(
    `drawtext=text='clip-validator':fontsize=18:fontcolor=gray:borderw=1:bordercolor=black:x=20:y=50`
  );

  // Annotation results at bottom (stack upward)
  const maxLines = 5;
  const relevantAnnotations = clip.annotations.slice(0, maxLines);
  const lineHeight = 25;
  const bottomMargin = 30;

  relevantAnnotations.forEach((ann, idx) => {
    const symbol = getSeveritySymbol(ann.type, ann.severity);
    const color = getSeverityColor(ann.severity);
    const text = escapeDrawtext(`[${symbol}] ${ann.message}`);
    const yPos = `h-${bottomMargin + (relevantAnnotations.length - 1 - idx) * lineHeight}`;

    filters.push(
      `drawtext=text='${text}':fontsize=16:fontcolor=${color}:borderw=1:bordercolor=black:x=20:y=${yPos}`
    );
  });

  return filters.join(',');
}

async function assembleWithAnnotations(
  project: AnnotatedProject,
  annotations: Annotation[]
): Promise<string> {
  const clips = buildClipList(project, annotations);

  if (clips.length === 0) {
    throw new Error('No valid clips found to assemble');
  }

  console.log(`\nAssembling ${clips.length} clips with annotations...`);

  // Create temp directory for intermediate files
  const tempDir = join(tmpdir(), `clip-validator-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  // Ensure exports directory exists
  mkdirSync(EXPORTS_DIR, { recursive: true });

  const annotatedClips: string[] = [];

  // Step 1: Create annotated version of each clip
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const outputPath = join(tempDir, `clip_${i}.mp4`);
    const filter = buildDrawtextFilter(clip);

    console.log(`  Processing ${clip.shotId}${clip.takeIndex !== undefined ? ` (take ${clip.takeIndex})` : ''}...`);

    const cmd = `ffmpeg -y -i "${clip.videoPath}" -vf "${filter}" -c:v libx264 -preset fast -crf 23 -c:a copy "${outputPath}"`;

    try {
      execSync(cmd, { stdio: 'pipe' });
      annotatedClips.push(outputPath);
    } catch (err: any) {
      console.error(`  Failed to process clip: ${err.message}`);
      throw err;
    }
  }

  // Step 2: Create concat file
  const concatFile = join(tempDir, 'concat.txt');
  const concatContent = annotatedClips.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
  writeFileSync(concatFile, concatContent);

  // Step 3: Concatenate all clips
  const outputFilename = `${project.project_id}_validated.mp4`;
  const outputPath = join(EXPORTS_DIR, outputFilename);

  console.log('  Concatenating clips...');

  // Use filter_complex concat for better compatibility with varying durations/formats
  const inputArgs = annotatedClips.map(p => `-i "${p}"`).join(' ');
  const filterInputs = annotatedClips.map((_, i) => `[${i}:v][${i}:a]`).join('');
  const concatCmd = `ffmpeg -y ${inputArgs} -filter_complex "${filterInputs}concat=n=${annotatedClips.length}:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 "${outputPath}"`;

  try {
    execSync(concatCmd, { stdio: 'pipe' });
  } catch (err: any) {
    console.error(`  Failed to concatenate: ${err.message}`);
    throw err;
  }

  // Cleanup temp files
  try {
    const fs = require('fs');
    for (const f of annotatedClips) {
      fs.unlinkSync(f);
    }
    fs.unlinkSync(concatFile);
    fs.rmdirSync(tempDir);
  } catch {
    // Ignore cleanup errors
  }

  return outputPath;
}

function printSummary(result: ValidationResult): void {
  console.log('\n=== Clip Validator Summary ===\n');
  console.log(`Total clips: ${result.summary.total_clips}`);
  console.log(`Checks passed: ${result.summary.passed}`);
  console.log(`Warnings: ${result.summary.warnings}`);
  console.log(`Errors: ${result.summary.errors}`);

  if (result.summary.errors > 0) {
    console.log('\nERRORS:');
    result.annotations
      .filter(a => a.severity === 'error')
      .forEach(a => {
        const take = a.target.take_index !== undefined ? ` (take ${a.target.take_index})` : '';
        console.log(`  [${a.target.shot_id}${take}] ${a.message}`);
      });
  }

  if (result.summary.warnings > 0) {
    console.log('\nWARNINGS:');
    result.annotations
      .filter(a => a.severity === 'warning')
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
    console.log('Usage: npx tsx clip-validator.ts <project.json> [--visual]');
    console.log('       npx tsx clip-validator.ts --project-id <id> [--visual]');
    console.log('\nOptions:');
    console.log('  --visual    Generate annotated video output');
    process.exit(1);
  }

  // Parse flags
  const visualMode = args.includes('--visual');
  const filteredArgs = args.filter(a => a !== '--visual');

  let projectArg: string;
  if (filteredArgs[0] === '--project-id') {
    if (!filteredArgs[1]) {
      console.error('Missing project ID');
      process.exit(1);
    }
    projectArg = filteredArgs[1];
  } else {
    projectArg = filteredArgs[0];
  }

  console.log('Loading project...');
  const { project, path: projectPath } = loadProject(projectArg);
  console.log(`Project: ${project.project_id}`);
  console.log(`Shots: ${project.shots.length}`);

  console.log('\nValidating clips...\n');
  const result = validateProject(project);

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

  printSummary(result);

  // Generate visual output if requested
  if (visualMode) {
    try {
      const outputPath = await assembleWithAnnotations(project, result.annotations);
      console.log(`\nVisual output: ${outputPath}`);
    } catch (err: any) {
      console.error(`\nFailed to generate visual output: ${err.message}`);
    }
  }

  // Exit with error code if blocking issues
  if (result.summary.errors > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
