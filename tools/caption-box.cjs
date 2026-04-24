#!/usr/bin/env node
/**
 * caption-box.cjs — Social-media style white-box black-text captions.
 *
 * Usage:
 *   node tools/caption-box.cjs <config.json> [--output path]
 *
 * See .claude/skills/caption-box/SKILL.md for the full config schema.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function wrapText(text, maxChars) {
  if (!maxChars || text.includes('\n')) return text;
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

function resolvePosition(position) {
  if (position && typeof position === 'object') {
    const x = position.x !== undefined ? position.x : '(w-text_w)/2';
    const y = position.y !== undefined ? position.y : 'h*0.72-text_h/2';
    return { x: String(x), y: String(y) };
  }
  switch (position || 'bottom-third') {
    case 'top':
      return { x: '(w-text_w)/2', y: 'h*0.10' };
    case 'center':
      return { x: '(w-text_w)/2', y: '(h-text_h)/2' };
    case 'bottom-third':
    default:
      return { x: '(w-text_w)/2', y: 'h*0.72-text_h/2' };
  }
}

function buildDrawtext(cap, defaults, textfile) {
  const pos = resolvePosition(cap.position);
  const fontSize = cap.fontSize || defaults.fontSize;
  const fontColor = cap.fontColor || defaults.fontColor;
  const boxColor = cap.boxColor || defaults.boxColor;
  const boxPadding = cap.boxPadding !== undefined ? cap.boxPadding : defaults.boxPadding;
  const lineSpacing = cap.lineSpacing !== undefined ? cap.lineSpacing : defaults.lineSpacing;

  const fontSpec = defaults.fontFile
    ? `fontfile=${defaults.fontFile}`
    : `font=${defaults.font}`;

  const parts = [
    `drawtext=${fontSpec}`,
    `text_align=C`,
    `fontsize=${fontSize}`,
    `fontcolor=${fontColor}`,
    `box=1`,
    `boxcolor=${boxColor}`,
    `boxborderw=${boxPadding}`,
    `line_spacing=${lineSpacing}`,
    `textfile=${textfile}`,
    `x=${pos.x}`,
    `y=${pos.y}`,
    `enable='between(t,${cap.start},${cap.end})'`,
  ];
  return parts.join(':');
}

function main() {
  const args = process.argv.slice(2);
  const configPath = args[0];
  if (!configPath || configPath.startsWith('--')) {
    console.error('Usage: node tools/caption-box.cjs <config.json> [--output path]');
    process.exit(1);
  }

  const outputIdx = args.indexOf('--output');
  const outputOverride = outputIdx >= 0 ? args[outputIdx + 1] : null;

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.input) throw new Error('config.input required');
  const output = outputOverride || config.output;
  if (!output) throw new Error('output required (config.output or --output)');
  if (!Array.isArray(config.captions) || config.captions.length === 0) {
    throw new Error('config.captions must be a non-empty array');
  }

  const defaults = {
    font: config.font || 'Helvetica Neue',
    fontFile: config.fontFile || null,
    fontSize: config.fontSize || 48,
    boxPadding: config.boxPadding !== undefined ? config.boxPadding : 20,
    boxColor: config.boxColor || 'white',
    fontColor: config.fontColor || 'black',
    lineSpacing: config.lineSpacing !== undefined ? config.lineSpacing : 8,
  };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caption-box-'));
  const textfiles = [];

  const filterParts = config.captions.map((cap, i) => {
    if (cap.text === undefined) throw new Error(`caption ${i}: text required`);
    if (cap.start === undefined || cap.end === undefined) {
      throw new Error(`caption ${i}: start and end required`);
    }
    const wrapped = wrapText(cap.text, cap.maxChars);
    const textfile = path.join(tmpDir, `cap_${i}.txt`);
    fs.writeFileSync(textfile, wrapped);
    textfiles.push(textfile);
    return buildDrawtext(cap, defaults, textfile);
  });

  const filterChain = filterParts.join(',');

  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });

  const ffArgs = [
    '-y',
    '-i', config.input,
    '-vf', filterChain,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    output,
  ];

  console.error(`ffmpeg ${ffArgs.map(a => (a.includes(' ') || a.includes(',')) ? `"${a}"` : a).join(' ')}`);

  const result = spawnSync('ffmpeg', ffArgs, { stdio: 'inherit' });

  for (const tf of textfiles) { try { fs.unlinkSync(tf); } catch {} }
  try { fs.rmdirSync(tmpDir); } catch {}

  if (result.status !== 0) {
    console.error(`ffmpeg exited with status ${result.status}`);
    process.exit(result.status || 1);
  }

  console.log(output);
}

main();
