---
name: caption-box
description: Render social-media style captions (white box, black text, sharp corners) over a video. Use for Instagram/TikTok/Reels style text overlays — hard pop-in/pop-out timing, multi-line with optional auto-wrap, per-caption position overrides. For animated reveal-style text instead, use the text-reveal skill.
allowed-tools: Bash, Read, Write, Glob
context: fork
---

# Caption Box

Social-media caption overlays: white rectangle, black centered text, sharp corners, hard pop-in / pop-out.

## Tool

`node tools/caption-box.cjs <config.json> [--output path]`

## Config

```json
{
  "input": "data/workspace/gardening-social-1/refs/clip.MOV",
  "output": "data/workspace/gardening-social-1/final/clip_captioned.mp4",
  "fontSize": 56,
  "boxPadding": 24,
  "captions": [
    { "text": "First caption", "start": 1.0, "end": 4.0 },
    { "text": "Second one, up top", "start": 5.0, "end": 8.0, "position": "top", "maxChars": 22 }
  ]
}
```

## Global options

| Field | Default | Purpose |
|-------|---------|---------|
| `input` | required | Input video path |
| `output` | required (or `--output`) | Output path |
| `font` | `Helvetica Neue` | Font name (resolved via fontconfig) |
| `fontFile` | none | Explicit TTF/OTF path (overrides `font`) |
| `fontSize` | 48 | Default point size |
| `boxPadding` | 20 | Padding inside the box, px (`boxborderw`) |
| `boxColor` | `white` | Box fill color |
| `fontColor` | `black` | Text color |
| `lineSpacing` | 8 | Vertical gap between wrapped lines, px |

## Per-caption options

| Field | Default | Purpose |
|-------|---------|---------|
| `text` | required | Caption text — `\n` for manual line breaks |
| `start` | required | Show time (seconds) |
| `end` | required | Hide time (seconds) |
| `position` | `bottom-third` | `top`, `center`, `bottom-third`, or `{ x, y }` |
| `maxChars` | none | Auto-wrap at N chars per line (word boundary) |
| `fontSize` | inherit | Per-caption override |
| `fontColor` | inherit | Per-caption override |
| `boxColor` | inherit | Per-caption override |
| `boxPadding` | inherit | Per-caption override |

## Position presets

| Preset | x | y |
|--------|---|---|
| `bottom-third` | centered | `h*0.72 - text_h/2` |
| `center` | centered | `(h-text_h)/2` |
| `top` | centered | `h*0.10` |
| `{ x, y }` | literal or expr | literal or expr |

Custom `{x, y}` accepts ffmpeg expressions (e.g. `"x": "(w-text_w)/2", "y": "h-text_h-80"`).

## Multi-line

Two ways:

1. **Manual:** include `\n` in `text`
2. **Auto-wrap:** set `maxChars` — greedy word-boundary wrap

Multi-line captions render with one shared box around the full block; lines are center-aligned inside.

## Output

- H.264, CRF 18, `yuv420p`, `-preset fast`
- Audio copied through from source
- Single pass — re-run to iterate on caption copy

## Notes

- Uses ffmpeg `drawtext` with `box=1`. Sharp corners only; rounded would require a PNG overlay step.
- Text is written to temp files and referenced via `textfile=` — no filter-level escaping needed.
- `text_align=C` requires a recent ffmpeg (6.x+). If captions render left-aligned on an older ffmpeg, upgrade or drop to single-line captions with manual `\n`.
