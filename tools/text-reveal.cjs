#!/usr/bin/env node
/**
 * text-reveal.js — Generate ASS subtitle files with vertical reveal animations
 *
 * Each line of text appears with a top-down wipe effect using animated \clip regions.
 *
 * Usage:
 *   node tools/text-reveal.js <config.json> [--render] [--output path]
 *
 * Config JSON format:
 * {
 *   "width": 1080,
 *   "height": 1920,
 *   "duration": 10,
 *   "fps": 30,
 *   "font": "Helvetica Neue",
 *   "fontSize": 64,
 *   "fontColor": "&H00FFFFFF",
 *   "lineHeight": 80,
 *   "revealMs": 400,
 *   "background": "black",
 *   "lines": [
 *     { "text": "S = { 1, 2, 4 }", "y": 700, "time": 1.0 },
 *     { "text": "2 - 1 = 1", "y": 820, "time": 2.5, "revealMs": 300 }
 *   ]
 * }
 *
 * Lines can also use:
 *   "x": horizontal position (default: centered)
 *   "align": ASS alignment 1-9 (default: 5 = center)
 *   "fontSize": per-line override
 *   "fontColor": per-line override (ASS format: &H00BBGGRR)
 *   "revealMs": per-line reveal duration override
 *   "endTime": when line disappears (default: video duration)
 *   "style": named style to use (default: "Default")
 *
 * Extra styles can be defined in config:
 *   "styles": {
 *     "Title": { "fontSize": 96, "bold": true, "fontColor": "&H0000FFFF" }
 *   }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function escapeASS(text) {
  // Escape literal curly braces for libass
  return text.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function buildStyle(name, config, overrides = {}) {
  const o = { ...overrides };
  return [
    `Style: ${name}`,
    o.font || config.font || 'Helvetica Neue',
    o.fontSize || config.fontSize || 64,
    o.fontColor || config.fontColor || '&H00FFFFFF',  // Primary
    '&H00FFFFFF',  // Secondary
    '&H00000000',  // Outline
    '&H00000000',  // Back
    o.bold ? '1' : '0',       // Bold
    o.italic ? '1' : '0',     // Italic
    '0',           // Underline
    '0',           // StrikeOut
    '100',         // ScaleX
    '100',         // ScaleY
    o.spacing || '0',  // Spacing
    '0',           // Angle
    '1',           // BorderStyle
    o.outline || '0',  // Outline width
    o.shadow || '0',   // Shadow
    '5',           // Alignment (center, will be overridden per-line)
    '0', '0', '0', // Margins
    '0'            // Encoding
  ].join(',');
}

function generateASS(config) {
  const width = config.width || 1080;
  const height = config.height || 1920;
  const duration = config.duration || 10;
  const lineHeight = config.lineHeight || 80;
  const defaultRevealMs = config.revealMs || 400;
  const defaultAlign = config.align || 5;

  let ass = '';

  // Script Info
  ass += '[Script Info]\n';
  ass += 'ScriptType: v4.00+\n';
  ass += `PlayResX: ${width}\n`;
  ass += `PlayResY: ${height}\n`;
  ass += 'WrapStyle: 0\n';
  ass += '\n';

  // Styles
  ass += '[V4+ Styles]\n';
  ass += 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n';
  ass += buildStyle('Default', config) + '\n';

  // Extra named styles
  if (config.styles) {
    for (const [name, styleOverrides] of Object.entries(config.styles)) {
      ass += buildStyle(name, config, styleOverrides) + '\n';
    }
  }
  ass += '\n';

  // Events
  ass += '[Events]\n';
  ass += 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

  for (const line of config.lines) {
    const x = line.x != null ? line.x : Math.floor(width / 2);
    const y = line.y;
    const align = line.align || defaultAlign;
    const startTime = line.time;
    const endTime = line.endTime || duration;
    const revealMs = line.revealMs || defaultRevealMs;
    const style = line.style || 'Default';

    // Calculate clip region based on alignment
    // For center-aligned (5), text center is at y, so clip spans y - lineHeight/2 to y + lineHeight/2
    // For top-aligned (8), text top is at y, so clip spans y to y + lineHeight
    let clipTop, clipBottom;
    if ([7, 8, 9].includes(align)) {
      clipTop = y;
      clipBottom = y + lineHeight;
    } else if ([1, 2, 3].includes(align)) {
      clipTop = y - lineHeight;
      clipBottom = y;
    } else {
      // Middle alignment (4, 5, 6)
      clipTop = y - Math.floor(lineHeight / 2);
      clipBottom = y + Math.ceil(lineHeight / 2);
    }

    const escapedText = escapeASS(line.text);

    // Per-line style overrides
    let overrideTags = `\\pos(${x},${y})\\an${align}`;

    if (line.fontSize) overrideTags += `\\fs${line.fontSize}`;
    if (line.fontColor) overrideTags += `\\c${line.fontColor}`;

    // Clip animation: start with zero-height clip, expand to full height
    overrideTags += `\\clip(0,${clipTop},${width},${clipTop})`;
    overrideTags += `\\t(0,${revealMs},\\clip(0,${clipTop},${width},${clipBottom}))`;

    ass += `Dialogue: 0,${formatTime(startTime)},${formatTime(endTime)},${style},,0,0,0,,{${overrideTags}}${escapedText}\n`;
  }

  return ass;
}

function render(assPath, config, outputPath) {
  const width = config.width || 1080;
  const height = config.height || 1920;
  const duration = config.duration || 10;
  const fps = config.fps || 30;
  const bg = config.background || 'black';

  const cmd = [
    'ffmpeg', '-y',
    '-f', 'lavfi', '-i', `color=c=${bg}:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', `ass=${assPath}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    outputPath
  ].join(' ');

  console.log(`Rendering: ${outputPath}`);
  execSync(cmd, { stdio: 'inherit' });
  console.log(`Done: ${outputPath}`);
}

// --- CLI ---
if (require.main === module) {
  const args = process.argv.slice(2);
  const flags = args.filter(a => a.startsWith('--'));
  const positional = args.filter(a => !a.startsWith('--'));

  if (positional.length === 0) {
    console.error('Usage: node tools/text-reveal.js <config.json> [--render] [--output path]');
    process.exit(1);
  }

  const configPath = positional[0];
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const doRender = flags.includes('--render');
  const outputIdx = flags.indexOf('--output');
  const outputPath = outputIdx >= 0 ? args[args.indexOf('--output') + 1] : null;

  // Generate ASS
  const ass = generateASS(config);
  const assOut = configPath.replace(/\.json$/, '.ass');
  fs.writeFileSync(assOut, ass);
  console.log(`ASS written: ${assOut}`);

  // Optionally render
  if (doRender) {
    const videoOut = outputPath || configPath.replace(/\.json$/, '.mp4');
    render(assOut, config, videoOut);
  }
}

module.exports = { generateASS, render, escapeASS, formatTime };
