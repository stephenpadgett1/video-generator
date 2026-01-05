# CLAUDE.md

## Overview

AI video production system: concept → structured shots → video generation → assembly. Uses Claude (Opus 4), Veo 3.1, ElevenLabs TTS, Gemini.

```bash
npm start  # Server at http://localhost:3000
```

## Core Workflow

```
POST /api/generate-project-from-structure
  { concept, duration, arc, style, production_style?, include_vo? }
  → { characters, environments, shots }

POST /api/lock-character { character, style }      # Optional: lock appearance
POST /api/lock-environment { environment, style }  # Optional: lock location

POST /api/execute-project { project, style, aspectRatio }
  → { jobs: [{ job_id, veo_prompt }] }

GET /api/jobs/:id  # Poll until complete

POST /api/assemble { shots, audioLayers, outputFilename }
  → { path }
```

## Narrative Model

Each shot has three independent axes:

| Axis | Range | Controls |
|------|-------|----------|
| `energy` | 0-1 | Pace, intensity, camera movement speed |
| `tension` | 0-1 | Anticipation, suspense (can be high with low energy) |
| `mood` | string | Emotional color (see vocabulary below) |

**Mood vocabulary:** hopeful, melancholic, tense, peaceful, unsettling, triumphant, intimate, desolate, mysterious, urgent, contemplative, chaotic, bittersweet, whimsical, ominous, serene

**Arc types:** `linear-build`, `tension-release`, `wave`, `flat-punctuate`, `bookend`

## Production Rules

Enforce consistent constraints across all shots:

```json
{
  "production_style": "stage_play"
}
```

Or custom:
```json
{
  "production_rules": {
    "camera": { "perspective": "audience_front_row", "movement": "locked", "framing": "proscenium" },
    "visual": { "lighting": "theatrical_spotlight", "palette": "high_contrast" },
    "continuity": { "location": "single", "time_flow": "real_time" }
  }
}
```

**Presets:**
- `stage_play` - Fixed front-row perspective, locked camera, theatrical lighting, single location
- `documentary` - Observational perspective, minimal movement, natural lighting, film grain
- `music_video` - Dynamic camera, saturated colors, fragmented time flow
- `noir` - Character POV, monochrome palette, noir lighting, elliptical time

## Mood-Aware Audio

Voice modulation and music profiles computed from shot mood/tension/energy:

```javascript
// In assembly audioLayers or direct TTS calls:
{ "type": "vo", "text": "...", "voice_id": "...", "mood": "ominous", "tension": 0.7, "energy": 0.3 }
```

**Voice settings** (ElevenLabs): stability, similarity_boost derived from mood; speed_factor (0.5-2.0) via ffmpeg atempo post-processing.

**Music profiles**: tempo, key, texture, instruments, search tags - computed but not yet connected to music selection/generation.

See `audio-rules.js` for full mappings.

## Transitions (Assembly)

Tension-aware (priority):
- High → low tension: long crossfade (release)
- Low → high tension: black insert (breath before impact)
- Sustained high: hard cuts

Energy fallback: drop ≥0.4 → black, rise ≥0.4 → hard cut, small change → crossfade

## Character/Environment Locking

Generates reference image + extracts immutable features (30-50 words including clothing, physical traits). Locked descriptions are injected verbatim into Veo prompts.

## File Locations

- Videos: `data/video/`
- Audio: `data/audio/`
- Images: `generated-images/`
- Exports: `data/exports/`
- Agents: `src/agents/`

## Claude Agents

TypeScript agents using the Anthropic SDK for specialized workflows.

```bash
cd src/agents && npm install
```

### video-producer.ts (Autonomous)

End-to-end video production from raw ideas. Uses checkpoint/resume pattern for long-running Veo jobs.

```bash
# Add ideas as .txt or .md files
echo "A lonely astronaut drifts through space" > data/slush-pile/astronaut.txt

# Submit job (interprets idea, generates project, submits to Veo, checkpoints)
npx tsx video-producer.ts

# Check status of in-progress jobs
npx tsx video-producer.ts --status

# Run again to check if jobs complete → assembles video
npx tsx video-producer.ts
```

**Workflow:**
1. First run: interprets idea, submits Veo jobs, saves checkpoint to `in-progress/`
2. Subsequent runs: checks job status, assembles when complete
3. Completed videos go to `data/exports/`, idea files move to `done/`

The agent autonomously decides: duration, arc type, style, production_style, include_vo, character/environment locking, and voice selection.

### Other Agents

- `concept-reviewer.ts` - Review concepts for clarity and AI feasibility
- `example.ts` - Basic SDK usage demonstration

Create new agents by adding `.ts` files to `src/agents/`.

## Known Veo Limitations

- VFX-heavy prompts (neon, hologram, glowing) often fail
- Character consistency improves with locking but poses still vary
- Complex physics unreliable
