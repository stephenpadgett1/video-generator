#!/usr/bin/env node
/**
 * normalize-clip.cjs — Detect and remove letterbox/pillarbox bars from a video clip.
 *
 * Veo (and some other generators) embed content inside a few pixels of black on one or more
 * edges. When such clips are spliced with bar-free clips, the transition exposes the bars.
 * This tool detects the content rectangle via ffmpeg's cropdetect and rescales the content
 * back to the frame's original dimensions (by default).
 *
 * Usage
 *   node tools/normalize-clip.cjs <input> [output] [flags]
 *
 * Flags
 *   --detect-only              Emit JSON with detection results; do not write output.
 *   --threshold=N              cropdetect luma threshold (default 24; higher = stricter).
 *   --round=N                  Snap detected crop to multiples of N px (default 2).
 *   --min-bar-px=N             Treat clip as bar-free if detected bar ≤ N px on every edge (default 0).
 *   --target=WxH               Output dimensions after rescale (default: input WxH).
 *   --sample-seconds=N         Limit cropdetect to first N seconds (default: whole clip).
 *   --crf=N                    Output quality (default 16).
 *   --preset=NAME              libx264 preset (default fast).
 *
 * Output
 *   JSON on stdout with input dims, detected content rect, and action taken.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseFlags(argv) {
  const positional = [];
  const flags = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else flags[a.slice(2)] = true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function probeRes(p) {
  const r = sh(`ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=s=x:p=0 "${p}"`).trim();
  const [w, h] = r.split('x').map(Number);
  return { w, h };
}

function probeDuration(p) {
  return parseFloat(sh(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${p}"`).trim());
}

function hasAudio(p) {
  const r = sh(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${p}"`).trim();
  return r.length > 0;
}

function detectCrop(input, opts) {
  const threshold = parseInt(opts.threshold || '24', 10);
  const round = parseInt(opts.round || '2', 10);
  const sampleSeconds = opts['sample-seconds'] ? parseFloat(opts['sample-seconds']) : null;
  const tArg = sampleSeconds ? `-t ${sampleSeconds}` : '';
  const out = execSync(
    `ffmpeg -hide_banner ${tArg} -i "${input}" -vf "cropdetect=${threshold}:${round}:0" -f null /dev/null 2>&1 || true`,
    { maxBuffer: 50 * 1024 * 1024 }
  ).toString();

  const crops = [];
  for (const line of out.split('\n')) {
    const m = line.match(/crop=(\d+):(\d+):(\d+):(\d+)/);
    if (m) crops.push({ w: +m[1], h: +m[2], x: +m[3], y: +m[4] });
  }
  if (!crops.length) return null;

  // Consensus: the most-frequent crop across samples. Cropdetect is noisy on dark content,
  // so taking the mode is more robust than intersecting all samples.
  const counts = {};
  for (const c of crops) {
    const key = `${c.w}:${c.h}:${c.x}:${c.y}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [w, h, x, y] = sorted[0][0].split(':').map(Number);
  return {
    w,
    h,
    x,
    y,
    samples: crops.length,
    consensus_frequency: +(sorted[0][1] / crops.length).toFixed(3),
    distinct_crops: sorted.length,
  };
}

function describeBars(res, detected) {
  if (!detected) return { left: 0, right: 0, top: 0, bottom: 0 };
  return {
    left: detected.x,
    right: res.w - detected.x - detected.w,
    top: detected.y,
    bottom: res.h - detected.y - detected.h,
  };
}

function normalize(input, output, opts) {
  const res = probeRes(input);
  const detected = detectCrop(input, opts);
  const bars = describeBars(res, detected);
  const maxBar = Math.max(bars.left, bars.right, bars.top, bars.bottom);
  const minBarPx = parseInt(opts['min-bar-px'] || '0', 10);

  if (!detected || maxBar <= minBarPx) {
    // No meaningful bars — stream copy.
    if (output) {
      execSync(`ffmpeg -v error -i "${input}" -c copy "${output}" -y`);
    }
    return {
      input: res,
      detected,
      bars,
      has_bars: false,
      action: output ? 'copied_no_bars' : 'detect_only',
      output,
    };
  }

  let targetW = res.w;
  let targetH = res.h;
  if (opts.target) {
    const m = /^(\d+)x(\d+)$/.exec(opts.target);
    if (!m) throw new Error(`--target must be WxH, got ${opts.target}`);
    targetW = parseInt(m[1], 10);
    targetH = parseInt(m[2], 10);
  }

  if (!output) {
    return { input: res, detected, bars, has_bars: true, action: 'detect_only' };
  }

  const crf = opts.crf || '16';
  const preset = opts.preset || 'fast';
  const filter = `crop=${detected.w}:${detected.h}:${detected.x}:${detected.y},scale=${targetW}:${targetH}:flags=lanczos`;

  const audio = hasAudio(input);
  const args = [
    '-v', 'error', '-stats',
    '-i', input,
    '-vf', filter,
    '-c:v', 'libx264', '-crf', String(crf), '-preset', String(preset), '-pix_fmt', 'yuv420p',
  ];
  if (audio) args.push('-c:a', 'copy'); // audio unaffected by crop; stream-copy preserves quality
  args.push('-y', output);

  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg exited ${r.status}`);

  return {
    input: res,
    detected,
    bars,
    has_bars: true,
    action: 'cropped_and_rescaled',
    target: { w: targetW, h: targetH },
    output,
  };
}

function main() {
  const [, , input, maybeOutput, ...rest] = process.argv;
  if (!input) {
    console.error('Usage: node tools/normalize-clip.cjs <input> [output] [flags]');
    console.error('       Use --detect-only to print detection JSON without writing output.');
    process.exit(2);
  }
  const restArgs = maybeOutput && maybeOutput.startsWith('--') ? [maybeOutput, ...rest] : rest;
  const output = maybeOutput && !maybeOutput.startsWith('--') ? maybeOutput : null;
  const { flags } = parseFlags(restArgs);

  const result = normalize(input, flags['detect-only'] ? null : output, flags);
  console.log(JSON.stringify(result, null, 2));
}

main();
