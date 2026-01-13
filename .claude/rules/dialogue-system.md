# Multi-Character Dialogue System

Conversation-driven narratives with multiple speakers.

## Enabling Dialogue

```
POST /api/generate-project-from-structure
  { concept, duration, arc, style, include_dialogue: true }
```

When `include_dialogue` is true:
- Claude generates `dialogue` arrays for character interaction shots
- Voices are auto-assigned based on character descriptions (male/female heuristics)
- Timing is auto-calculated at 150 WPM with 0.5s pauses between speakers

## Data Model

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

## Dialogue vs VO

| Feature | `vo` | `dialogue` |
|---------|------|------------|
| Speakers | Single narrator | Multiple characters |
| Timing | `start`/`middle`/`end` | Auto-calculated or explicit seconds |
| Voice | Project default | Per-character via `voiceCasting` |
| Use case | Narration, sparse commentary | Conversations, character scenes |

Both can coexist in the same project - use `vo` for narrator shots, `dialogue` for character interaction.

## Validation

```javascript
const { validateDialogue } = require('./validators');
// Checks: speakers in voiceCasting, timing within duration, overlap warnings
```

## Auto-Split Dialogue Shots

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
