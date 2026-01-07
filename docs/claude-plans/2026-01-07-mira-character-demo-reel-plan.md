# Plan: Technical Demo Reel - Mira Character Addition

## Overview

Create a demo reel showcasing the two-character dialogue system by comparing the original solo crossroads scene with the new Mira + Sagittarius version.

---

## Structure

| Segment | Duration | Content |
|---------|----------|---------|
| 1. Main Title Card | 2s | Project name, tech info, date, GitHub link |
| 2. "Before" Title Card | 1s | "Original Crossroads Scene" |
| 3. Original Scene | ~5s | Solo Sagittarius at crossroads |
| 4. "After" Title Card | 1s | Brief description of changes |
| 5. New Scene | ~27s | Mira + Sagittarius dialogue |

**Total: ~36 seconds**

---

## Title Card Content

### Main Title (2s)
```
VIDEO GENERATOR
Multi-Character Dialogue System

Technical Demo • 2026-01-06
github.com/TeeKay-FourTwentyOne/video-generator
```

### Before Title (1s)
```
ORIGINAL
Single Character • No Dialogue
```

### After Title (1s)
```
WITH MIRA
Two Characters • Native Veo Dialogue
Auto-split into 4 takes with frame chaining
```

---

## Source Files

- **Original crossroads:** `data/video/veo_1767741890754_*.mp4` (from job_1767741890754_0kycsg)
- **New crossroads takes:**
  - Take 0: `veo_1767749118477_jees7y.mp4`
  - Take 1: `veo_1767749199870_w72r7e.mp4`
  - Take 2: `veo_1767749277151_pxbqpr.mp4`
  - Take 3: `veo_1767749366721_kz7mkx.mp4`

---

## Technical Implementation

### 1. Create Title Cards via FFmpeg

Portrait format (720x1280) to match 9:16 video:

```bash
# Main title (2s)
ffmpeg -f lavfi -i "color=c=black:s=720x1280:r=24:d=2" \
  -f lavfi -i "anullsrc=r=48000:cl=stereo" \
  -vf "drawtext=text='VIDEO GENERATOR':fontcolor=white:fontsize=48:x=(w-tw)/2:y=h/3,
       drawtext=text='Multi-Character Dialogue System':fontcolor=#cccccc:fontsize=28:x=(w-tw)/2:y=h/3+70,
       drawtext=text='Technical Demo • 2026-01-06':fontcolor=#888888:fontsize=24:x=(w-tw)/2:y=h*2/3,
       drawtext=text='github.com/TeeKay-FourTwentyOne/video-generator':fontcolor=#666666:fontsize=20:x=(w-tw)/2:y=h*2/3+40" \
  -c:v libx264 -c:a aac -t 2 -pix_fmt yuv420p -shortest title_main.mp4

# Before title (1s)
# After title (1s)
```

### 2. Get Original Crossroads Video

Look up job_1767741890754_0kycsg to find the original crossroads scene video path.

### 3. Assemble Demo Reel

Use /api/assemble with all segments in order, hard cuts between title cards and content.

---

## Output

`data/exports/sagittarius_demo_reel.mp4`

---

## Execution Steps

1. Look up original crossroads video path from job
2. Create 3 title card videos via FFmpeg
3. Assemble: main_title → before_title → original → after_title → new_takes
4. Output to exports folder
