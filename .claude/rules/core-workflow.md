# Core Workflow

## Main API Endpoints

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

POST /api/generate-music
  Options:
    A: { prompt, duration_seconds }           # Instrumental from text
    B: { lyrics, style?, duration_seconds }   # Song with vocals
    C: { composition_plan }                   # Full ElevenLabs control
    D: { mood, tension?, energy? }            # Auto-built instrumental
  → { path, filename, duration, has_vocals, request_type, prompt_used, lyrics_used }
  # ElevenLabs Eleven Music - instrumental or with vocals
  # style: { positive: [...], negative: [...] } for lyrics mode
```

## Character/Environment Locking

Generates reference image + extracts immutable features (30-50 words including clothing, physical traits). Locked descriptions are injected verbatim into Veo prompts.

**IMPORTANT: Correct usage when calling `/api/execute-project`:**

After calling `/api/lock-character`, you receive:
```json
{
  "character_id": "person_1",
  "base_image_path": "/generated-images/character_person_1_base.png",
  "locked_description": "A light-skinned woman in her 30s with short, wavy dark brown hair..."
}
```

When building the project for execute-project, the character object **must** include `locked_description` as a separate field:

```json
{
  "characters": [{
    "id": "person_1",
    "description": "Original description...",
    "locked_description": "A light-skinned woman in her 30s with short, wavy dark brown hair...",
    "base_image_path": "generated-images/character_person_1_base.png",
    "locked": true
  }]
}
```

The server checks for `char.locked_description` specifically (not `description`). If you only set `locked: true` without the `locked_description` field, the description will NOT be injected into Veo prompts.
