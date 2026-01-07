# Plan: Punk Pacifism Music Video - Frenetic Edit Enhancement

## Overview
Enhance the completed 15-second punk music video with a frenetic middle section featuring hardcore-style rapid cuts and FFmpeg effects.

**Completed v2:** `data/exports/punk_pacifism_v2.mp4` (14.8s, 5 shots)

## Phase 1: Frenetic Section Design

**Target section:** Middle portion (~3s to ~9s) - covers robot surrender through soldiers embrace

**Source clips available (all 4s each):**
- `veo_1767763614600_40w8n5.mp4` - soldier drops weapon
- `veo_1767763273974_2teofo.mp4` - robot surrender
- `veo_1767763289752_g9v1e3.mp4` - soldiers walking toward each other
- `veo_1767763282565_hq7pbs.mp4` - soldiers embracing
- `veo_1767763541365_1fko81.mp4` - robots powering down
- `veo_1767763330475_55zjac.mp4` - mass of soldiers mixing
- `veo_1767763314406_a7urr9.mp4` - flower in rifle

**Cut strategy:**
- 0.2-0.5s micro-cuts from multiple clips
- Use ALL 7 clips for variety during frenetic section
- ~15-20 rapid cuts in 6 seconds

## Phase 2: FFmpeg Effects

| Effect | Command Pattern | Usage |
|--------|-----------------|-------|
| White flash | `color=white:s=720x1280:d=0.08` | Between intense cuts |
| Inverted flash | `-vf negate` on 0.1s clip segment | Jarring transitions |
| Speed ramp | `setpts=0.5*PTS` (2x speed) | Action moments |
| Stutter/reverse | `reverse` filter on 0.3s segment | Disorientation |
| High contrast | `eq=contrast=1.5:brightness=0.1` | Punch up visuals |
| Zoom punch | `scale=1.2*iw:-1,crop=iw/1.2:ih/1.2` | Impact frames |

## Phase 3: Assembly Structure

```
[Shot 1 - opener, 2.5s unchanged]
[FRENETIC SECTION START - ~6s]
  - micro-cut 0.3s from clip 2
  - WHITE FLASH 0.08s
  - micro-cut 0.4s from clip 3 (inverted)
  - micro-cut 0.2s from clip 5 (2x speed)
  - micro-cut 0.3s from clip 2
  - INVERTED FLASH 0.1s
  - micro-cut 0.4s from clip 4
  - micro-cut 0.2s from clip 6 (high contrast)
  - WHITE FLASH 0.08s
  - micro-cut 0.3s from clip 3 (reversed)
  - micro-cut 0.5s from clip 4
  - ... (continue pattern, ~15-20 cuts total)
[FRENETIC SECTION END]
[Shot 4 embrace tail - 1s to settle]
[Shot 6 - mass mixing, 3s]
[Shot 7 - flower, 3s unchanged]
```

## Phase 4: Execution Steps

1. Create micro-cut segments from source clips with various effects
2. Create flash frame clips (white + inverted samples)
3. Build concat list for frenetic section
4. Concatenate frenetic section
5. Reassemble: opener + frenetic + calm ending + music
6. Play for review

## Files

| File | Purpose |
|------|---------|
| `data/exports/punk_frenetic_section.mp4` | The rapid-cut middle section |
| `data/exports/punk_pacifism_v3.mp4` | Final video with frenetic edit |
| `data/video/veo_*.mp4` | Source clips (no new generations) |

---

# ARCHIVED: Original Plan (Completed)

**Endpoint:** `POST /api/generate-music`

**Lyrics concept:** Short, punchy pro-pacifism punk. ~6-8 lines for 15 seconds.

Draft lyrics:
```
Drop your weapons, raise your hands
No more fighting, make a stand
Hug your enemy, break the chain
War is over when we change
```

**Style:**
```json
{
  "positive": ["punk rock", "raw", "energetic", "rebellious", "driving drums"],
  "negative": ["slow", "mellow", "acoustic", "sad", "ambient"]
}
```

