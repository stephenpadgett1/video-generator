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

## Character Dialogue

Multi-character dialogue system for conversation-driven narratives.

### Enabling Dialogue

```
POST /api/generate-project-from-structure
  { concept, duration, arc, style, include_dialogue: true }
```

When `include_dialogue` is true:
- Claude generates `dialogue` arrays for character interaction shots
- Voices are auto-assigned based on character descriptions (male/female heuristics)
- Timing is auto-calculated at 150 WPM with 0.5s pauses between speakers

### Data Model

```typescript
// Project-level voice mapping
voiceCasting: {
  "marcus": "voice_id_abc",     // character_id → ElevenLabs voice_id
  "elena": "voice_id_def",
  "narrator": "voice_id_xyz"    // Optional narrator voice
}

// Shot-level dialogue (alternative to vo)
shots: [{
  dialogue: [
    { speaker: "marcus", text: "I didn't think you'd come.", mood: "tense" },
    { speaker: "elena", text: "Neither did I." }
  ]
}]
```

### Dialogue vs VO

| Feature | `vo` | `dialogue` |
|---------|------|------------|
| Speakers | Single narrator | Multiple characters |
| Timing | `start`/`middle`/`end` | Auto-calculated or explicit seconds |
| Voice | Project default | Per-character via `voiceCasting` |
| Use case | Narration, sparse commentary | Conversations, character scenes |

Both can coexist in the same project - use `vo` for narrator shots, `dialogue` for character interaction.

### Validation

```javascript
const { validateDialogue } = require('./validators');
// Checks: speakers in voiceCasting, timing within duration, overlap warnings
```

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

TypeScript agents for specialized workflows. Uses Claude Agent SDK for context-aware reasoning.

```bash
cd src/agents && npm install
```

### video-producer-v2.ts (Recommended)

End-to-end video production with full project context. Reads CLAUDE.md to understand Veo limitations.

```bash
npx tsx video-producer-v2.ts                              # Process next idea
npx tsx video-producer-v2.ts idea.txt                     # Specific file
npx tsx video-producer-v2.ts --instructions "Be minimal"  # With guidance
```

### video-producer.ts (Legacy)

Original agent without Agent SDK context. Still works but doesn't read CLAUDE.md.

### Other Agents

- `project-reviewer.ts` - Critique producer decisions (structure, feasibility)
- `concept-reviewer.ts` - Review raw concepts before production
- `system-refiner.ts` - Autonomous optimization of interpretation prompts

```bash
npx tsx project-reviewer.ts                    # Review most recent project
npx tsx system-refiner.ts                      # Run optimization cycle
npx tsx system-refiner.ts --hints "improve feasibility"
```



## QA Framework

Multi-layer testing system for validating video generation projects.

### Programmatic Validators

```javascript
const { validateProject } = require('./validators');
const result = validateProject(project);
// Returns: { valid, structure, narrative, feasibility, audio, transitions, production, dialogue, summary }
```

Individual validators:
- `validateProjectStructure()` - Fields, types, references
- `validateNarrativeArc()` - Energy curve matches arc type
- `validateVeoFeasibility()` - Flag VFX risk keywords
- `validateAudioSettings()` - VO timing and coverage
- `validateTransitions()` - Tension-aware transition logic
- `validateProductionRules()` - Preset consistency
- `validateDialogue()` - Speaker references, timing, overlap detection

### API Endpoints

```
POST /api/validate-project
  { project }                      # Full validation
  { project, validators: ["structure", "feasibility"] }  # Selective

GET /api/validate-project/:id      # Validate by project ID
```

### QA Reviewer Agent

AI-powered review using Agent SDK:

```bash
npx tsx qa-reviewer.ts project.json              # Pre-generation review
npx tsx qa-reviewer.ts project.json --video dir  # Post-generation review
npx tsx qa-reviewer.ts --project-id abc123       # Review by ID
```

Returns structured scores (0-1): structural, narrative, feasibility, audio, visual, emotional

### Reference

See `docs/qa-checklist.md` for manual QA reference.

## Known Veo Limitations

- VFX-heavy prompts (neon, hologram, glowing) often fail
- Character consistency improves with locking but poses still vary
- Complex physics unreliable
- Static starting positions unreliable - Veo tends to add entrance movement (door opening, stepping into frame) even when character should already be in place. Consider using reference frames or accepting brief lead-in action.
