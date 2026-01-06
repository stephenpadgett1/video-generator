# Plan: Create Demonstration Video with Title Cards

## Structure
1. **Main title card** (2s) - Date, credits, technical description
2. **"Original" label** (1s)
3. **Original clip** - unified_test_clip.mp4 (~8s)
4. **"Rearranged" label** (1s)
5. **Demo clip** - rearranged_dialogue.mp4 (~5.5s)

**Total: ~17.5 seconds**

## Title Card Content

### Main (2s)
```
2026-01-06

FFmpeg Stream Copy vs Re-encode Trim Demo
Demonstrates keyframe-aligned cuts vs frame-accurate cuts

Claude Opus 4.5 + FFmpeg + Whisper
```

### Original Label (1s)
```
ORIGINAL
Dialogue order: 1 → 2 → 3
```

### Rearranged Label (1s)
```
REARRANGED (precise trim)
Dialogue order: 1 → 3 → 2
```

## Implementation

1. Get resolution from source clips (720x1280 portrait)
2. Create title cards with ffmpeg drawtext + silent audio
3. Concatenate all segments
4. Output to data/exports/trim_demo.mp4

## ffmpeg Pattern for Title Cards
```bash
ffmpeg -f lavfi -i color=c=black:s=720x1280:r=24:d=2 \
  -f lavfi -i anullsrc=r=48000:cl=stereo \
  -vf "drawtext=text='...':fontcolor=white:fontsize=40:x=(w-tw)/2:y=(h-th)/2" \
  -c:v libx264 -c:a aac -t 2 -pix_fmt yuv420p title.mp4
```
