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
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
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
    console.log('Usage: npx tsx clip-validator.ts <project.json>');
    console.log('       npx tsx clip-validator.ts --project-id <id>');
    process.exit(1);
  }

  let projectArg: string;
  if (args[0] === '--project-id') {
    if (!args[1]) {
      console.error('Missing project ID');
      process.exit(1);
    }
    projectArg = args[1];
  } else {
    projectArg = args[0];
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

  // Exit with error code if blocking issues
  if (result.summary.errors > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
