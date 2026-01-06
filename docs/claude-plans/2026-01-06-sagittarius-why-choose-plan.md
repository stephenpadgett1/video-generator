# Plan: Sagittarius "Why Choose?" Short Video

## Overview
27-second vertical video (9:16) for YT/IG Shorts. Sagittarius archetype embracing all paths with defiant optimism. Pure visual storytelling, ends with "Why Choose?" text card.

## Creative Direction
- **Story**: Traveler appears across multiple distinct environments - implying they've experienced everything
- **Style**: Cinematic/epic, golden hour lighting, sweeping landscapes
- **Arc**: `linear-build` - energy increases as we see more worlds, resolves peacefully
- **Audio**: No VO - visual-only with optional ambient music later

## Shot Structure (5 shots + end card)

| # | Duration | Environment | Energy | Tension | Mood | Action |
|---|----------|-------------|--------|---------|------|--------|
| 1 | 5s | Mountain summit | 0.3 | 0.2 | contemplative | Wide shot, traveler gazes at endless peaks, golden hour |
| 2 | 5s | Ocean shore | 0.4 | 0.3 | hopeful | Walking barefoot along dramatic coastline at sunset |
| 3 | 5s | Urban rooftop | 0.5 | 0.4 | triumphant | Standing on rooftop at dusk, city lights below, camera orbits |
| 4 | 4s | Forest path | 0.6 | 0.3 | serene | Tracking shot through sunlit forest, dappled light |
| 5 | 5s | Crossroads | 0.5 | 0.2 | peaceful | Wide shot at junction of paths, calm knowing expression |
| End | 3s | Black + text | - | - | - | "Why Choose?" centered white text |

**Total: 27 seconds**

## Character (to lock)
```
An adventurous traveler, early 30s, with approachable confident demeanor.
Wearing practical travel clothing in earth tones - sage green utility jacket
over cream henley, dark cargo pants, tan hiking boots. Windswept hair,
weathered but content expression.
```

## Execution Steps

### 1. Lock character
```
POST /api/lock-character
{ character: { id: "sagittarius_traveler", description: "..." },
  style: "cinematic portrait, warm golden hour lighting" }
```

### 2. Lock environments (5x, can parallel)
Lock each: mountain_summit, ocean_shore, urban_rooftop, forest_path, crossroads_horizon

### 3. Build project JSON
Construct manually with locked descriptions injected into each shot

### 4. Execute project
```
POST /api/execute-project
{ project, style: "cinematic epic, golden hour", aspectRatio: "9:16" }
```

### 5. Poll jobs until complete
`GET /api/jobs/:id` for each shot

### 6. Create end card via FFmpeg
```bash
ffmpeg -f lavfi -i "color=c=black:s=720x1280:r=24:d=3" \
  -f lavfi -i "anullsrc=r=48000:cl=stereo" \
  -vf "drawtext=text='Why Choose?':fontcolor=white:fontsize=72:x=(w-tw)/2:y=(h-th)/2" \
  -c:v libx264 -c:a aac -t 3 -pix_fmt yuv420p -shortest title_card.mp4
```

### 7. Assemble
```
POST /api/assemble
{ shots: [...], outputFilename: "sagittarius_why_choose.mp4", videoVolume: 0.0 }
```

## Veo Considerations
- Character locking helps but poses may vary - accept as "different moments"
- Veo adds entrance movement - shot descriptions already include motion
- Use clip trimming if needed post-generation
- Mute Veo audio (often unwanted ambient) via `videoVolume: 0.0`

## Files
- `server.js` - All API endpoints
- `data/projects/` - Where project JSON will be saved
- `data/video/` - Generated clips
- `data/exports/` - Final assembled video
