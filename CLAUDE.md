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

POST /api/transcribe { videoPath }
  → { segments, words, full_text, duration }
  # Whisper transcription - requires openaiKey in data/config.json

POST /api/analyze-dialogue-clip { videoPath, expectedDialogue }
  → { trim: { start, end, usable_duration }, validation: { match_score, verdict, missing_words } }
  # Trim recommendations + dialogue accuracy check
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

### Auto-Split Dialogue Shots

When dialogue is too long for a single Veo generation (max 8s), execute-project automatically splits into multiple takes with frame chaining.

**Timing calculation:**
- Speech rate: 150 WPM → `(wordCount / 150) * 60` seconds
- Pauses: +0.5s between speaker changes
- Action buffer: ~1s for visual establishment
- Max usable dialogue per take: ~7s

**Split behavior:**
- Detects when `dialogueDuration + buffer > shot.duration_target`
- Splits at speaker changes (preferred) or sentence boundaries
- Generates sequential takes with frame chaining for continuity
- Last frame of take N becomes reference image for take N+1

**Project data:**
```javascript
// Single-take shot (normal)
{ shot_id: "shot_1", job_id: "job_abc" }

// Multi-take shot (auto-split)
{ shot_id: "shot_2", take_job_ids: ["job_def", "job_ghi"], job_id: "job_def" }
```

**Assembly:** Multi-take shots are joined with hard cuts (no transitions between takes of the same shot).

See `dialogue-splitter.js` for the splitting algorithms.

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
- Edits: `data/edits/` (per-clip edit variations)
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
- `clip-validator.ts` - Automated clip validation using ffprobe
- `cut-point-analyzer.ts` - Find optimal trim points in generated clips
- `clip-editor.ts` - Auto-create trimmed variations from analysis

```bash
npx tsx project-reviewer.ts                    # Review most recent project
npx tsx system-refiner.ts                      # Run optimization cycle
npx tsx system-refiner.ts --hints "improve feasibility"
npx tsx clip-validator.ts project.json         # Validate generated clips
npx tsx cut-point-analyzer.ts project.json     # Find trim points
npx tsx clip-editor.ts project.json            # Create edit variations
```

### Clip Validator

Runs automated checks on generated video clips and writes structured annotations to project JSON:

```bash
npx tsx clip-validator.ts data/projects/my_project.json
npx tsx clip-validator.ts --project-id my_project
npx tsx clip-validator.ts project.json --visual   # Generate annotated video
```

**Checks performed:**
| Check | Category | Severity |
|-------|----------|----------|
| Video file exists | completeness | error |
| Duration matches target ±0.5s | timing | info/warning |
| Has audio track | audio | warning |
| Audio not silent (dialogue shots) | audio | warning |
| Resolution/aspect ratio | visual | info |

**Output:** Annotations are saved to the project JSON for other agents to consume. Exit code 1 if any errors block assembly.

**Visual mode (`--visual`):** Assembles all clips into a single video with annotations overlaid:
- Top-left: Shot ID, take number, agent name
- Bottom: Validation results color-coded (green=OK, yellow=WARN, red=ERR)
- Output: `data/exports/{project_id}_validated.mp4`

### Cut Point Analyzer

Analyzes generated video clips using audio timeline (ffmpeg + Whisper) to recommend optimal trim points. Detects dead time at start/end, internal pauses, and dialogue issues.

```bash
npx tsx cut-point-analyzer.ts project.json              # Analyze all clips
npx tsx cut-point-analyzer.ts --project-id my_project   # By project ID
npx tsx cut-point-analyzer.ts project.json --shot shot_3  # Specific shot
npx tsx cut-point-analyzer.ts project.json --dry-run    # Don't save annotations
```

**Issues detected:**
| Issue Type | Description |
|------------|-------------|
| `late_action` | Speech/action starts late, dead time at start |
| `dead_time` | Speech/action ends early, static frames at end |
| `other` | Internal pauses, missing dialogue words |

**How it works:** Calls `/api/audio-timeline` which combines ffmpeg silencedetect with Whisper transcription. FFmpeg provides accurate pause detection (Whisper compresses silence gaps). Returns trim recommendations based on speech segment boundaries.


### Unified Clip Analysis

Comprehensive analysis combining visual scene detection, audio analysis, and prompt context to make intelligent editing decisions.

**Endpoint:** `POST /api/analyze-clip-unified`

```bash
curl -X POST http://localhost:3000/api/analyze-clip-unified \
  -H "Content-Type: application/json" \
  -d '{"videoPath": "my_clip.mp4", "context": {"dialogue": [...]}}'
```

**Analysis signals:**
| Signal | Source | Purpose |
|--------|--------|---------|
| Scene changes | ffmpeg `select='gt(scene,0.4)'` | Visual discontinuities |
| Speech segments | Whisper + silence detection | Audio activity |
| Silences | ffmpeg silencedetect | Natural cut points |
| Context match | Prompt/dialogue comparison | Validate generated content |

