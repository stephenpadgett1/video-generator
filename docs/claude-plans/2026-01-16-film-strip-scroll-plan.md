# Plan: Film Strip Scroll Video from Workspace JPEGs (4K)

## Overview

Create fast-scrolling vintage film strip videos using the 9 JPEG images in `data/workspace/`. Two versions at different speeds, both with improved sprocket overlay.

## Completed
- ✅ 5-second version created (`workspace_filmstrip_4k.mp4`) - colors correct
- ✅ Basic sprocket overlay working

## Current Task: Improve Sprocket Overlay + Add 3.5s Version

### Sprocket Design:
1. **Wide black borders** - 160px on each side
2. **Solid white rectangles** for sprocket holes (filled, not hollow)
3. **Rectangular shape** - taller than wide (e.g., 50w x 80h pixels)
4. 4 sprockets per side, evenly spaced vertically

### Output Versions:
1. **5-second version** - `workspace_filmstrip_4k.mp4` (re-render with new overlay)
2. **3.5-second version** - `workspace_filmstrip_4k_fast.mp4` (new)

## Source Material

**9 JPEG images** (3072x5504 each) - randomized order from previous run:
1. Zoom_the_image_4k_202601161237.jpeg
2. Figure_in_motion_4k_202601161234.jpeg
3. Grainy_black_and_4k_202601161230.jpeg
4. Replace_the_man_4k_202601161242.jpeg
5. Extreme_dutch_angle_4k_202601161244.jpeg
6. Black_and_white_4k_202601161231.jpeg
7. Figure_in_motion_4k_202601161232.jpeg
8. The_gunfighter_should_4k_202601161233.jpeg
9. Woman_in_bright_4k_202601161235.jpeg

---

## TODO

### 1. Draw sprocket borders directly on video
- **Black borders**: 160px on each side (left: 0-159, right: 2000-2159)
- **Solid white rectangles**: 50w x 80h pixels, filled white
- **4 sprockets per side**, evenly spaced (Y centers at 480, 1440, 2400, 3360)
- Sprocket X positions: centered in borders (left: ~55, right: ~2055)

### 2. Re-render both video versions
Using existing `stacked_strip_4k.png` (already created):

**5-second version:**
- Speed: 30720 / 5 = 6144 pixels/second
- Output: `workspace_filmstrip_4k.mp4`

**3.5-second version:**
- Speed: 30720 / 3.5 = **8777 pixels/second**
- Output: `workspace_filmstrip_4k_fast.mp4`

### 3. Composite sprocket overlay on both versions

---

## FFmpeg Commands

### Single-pass: Scroll + draw sprockets directly
```bash
# Filter chain: crop (scroll) → black borders → white sprocket rectangles
ffmpeg -loop 1 -i stacked_strip_4k.png \
  -vf "crop=2160:3840:0:'t*SPEED',format=yuv420p,
       drawbox=x=0:y=0:w=160:h=3840:c=black:t=fill,
       drawbox=x=2000:y=0:w=160:h=3840:c=black:t=fill,
       drawbox=x=55:y=440:w=50:h=80:c=white:t=fill,
       drawbox=x=55:y=1400:w=50:h=80:c=white:t=fill,
       drawbox=x=55:y=2360:w=50:h=80:c=white:t=fill,
       drawbox=x=55:y=3320:w=50:h=80:c=white:t=fill,
       drawbox=x=2055:y=440:w=50:h=80:c=white:t=fill,
       drawbox=x=2055:y=1400:w=50:h=80:c=white:t=fill,
       drawbox=x=2055:y=2360:w=50:h=80:c=white:t=fill,
       drawbox=x=2055:y=3320:w=50:h=80:c=white:t=fill" \
  -t DURATION -r 24 -c:v libx264 -pix_fmt yuv420p \
  OUTPUT.mp4

# 5-second: SPEED=6144, DURATION=5
# 3.5-second: SPEED=8777, DURATION=3.5
```

---

## Verification

1. Both versions show all 9 frames during scroll
2. Colors correct (no pink cast)
3. **Solid white rectangles** (filled, not hollow) on both sides
4. Sprockets are **rectangular** (50w x 80h - taller than wide)
5. Border width is 160px on each side
6. Resolution is 2160x3840 for both

## Output

- `data/exports/workspace_filmstrip_4k.mp4` - 5 seconds
- `data/exports/workspace_filmstrip_4k_fast.mp4` - 3.5 seconds
- Both at 2160x3840 (4K vertical)
