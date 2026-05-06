#!/usr/bin/env node
/**
 * cut-pair-inspector.cjs — for each cut in a video, extract the last frame
 * before the cut and the first frame after, write them side-by-side as a
 * single comparison image, and (optionally) render a short preview clip
 * around the cut.
 *
 * Use this to evaluate whether two adjacent shots actually flow into each
 * other or whether the cut is a visual jump. Especially useful before
 * locking a draft assembly.
 *
 * Cut sources (in order of preference):
 *   1. --at=T1,T2,...           Explicit cut timestamps (seconds)
 *   2. --auto                   Detect cuts via ffmpeg scene detection
 *   3. (default)                If neither, prints a usage hint
 *
 * Usage
 *   node tools/cut-pair-inspector.cjs <video> --at=6.0,15.6 [--out=DIR] [--preview]
 *   node tools/cut-pair-inspector.cjs <video> --auto [--scene-threshold=0.4]
 *
 * Flags
 *   --at=LIST                Comma-separated cut timestamps in seconds.
 *   --auto                   Auto-detect cuts via ffmpeg scene filter.
 *   --scene-threshold=N      Threshold for --auto (default 0.4).
 *   --pre-offset=SEC         How far before each cut to grab the "last A" frame (default 0.05).
 *   --post-offset=SEC        How far after each cut to grab the "first B" frame (default 0.05).
 *   --out=DIR                Output directory (default: alongside the video, in qa-cuts/).
 *   --preview                Also render a 1.5s clip centered on each cut (-0.75 / +0.75).
 *   --preview-duration=SEC   Override preview duration.
 *   --json                   Emit JSON only (no stdout summary).
 *
 * Output
 *   For each cut at time T:
 *     <out>/cut_<T>_a_pre.png   — frame at T - pre-offset
 *     <out>/cut_<T>_b_post.png  — frame at T + post-offset
 *     <out>/cut_<T>_compare.png — side-by-side composite (A | B)
 *     <out>/cut_<T>_preview.mp4 — (optional) preview clip
 *
 *   JSON to stdout: { video, duration, cuts: [{ t, frames: {a, b, compare, preview?} }] }
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

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString();
}

function probeDuration(p) {
  return parseFloat(sh(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${p}"`).trim());
}

function probeRes(p) {
  const r = sh(`ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=s=x:p=0 "${p}"`).trim();
  const [w, h] = r.split('x').map(Number);
  return { w, h };
}

function detectCuts(videoPath, threshold) {
  const out = execSync(
    `ffmpeg -hide_banner -i "${videoPath}" -vf "select='gt(scene,${threshold})',showinfo" -f null - 2>&1 || true`,
    { maxBuffer: 50 * 1024 * 1024 }
  ).toString();
  const cuts = [];
  for (const line of out.split('\n')) {
    const m = line.match(/pts_time:([\d.]+)/);
    if (m) cuts.push(parseFloat(m[1]));
  }
  return cuts;
}

function extractFrame(video, t, outPath) {
  // Slow seek (-ss after -i) for frame-accuracy. Cuts often coincide with
  // I-frames; fast seek will snap to the cut's I-frame and lose the "before
  // cut" frame entirely. Worth the per-frame decode cost.
  // -update 1 marks the output as a single-image sink (silences a warning on PNG).
  execSync(
    `ffmpeg -hide_banner -loglevel error -y -i "${video}" -ss ${t} -frames:v 1 -update 1 "${outPath}"`
  );
}

function makeComposite(aPath, bPath, outPath) {
  // hstack the two frames with a 4px white divider so the boundary is unambiguous.
  // pad=iw+4 adds a 4px-wide column on the right of A; then hstack onto B.
  execSync(
    `ffmpeg -hide_banner -loglevel error -y ` +
    `-i "${aPath}" -i "${bPath}" ` +
    `-filter_complex "[0:v]pad=iw+4:ih:0:0:white[ap];[ap][1:v]hstack=inputs=2[out]" ` +
    `-map "[out]" "${outPath}"`
  );
}

function makePreview(video, t, durationSec, outPath) {
  const start = Math.max(0, t - durationSec / 2);
  // Re-encode for a clean clip at any timestamp (stream copy snaps to keyframe).
  execSync(
    `ffmpeg -hide_banner -loglevel error -y -ss ${start} -i "${video}" -t ${durationSec} ` +
    `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
    `-c:a aac -b:a 192k ` +
    `"${outPath}"`
  );
}

function fmtTime(t) {
  return t.toFixed(2).replace('.', '_');
}

function main() {
  const [, , video, ...rest] = process.argv;
  if (!video || video.startsWith('--')) {
    console.error('Usage: node tools/cut-pair-inspector.cjs <video> [--at=LIST | --auto] [flags]');
    console.error('See header for full flag list.');
    process.exit(2);
  }

  const { flags } = parseFlags(rest);

  if (!fs.existsSync(video)) {
    console.error(`video not found: ${video}`);
    process.exit(2);
  }

  const duration = probeDuration(video);
  const res = probeRes(video);

  // Resolve cut list.
  let cuts = [];
  if (flags.at) {
    cuts = String(flags.at).split(',').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
  } else if (flags.auto) {
    const threshold = parseFloat(flags['scene-threshold'] || '0.4');
    cuts = detectCuts(video, threshold);
  }

  if (cuts.length === 0) {
    console.error('No cuts to inspect. Pass --at=T1,T2,... or --auto.');
    process.exit(2);
  }

  // Resolve out dir.
  const dir = flags.out || path.join(path.dirname(video), 'qa-cuts');
  fs.mkdirSync(dir, { recursive: true });

  const preOffset = parseFloat(flags['pre-offset'] || '0.05');
  const postOffset = parseFloat(flags['post-offset'] || '0.05');
  const wantPreview = !!flags.preview;
  const previewDuration = parseFloat(flags['preview-duration'] || '1.5');

  const results = [];
  for (const t of cuts) {
    if (t <= 0 || t >= duration) continue;
    const tag = fmtTime(t);
    const aPath = path.join(dir, `cut_${tag}_a_pre.png`);
    const bPath = path.join(dir, `cut_${tag}_b_post.png`);
    const cPath = path.join(dir, `cut_${tag}_compare.png`);

    extractFrame(video, Math.max(0, t - preOffset), aPath);
    extractFrame(video, Math.min(duration - 1 / 30, t + postOffset), bPath);
    makeComposite(aPath, bPath, cPath);

    const entry = {
      t,
      frames: {
        a: path.relative(process.cwd(), aPath),
        b: path.relative(process.cwd(), bPath),
        compare: path.relative(process.cwd(), cPath),
      },
    };

    if (wantPreview) {
      const pPath = path.join(dir, `cut_${tag}_preview.mp4`);
      makePreview(video, t, previewDuration, pPath);
      entry.frames.preview = path.relative(process.cwd(), pPath);
    }

    results.push(entry);
  }

  const out = {
    video,
    duration,
    resolution: res,
    cuts: results,
    out_dir: path.relative(process.cwd(), dir),
  };

  if (flags.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(JSON.stringify(out, null, 2));
    console.log();
    for (const r of results) {
      console.log(`  cut @ ${r.t.toFixed(2)}s → ${r.frames.compare}`);
    }
  }
}

main();