**Correlations detected:**
- `scene_change_at_silence` - Natural cut point (high confidence)
- `scene_matches_speech_boundary` - Audio/visual alignment

**Anomalies detected:**
| Type | Trigger | Severity |
|------|---------|----------|
| `scene_change_mid_word` | Scene change during speech | warning |
| `entrance_with_speech` | Scene + speech in first 0.5s | warning |
| `dead_time_detected` | No activity at clip end | info |
| `visual_glitch` | 3+ scene changes in 0.5s | warning |
| `dialogue_mismatch` | <50% word match | warning |

**Response includes:**
- `scenes.changes[]` - Timestamps of visual scene changes
- `audio.speech_segments[]` - Where speech occurs
- `reconciled.correlations[]` - Audio/visual alignment patterns
- `reconciled.anomalies[]` - Problems detected
- `reconciled.edit_suggestions[]` - Recommended actions
- `summary.recommended_action` - 'use_as_is', 'trim', 'review', or 'regenerate'
- `summary.trim_recommendation` - Suggested trim points with reasoning

**Auto-analyze with edit:** `POST /api/edit/auto-analyze`
```json
{
  "job_id": "job_123",
  "apply_suggestions": true,
  "context": { "dialogue": [...] }
}
```
Runs unified analysis and optionally creates trim variation automatically.

### Clip Editor

Reads cut-point-analyzer annotations and automatically creates trimmed variations. Works with the edit system to produce rendered video files.

```bash
npx tsx clip-editor.ts project.json              # Create trim variations
npx tsx clip-editor.ts --project-id my_project   # By project ID
npx tsx clip-editor.ts project.json --shot shot_3  # Specific shot
npx tsx clip-editor.ts project.json --auto-approve  # Also select variations
npx tsx clip-editor.ts project.json --dry-run    # Preview without changes
```

**Workflow:**
1. Reads cut-point-analyzer annotations from project JSON
2. For clips with trim recommendations, creates edit folder via `/api/edit/start`
3. Creates trimmed variation via `/api/edit/trim`
4. Optionally auto-approves the variation for assembly

## Clip Edit System

Per-clip editing structure for tracking variations. Edit folders are stored in `data/edits/{job_id}/`.

### Structure

```
data/edits/{job_id}/
  manifest.json           # Edit state, history, context
  source.mp4              # Copy of original video
  v001_trim.mp4           # Variation: trimmed
  v002_trim_speed.mp4     # Variation: trimmed + speed adjusted
```

### API Endpoints

```
POST /api/edit/start
  { job_id, project_id?, shot_id?, take_index?, expected_dialogue? }
  → Creates edit folder, copies source, initializes manifest

POST /api/edit/trim
  { job_id, trim_start, trim_end?, notes? }
  → Renders trimmed variation via ffmpeg

POST /api/edit/speed
  { job_id, base_variation?, speed, notes? }
  → Creates speed-adjusted variation (can stack on previous)

POST /api/edit/select
  { job_id, variation_id }
  → Marks variation as selected for assembly

POST /api/edit/analysis
  { job_id, analysis }
  → Store analysis results (from cut-point-analyzer)

GET /api/edit/:job_id
  → Returns manifest

GET /api/edit
  → Lists all edit folders with status
```

### Assembly Integration

Assembly automatically checks for edited variations. When loading shots from a project:
- If `data/edits/{job_id}/manifest.json` exists with `status: "approved"` and a `selected` variation
- Uses the selected variation file instead of the original
- No changes needed to assembly calls - it's automatic

### Manifest Schema

```json
{
  "job_id": "job_123_abc",
  "source": { "path": "../video/veo_xyz.mp4", "duration": 8.0 },
  "context": {
    "project_id": "my_project",
    "shot_id": "shot_3",
    "take_index": 0,
    "expected_dialogue": "Hello world"
  },
  "analysis": { "trim_start": 0.15, "trim_end": 7.56, ... },
  "variations": [
    { "id": "v001", "filename": "v001_trim.mp4", "edits": {...}, "duration": 7.41 }
  ],
  "selected": "v001",
  "status": "approved"
}
```

**Status values:** `pending`, `in_progress`, `review`, `approved`, `archived`

## Agent Annotations

Agents communicate through structured annotations stored in project JSON:

```typescript
interface Annotation {
  id: string;                    // "ann_" + timestamp + random
  agent: string;                 // Agent that created it
  timestamp: string;             // ISO date
  target: {
    shot_id: string;
    take_index?: number;         // For multi-take shots
    frame?: number;              // Seconds into clip (future)
  };
  type: "issue" | "passed";
  category: "timing" | "audio" | "visual" | "completeness" | "continuity";
  message: string;
  severity: "info" | "warning" | "error";
  resolved: boolean;
  resolved_by?: string;
  resolution_note?: string;
}
```

**Escalation:** Agents decide based on severity - errors block, warnings allow with flag, info logged only.



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
