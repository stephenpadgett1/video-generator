# Plan: Gardening Film Strip - "Seed to Sunflower"

## Overview

Create a 16-20 second scrolling vintage film strip video showing a sunflower's journey from seed to harvest. Uses FFmpeg to create the scrolling effect (more reliable than Veo).

## Approach: FFmpeg Animated Scroll

1. Generate 8 static content images with Nano Banana Pro
2. Stack images vertically into a tall strip
3. Add sprocket hole overlay on edges
4. Use FFmpeg crop filter to animate downward scroll
5. Export as video

---

## 8 Content Images (Nano Banana Pro)

Generate at **9:16 aspect ratio** (720x1280 or similar). No sprocket frames needed - FFmpeg adds those.

### Frame 1: Seed Packet
```
Weathered vintage sunflower seed packet, hand-drawn botanical illustration of a sunflower on aged paper, rustic typography, warm sepia tones, soft vignette, nostalgic garden shop aesthetic. 9:16 portrait.
```

### Frame 2: Preparing Earth
```
Close-up of weathered hands breaking up dark rich garden soil, wooden-handled trowel nearby, morning golden light, dirt under fingernails, warm earth tones, vintage photography style. 9:16 portrait.
```

### Frame 3: Planting the Seed
```
Fingers gently pressing a single striped sunflower seed into a small hole in dark soil, intimate close-up, soft focus background, warm sepia tones, hopeful moment. 9:16 portrait.
```

### Frame 4: First Sprout
```
Tiny sunflower seedling with two round cotyledon leaves emerging from dark soil, delicate green stem, dewdrops catching morning light, soft bokeh background, new life emerging. 9:16 portrait.
```

### Frame 5: Growing Tall
```
Young sunflower plant with heart-shaped leaves on a sturdy green stalk, wooden garden stake for support, dappled sunlight, garden setting visible in background, healthy growth. 9:16 portrait.
```

### Frame 6: The Bud
```
Tight green sunflower bud at top of tall stalk, intricate overlapping petals about to unfurl, dramatic upward angle, blue sky background, anticipation of bloom. 9:16 portrait.
```

### Frame 7: Full Bloom
```
Glorious sunflower in full bloom, golden yellow petals radiating outward, dark spiral center, backlit by warm sun creating glow, bee visiting, peak summer moment. 9:16 portrait.
```

### Frame 8: Harvest
```
Weathered gardener's hands cradling a large dried sunflower seed head, seeds visible in beautiful spiral pattern, warm golden afternoon light, satisfying harvest, circle complete. 9:16 portrait.
```

---

## FFmpeg Workflow

### Step 1: Stack Images Vertically

```bash
ffmpeg -i frame1.png -i frame2.png -i frame3.png -i frame4.png \
       -i frame5.png -i frame6.png -i frame7.png -i frame8.png \
       -filter_complex "[0][1][2][3][4][5][6][7]vstack=inputs=8" \
       stacked_strip.png
```

This creates a tall image (720 x 10240 pixels if each frame is 720x1280).

### Step 2: Create Scrolling Video

```bash
# 16 seconds, scrolling through 8 frames
# Scroll speed: (10240 - 1280) / 16 = 560 pixels/second

ffmpeg -loop 1 -i stacked_strip.png \
  -vf "crop=720:1280:0:'t*560',format=yuv420p" \
  -t 16 -r 24 -c:v libx264 -pix_fmt yuv420p \
  scrolling_content.mp4
```

### Step 3: Add Sprocket Overlay

Use existing sprocket edge pattern or create new one:

```bash
# Overlay sprocket holes on edges (screen blend mode)
ffmpeg -i scrolling_content.mp4 -i sprocket_edges.png \
  -filter_complex "[1:v]loop=loop=-1:size=1:start=0[overlay];[0:v][overlay]blend=all_mode=screen" \
  -c:v libx264 -pix_fmt yuv420p \
  sunflower_filmstrip.mp4
```

### Step 4: Add Audio (Optional)

```bash
# Add ambient garden sounds or soft music
ffmpeg -i sunflower_filmstrip.mp4 -i garden_ambient.mp3 \
  -c:v copy -c:a aac -shortest \
  data/exports/sunflower_filmstrip_final.mp4
```

---

## Files

| Type | Count | Source |
|------|-------|--------|
| Content images | 8 | Nano Banana Pro |
| Sprocket overlay | 1 | Existing or generate |
| Stacked strip | 1 | FFmpeg vstack |
| Final video | 1 | FFmpeg scroll + overlay |

## Output

- Duration: ~16 seconds
- Resolution: 720x1280 (9:16)
- Location: `data/exports/sunflower_filmstrip_final.mp4`

## Verification

1. All 8 frames visible during scroll
2. Sprocket holes stay fixed on screen edges
3. Scroll is smooth and consistent
4. Sepia/vintage tone consistent across all frames
