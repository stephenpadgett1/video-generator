---
name: splice
description: Find and execute seamless joins ("splices") between two video clips. Use when one clip is a continuation of another and the cut should feel invisible — typically because the pair was generated to be one shot but had to be split due to generator length limits. Supports geometric alignment to eliminate scale/pan jumps at the splice.
allowed-tools: Read, Bash, mcp__video-generator__extract_frame
---

# Splice

Join two clips with a cut designed to be imperceptible. Splicing handles cases where two Veo (or similar) generations are meant to read as a single continuous shot.

A splice has three parameters:

| Param | Meaning |
|---|---|
| `cut_a` | Last visible timestamp in clip A (seconds) |
| `cut_b` | First visible timestamp in clip B (seconds) |
| `xfade` | Crossfade duration (0 = hard cut) |

The helper script `tools/splice.cjs` finds good `(cut_a, cut_b, xfade)` triples by sampling the tail of A and the head of B, scoring each pair by frame similarity (PSNR) plus a plateau bonus (low motion nearby → robust to small timing shifts).

## When to use

- Two Veo clips meant to read as one shot (frame chaining, scene continuation)
- Ken Burns pan that must continue across two files
- Any time the user says "these should feel like one clip"

**Not for:** deliberate match cuts, hard narrative cuts, or transitions where the clips are meant to look different. Use the assembly pipeline's tension-aware transitions for those.

## Prerequisite: normalize bars first

Veo clips often have a few pixels of black bars (pillarbox/letterbox) on the edges. If A and B have different bar widths — especially if one has bars and the other doesn't — the splice will expose the bar difference as a visible "zoom" jump that's NOT a true scale mismatch. Run the **`normalize-clip`** skill on affected clips before splicing:

```bash
node tools/normalize-clip.cjs data/workspace/shot5.mp4 data/workspace/shot5_norm.mp4
```

After normalization, alignment detection is meaningful and splices are clean.

## Quick start

```bash
# 1. Analyze — with --align to also detect geometric (scale/pan) offset
node tools/splice.cjs analyze data/workspace/shot4.mp4 data/workspace/shot5.mp4 --align --json-out=/tmp/splice.json

# 2. Render using the recommendation (applies warp + relaxation automatically)
node tools/splice.cjs render data/workspace/shot4.mp4 data/workspace/shot5.mp4 data/workspace/spliced.mp4 --from-analyze=/tmp/splice.json

# Or render with explicit params — standalone align
node tools/splice.cjs render A.mp4 B.mp4 out.mp4 --cut-a=7.95 --cut-b=0 --xfade=0.2 --align --relax=1.0

# Or manual geometry override
node tools/splice.cjs render A.mp4 B.mp4 out.mp4 --cut-a=7.95 --scale-b=1.05 --dx-b=0 --dy-b=0 --relax=1.0 --xfade=0.2
```

## Analyze output (abbreviated)

```json
{
  "clipA": { "duration": 8.0, "fps": 24 },
  "clipB": { "duration": 8.0, "fps": 24 },
  "motion": { "a_tail_avg": 2.1, "b_head_avg": 1.8 },
  "top_candidates": [
    { "cut_a": 7.9, "cut_b": 0.1, "psnr": 38.2, "motion_a": 1.1, "motion_b": 0.9, "score": 0.95 }
  ],
  "recommendation": {
    "mode": "hard" | "xfade",
    "cut_a": 7.9, "cut_b": 0.1, "xfade": 0.18,
    "psnr": 38.2,
    "rationale": "..."
  },
  "warnings": ["fps mismatch: ..."]
}
```

## Decision logic (auto)

| Best pair PSNR | Mode | xfade default |
|---|---|---|
| ≥ 35 | hard cut | 0 |
| 25 – 35 | crossfade | 0.15s (motion) / 0.25s (static) |
| < 25 | crossfade (flagged) | 0.40s — consider regenerating |

## Reviewing results

After rendering, inspect the splice:

```bash
# Extract frames around the splice to eyeball it
ffmpeg -ss $((CUT_A-0.2)) -i out.mp4 -frames:v 1 /tmp/pre.jpg
ffmpeg -ss $((CUT_A+0.2)) -i out.mp4 -frames:v 1 /tmp/post.jpg
open /tmp/pre.jpg /tmp/post.jpg
```

Or use the `analyze-clip` skill on the output to check for anomalies at the splice timestamp.

