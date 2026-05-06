#!/usr/bin/env node
/**
 * isolate-track.cjs — produce silent-picture and/or audio-only versions of a
 * video for editorial sanity checks. The classic editor's drill: watch the
 * cut with no sound; listen to the mix with no picture. Each pass forces you
 * to evaluate one track at a time and surfaces problems that hide when the
 * eye and ear cooperate.
 *
 * Modes
 *   picture   — same video, audio replaced with silence (so QuickTime / VLC
 *               loads it without errors). Stream-copies video for speed.
 *   audio     — black-frame video at low resolution, original audio. The
 *               video track exists only so generic players (which often
 *               can't open audio-only MP4) will play it.
 *   both      — both outputs (default).
 *
 * Usage
 *   node tools/isolate-track.cjs <video> [--mode=picture|audio|both] [--out-dir=DIR]
 *
 * Output
 *   <out-dir>/<basename>_silent.mp4
 *   <out-dir>/<basename>_audio.mp4
 *   JSON to stdout: { picture?: path, audio?: path }
 */

const { execSync } = require('child_process');
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

function probeDuration(p) {
  return parseFloat(sh(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${p}"`).trim());
}

function probeRes(p) {
  const r = sh(`ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=s=x:p=0 "${p}"`).trim();
  const [w, h] = r.split('x').map(Number);
  return { w, h };
}

function renderSilent(input, output) {
  // Stream-copy video, replace audio with silence at the same duration.
  // We use anullsrc instead of -an because some players (and downstream
  // ffmpeg pipelines) misbehave with audio-less MP4.
  execSync(
    `ffmpeg -hide_banner -loglevel error -y ` +
    `-i "${input}" -f lavfi -i "anullsrc=r=48000:cl=stereo" ` +
    `-map 0:v -map 1:a ` +
    `-c:v copy -c:a aac -b:a 96k -shortest "${output}"`
  );
}

function renderAudioOnly(input, output) {
  // Tiny black video so the file is a real MP4. 320x180 keeps it small.
  // We use lavfi color source with the same duration as the input.
  const dur = probeDuration(input);
  execSync(
    `ffmpeg -hide_banner -loglevel error -y ` +
    `-f lavfi -i "color=c=black:s=320x180:r=24:d=${dur}" ` +
    `-i "${input}" ` +
    `-map 0:v -map 1:a ` +
    `-c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p ` +
    `-c:a copy -shortest "${output}"`
  );
}

function main() {
  const [, , input, ...rest] = process.argv;
  if (!input || input.startsWith('--')) {
    console.error('Usage: node tools/isolate-track.cjs <video> [--mode=picture|audio|both] [--out-dir=DIR]');
    process.exit(2);
  }
  if (!fs.existsSync(input)) {
    console.error(`video not found: ${input}`);
    process.exit(2);
  }
  const { flags } = parseFlags(rest);

  const mode = flags.mode || 'both';
  if (!['picture', 'audio', 'both'].includes(mode)) {
    console.error(`--mode must be picture|audio|both, got "${mode}"`);
    process.exit(2);
  }

  const outDir = flags['out-dir'] || path.dirname(input);
  fs.mkdirSync(outDir, { recursive: true });

  const base = path.basename(input, path.extname(input));
  const result = { input };

  if (mode === 'picture' || mode === 'both') {
    const out = path.join(outDir, `${base}_silent.mp4`);
    renderSilent(input, out);
    result.picture = path.relative(process.cwd(), out);
  }
  if (mode === 'audio' || mode === 'both') {
    const out = path.join(outDir, `${base}_audio.mp4`);
    renderAudioOnly(input, out);
    result.audio = path.relative(process.cwd(), out);
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
