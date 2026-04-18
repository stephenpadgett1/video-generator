---
name: text-reveal
description: Generate animated text overlays with vertical reveal (top-down wipe) effects. Use when creating math equations, step-by-step text, title sequences, or any text that should appear line-by-line with a wipe animation.
allowed-tools: Bash, Read, Write, Glob
context: fork
---

# Text Reveal

Generate ASS subtitle files with vertical reveal (top-down wipe) animations, then render or overlay onto video.

## Tool

`node tools/text-reveal.cjs <config.json> [--render] [--output path]`

## Config Format

Create a JSON config file with lines, positions, and timings:

```json
{
  "width": 1080,
  "height": 1920,
  "duration": 10,
  "fps": 30,
  "font": "Helvetica Neue",
  "fontSize": 64,
  "fontColor": "&H00FFFFFF",
  "lineHeight": 80,
  "revealMs": 400,
  "background": "black",
  "lines": [
    { "text": "S = { 1, 2, 4 }", "y": 730, "time": 1.0 },
    { "text": "2 - 1 = 1", "y": 850, "time": 2.5 }
  ]
}
```

## Steps

1. **Create config** — Write a JSON config file in `data/workspace/` with the lines, positions, and timings.

2. **Generate ASS + render** — Run the tool with `--render`:
   ```bash
   node tools/text-reveal.cjs data/workspace/config.json --render --output data/workspace/output.mp4
   ```

3. **Or generate ASS only** — For overlaying on existing video:
   ```bash
   node tools/text-reveal.cjs data/workspace/config.json
   ffmpeg -y -i background.mp4 -vf "ass=data/workspace/config.ass" -c:v libx264 -crf 18 output.mp4
   ```

## Per-Line Options

| Option | Default | Purpose |
|--------|---------|---------|
| `text` | required | Text to display (curly braces auto-escaped) |
| `y` | required | Vertical position in pixels |
| `time` | required | Appear time in seconds |
| `x` | center | Horizontal position |
| `align` | 5 (center) | ASS alignment 1-9 |
| `fontSize` | inherit | Per-line font size override |
| `fontColor` | inherit | Per-line color (ASS: `&H00BBGGRR`) |
| `revealMs` | 400 | Reveal animation duration in ms |
| `endTime` | duration | When line disappears |
| `style` | "Default" | Named style to use |

## Named Styles

Define extra styles in config for different text treatments:

```json
{
  "styles": {
    "Title": { "fontSize": 96, "bold": true, "fontColor": "&H0000FFFF" },
    "Small": { "fontSize": 36, "italic": true }
  },
  "lines": [
    { "text": "Title Text", "y": 400, "time": 0.5, "style": "Title" },
    { "text": "subtitle", "y": 500, "time": 1.0, "style": "Small" }
  ]
}
```

## Overlay on Existing Video

The ASS file can overlay on any video, not just solid backgrounds:

```bash
ffmpeg -y -i data/workspace/background.mp4 \
  -vf "ass=data/workspace/reveal.ass" \
  -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p \
  data/workspace/output.mp4
```

## How It Works

Uses ASS subtitle `\clip` with `\t` transitions. Each line gets an animated clip region that starts at zero height and expands top-to-bottom over the reveal duration, creating a vertical wipe effect.