**Request:**
```json
{
  "lyrics": "Drop your weapons, raise your hands\nNo more fighting, make a stand\nHug your enemy, break the chain\nWar is over when we change",
  "style": {
    "positive": ["punk rock", "raw", "energetic", "rebellious", "driving drums"],
    "negative": ["slow", "mellow", "acoustic", "sad", "ambient"]
  },
  "duration_seconds": 15
}
```

Save the returned `path` and `duration` for assembly.

---

## Phase 2: Design Visual Montage

**Creative direction:** Vintage newsreel/documentary aesthetic with punk energy. Human and robot soldiers choosing peace over war.

**Arc:** `flat-punctuate` - sustained high energy with spikes on key beats

**Shot breakdown (7 shots, ~2s each):**

| Shot | Duration | Description | Energy/Tension |
|------|----------|-------------|----------------|
| 1 | 2s | Close-up: soldier's hands releasing rifle, weapon falling to ground. Grainy newsreel look. | 0.7 / 0.6 |
| 2 | 2s | Medium: Humanoid robot soldier raising both hands in surrender, war-torn urban backdrop. | 0.85 / 0.75 |
| 3 | 2s | Wide: Two opposing soldiers (different uniforms) walking toward each other across no-man's land. | 0.8 / 0.8 |
| 4 | 2s | Close-up: Two soldiers embracing, helmets discarded on ground. High contrast, emotional. | 0.9 / 0.7 |
| 5 | 2s | Medium: Line of robot soldiers powering down, red eyes fading to dark, weapons lowered. | 0.85 / 0.75 |
| 6 | 2s | Wide: Mass of soldiers from both sides mixing together, shaking hands, vintage film grain. | 0.9 / 0.8 |
| 7 | 3s | Final: Single soldier planting flower in rifle barrel stuck in ground, silhouette against sky. | 0.75 / 0.6 |

**Visual style notes:**
- High contrast, desaturated/sepia tones (newsreel aesthetic)
- Grainy film texture
- No VFX-heavy elements (Veo-friendly)
- All shots work as standalone moments of peace

**Transitions:** Hard cuts throughout (high energy = automatic hard cuts)

---

## Phase 3: Project Structure

**File:** `data/projects/punk_pacifism.json`

```json
{
  "project_id": "punk_pacifism",
  "title": "Drop Your Weapons",
  "concept": "Pro-pacifism punk music video - soldiers choosing peace over war",
  "aspect_ratio": "9:16",
  "duration": 15,
  "arc": "flat-punctuate",
  "style": "vintage newsreel, high contrast, grainy film, punk energy, quick cuts",
  "shots": [ /* 7 shots as designed above */ ]
}
```

No character locking needed - variety of soldiers reinforces universality of message.

---

## Phase 4: Execute & Assemble

1. **Generate project structure** via `/api/generate-project-from-structure` OR manually create JSON
2. **Execute project** via `/api/execute-project` with `aspectRatio: "9:16"`
3. **Poll jobs** until all complete
4. **Run clip-validator** to check generated clips
5. **Run cut-point-analyzer** if timing adjustments needed
6. **Assemble** via `/api/assemble`:
   ```json
   {
     "project_id": "punk_pacifism",
     "audioLayers": [{
       "type": "music",
       "path": "audio/music/[generated_filename].mp3",
       "volume": 0.9,
       "startTime": 0
     }],
     "outputFilename": "punk_pacifism_final.mp4"
   }
   ```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `data/projects/punk_pacifism.json` | Create project structure |
| `data/audio/music/*.mp3` | Generated by music endpoint |
| `data/video/*.mp4` | Generated by Veo |
| `data/exports/punk_pacifism_final.mp4` | Final assembled video |

---

## Execution Checklist

- [ ] Generate music with lyrics via `/api/generate-music`
- [ ] Save music path and actual duration
- [ ] Create project JSON with 7 shots
- [ ] Execute project via `/api/execute-project`
- [ ] Poll jobs until all clips complete
- [ ] Run clip-validator (optional but recommended)
- [ ] Assemble with music background layer
- [ ] Review final output
- [ ] Play video for user approval