## Tuning knobs

| Flag | Default | Use when |
|---|---|---|
| `--zone` | 1.5 | Scan farther from boundaries (longer if the best cut might be deep inside the clip) |
| `--step` | 0.1 | Finer sampling (slower but higher-precision candidate ranking) |
| `--top` | 5 | Return more candidates to choose from manually |
| `--mode=hard\|xfade\|auto` | auto | Force a mode |
| `--align` | off | Auto-detect scale + translation offset and warp B's head to match A |
| `--scale-b=S` | — | Manual scale for B's first frame (1.05 = start 5% zoomed in) |
| `--dx-b=N` / `--dy-b=N` | 0 | Manual translation offset in pixels |
| `--relax=S` | 1.0 | Seconds to relax from warped geometry back to native (ease-out) |
| `--crf` | 18 | Output quality |

## Two strategies for fixing geometric mismatch

Crossfades mask color/noise differences but **cannot fix scale or pan jumps** — a ~5% zoom mismatch between A's end and B's start remains visible through any fade. There are two strategies, pick based on whether you need to preserve A's full length.

### Strategy 1: `--align` (warp B, keep A's full length)

1. Detect the scale + translation that maps B's first frame onto A's last frame.
2. Warp B's first seconds to start at A's geometry, relax to native over `--relax` seconds (ease-out).
3. Crossfade during the first ~0.2s of the relaxation window.

Viewer sees A → B as a continuous zoom, never a cut jump. Output duration = full A + full B − xfade.

### Strategy 2: `--trim-a` (find a natural match point in A, discard the rest)

1. Sample A across its full duration.
2. For each sample, run alignment detection against B's first frame.
3. Score by geometric naturalness (scale ≈ 1, translation ≈ 0) + PSNR + motion plateau.
4. Recommend the A timestamp where B natively fits — no warp needed, just a short xfade.

Viewer sees a short A clip → clean splice → B. Output duration = cut_a + (durB − cut_b). Best when A is a slow pan / ken burns and you don't need all of A.

```bash
# Trim-a analyze — returns both the align and trim-a recommendations; picks trim-a when a near-identity match exists
node tools/splice.cjs analyze A.mp4 B.mp4 --trim-a --json-out=/tmp/splice.json
node tools/splice.cjs render A.mp4 B.mp4 out.mp4 --from-analyze=/tmp/splice.json
```

**When trim-a helps:** A is a Ken Burns / slow pan / exploration, and somewhere along its timeline the geometry matches B's start. Discarding A's tail keeps the splice clean without warping artifacts.

**When trim-a doesn't help:** A's geometry never matches B (different content entirely), or the motion at the natural match point is too high (A is actively panning when we cut — a motion discontinuity you can't hide). The tool flags high `motion_a` in the candidates — if it's high at the chosen cut, prefer `--align` instead.

**When to use:**
- Flat-PSNR cases (`psnr_spread.flat: true` in analyze output) — almost always indicates geometric mismatch.
- Ken Burns → Veo generation boundary.
- Any time the splice has a visible "jump" even though the content is semantically identical.

**Limitations:**
- Currently supports scale ≥ 1 only (B zoomed out relative to A). Scale < 1 (B zoomed in) would need padding; not implemented.
- No rotation or perspective correction (would need feature-matching, e.g. OpenCV ORB).
- Warp is applied to B only. Applying a "forward extension" to A is a future option.

## Known limitations

- **Requires matching fps and resolution.** Analyze warns on mismatch; render does not auto-normalize. Pre-normalize with ffmpeg if needed.
- **PSNR is compression-sensitive.** A scene that was re-encoded may score lower than expected. Use analysis PSNR as a relative ranking, not an absolute quality signal.
- **One-at-a-time.** For chains of 3+ clips, splice them pairwise: A+B → AB, then AB+C → ABC.
- **No reference-image bridging yet.** If you have a reference image used to generate both clips (like `apr_reference.png` in the April project), this version treats the clips as opaque — future work can use the reference as a bridge frame.

## Convention reminder

```
A:  [-------clip A-------]
                  ↓ cut_a
B:           [-------clip B-------]
             ↑ cut_b
Output: [A up to cut_a][xfade][B from cut_b onward]
```

`cut_a` = where A stops being visible. `cut_b` = where B starts being visible. During `xfade`, the last `xfade` seconds of A blend with the first `xfade` seconds of B.
