---
name: normalize-clip
description: Detect and remove letterbox/pillarbox bars from a video clip, rescaling content back to the original frame size. Use before splicing, assembly, or upscaling when clips from different generators have inconsistent bar widths.
allowed-tools: Read, Bash
---

# Normalize Clip

Some generators (Veo, notably) embed content inside a few pixels of black bars on one or more edges — a 720×1280 frame may actually contain 712×1280 of content with 4px bars on each side. When such clips are spliced with bar-free clips (hand-rendered, Ken Burns from a full-frame image, etc.) the transition exposes the bars as a visible "zoom-in" effect.

This skill finds the content rectangle via ffmpeg's `cropdetect`, crops to it, and rescales back to the original dimensions. The result is a clip with content filling the full frame.

## Quick start

```bash
# Detect only (no output written)
node tools/normalize-clip.cjs data/workspace/shot5.mp4 --detect-only

# Normalize
node tools/normalize-clip.cjs data/workspace/shot5.mp4 data/workspace/shot5_norm.mp4

# Batch the workspace
for f in data/workspace/shot*.mp4; do
  out=$(dirname "$f")/$(basename "$f" .mp4)_norm.mp4
  node tools/normalize-clip.cjs "$f" "$out"
done
```

## Detection output

```json
{
  "input":    { "w": 720, "h": 1280 },
  "detected": { "w": 712, "h": 1280, "x": 4, "y": 0, "samples": 190, "consensus_frequency": 1.0 },
  "bars":     { "left": 4, "right": 4, "top": 0, "bottom": 0 },
  "has_bars": true,
  "action":   "cropped_and_rescaled",
  "target":   { "w": 720, "h": 1280 }
}
```

`consensus_frequency` = fraction of sampled frames that agreed on the crop rect. Low values (< 0.8) suggest unstable bars (content near the edges is sometimes dark) — inspect the clip before trusting the detection.

## Tuning knobs

| Flag | Default | Use when |
|---|---|---|
| `--threshold=N` | 24 | cropdetect luma threshold. Higher = stricter (fewer false-positive bars). Lower = catches faint bars. |
| `--round=N` | 2 | Snap detected crop to multiples of N px. Veo bars are 3px wide; round=2 picks up 4px. Use round=1 for absolute precision. |
| `--min-bar-px=N` | 0 | Treat as bar-free if every edge bar is ≤ N px. Use to ignore sub-pixel noise. |
| `--target=WxH` | input dims | Resize target after crop. Default keeps frame size identical. |
| `--sample-seconds=N` | whole clip | Limit cropdetect to first N seconds (faster for long clips). |

## When to use

- **Before splicing** two clips from different sources (Veo vs ken-burns, Veo vs hand-rendered title card).
- **Before assembly** when the final video will combine generated and non-generated material.
- **Before upscaling** — upscalers can amplify bar artifacts.

## When NOT to use

- **Intentional letterboxing** (4:3 content in 16:9 frame, cinematic 2.35:1). Inspect with `--detect-only` first.
- **Already-bar-free clips**. Detection will return `has_bars: false` and the action is a stream-copy (fast, lossless), but it's wasted work.
- **Clips with unstable bars** (low `consensus_frequency`) — the detection may be unreliable.

## Known limitations

- Uses ffmpeg `cropdetect`, which is luma-based — bars that aren't fully black (near-black, noise) may be missed at high thresholds. Lower `--threshold` if bars are faint.
- Single rectangle output. Can't handle rotated / trapezoidal content (rare).
- Audio is stream-copied; video is re-encoded (the crop+scale necessitates it).
