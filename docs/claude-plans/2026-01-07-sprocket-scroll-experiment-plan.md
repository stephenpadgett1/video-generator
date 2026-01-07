# Plan: Fix Sprocket Scrolling for "January 7th, 2026"

## Problem Analysis

**Test run (worked):**
- `referenceImagePath`: `sprocket_source_frame.png` - frame WITH sprockets already visible
- `lastFramePath`: offset edge frames
- Prompt: content similar to reference (soldier, flower scene)
- Result: Sprockets maintained, scroll effect worked

**January 7th attempt (didn't work):**
- `referenceImagePath`: same `sprocket_source_frame.png` (soldier/flower with sprockets)
- `lastFramePath`: offset edge frames
- Prompt: DIFFERENT content (frost, coffee, walker, etc.)
- Result: Veo generated prompted content, ignored sprocket reference

**Root cause:** The reference image content (soldier) was semantically unrelated to prompts (frost, coffee). Veo prioritized the prompt over preserving the sprocket effect from the reference.

---

## Solution: FFmpeg Animated Sprocket Overlay

Since Veo's sprocket effect is unreliable with varied content, use FFmpeg to composite an animated scrolling sprocket overlay onto the generated clips.

**Why this works:**
- Deterministic - guaranteed consistent sprockets
- Variable speed - control scroll rate per shot via FFmpeg
- Content-agnostic - works on any footage
- Proven concept - we already have the scrolling edge frames

---

## Technical Approach

### Step 1: Create Animated Sprocket Strip

Use the tiled edge pattern to create a scrolling video overlay:

```bash
# Create 8s scrolling sprocket video (100px/sec = slow)
ffmpeg -loop 1 -i sprocket_edges_tiled.png \
  -vf "crop=720:1280:0:'1280+t*100',format=rgba" \
  -t 8 -r 24 sprocket_scroll_slow.mov

# 150px/sec = medium
# 200px/sec = fast
```

The `crop` y-position advances over time: `1280 + t*speed`

### Step 2: Composite Over Content

Blend the sprocket overlay onto each shot:

```bash
ffmpeg -i content_shot.mp4 -i sprocket_scroll.mov \
  -filter_complex "[1:v]format=rgba[overlay];[0:v][overlay]blend=all_mode=screen" \
  -c:v libx264 output.mp4
```

The `screen` blend mode adds the white sprocket edges without darkening the content.

### Step 3: Reassemble with Music

Same assembly process as before, but now with guaranteed scrolling sprockets.

---

## Execution Plan

### Phase 1: Create Scrolling Sprocket Overlays

Create 3 overlay videos at different scroll speeds (using existing tiled edge pattern):

| Speed | Rate | Duration | Use For |
|-------|------|----------|---------|
| Slow | 100px/s | 8s | Shots 1, 2 |
| Medium | 150px/s | 8s | Shots 3, 4, 6 |
| Fast | 200px/s | 8s | Shot 5 |

### Phase 2: Composite Sprockets onto Existing Shots

Apply appropriate overlay to each of the 6 existing generated shots:
- `jan7_shot_1_frost.mp4` + slow overlay
- `jan7_shot_2_coffee.mp4` + slow overlay
- `jan7_shot_3_walker.mp4` + medium overlay
- `jan7_shot_4_branches.mp4` + medium overlay
- `jan7_shot_5_golden.mp4` + fast overlay
- `jan7_shot_6_window.mp4` + medium overlay

### Phase 3: Reassemble

1. Concatenate composited shots + existing title card
2. Add existing music layer
3. Export as `january_7th_2026_v2.mp4`

---

## Key Files

**Existing (reuse):**
- `generated-images/sprocket_edges_tiled.png` - source for overlay
- `data/video/jan7_shot_*.mp4` - 6 content shots
- `data/audio/music/music_1767779356012.mp3` - piano score
- `data/video/jan7_title_base.mp4` - title card

**To Create:**
- `data/video/sprocket_overlay_slow.mp4`
- `data/video/sprocket_overlay_medium.mp4`
- `data/video/sprocket_overlay_fast.mp4`
- `data/video/jan7_shot_*_sprocket.mp4` - composited shots
- `data/exports/january_7th_2026_v2.mp4` - final output

---

## Success Criteria

- Sprocket holes scroll consistently on ALL shots
- Sprockets remain VERTICAL (not horizontal)
- Scroll speed varies: slow→medium→fast→medium
- Same content, music, and structure as v1
