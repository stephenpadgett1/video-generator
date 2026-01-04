# CLAUDE.md

## Project Overview

Video Pipeline Local is an AI-assisted video production system for short-form vertical (9:16) video creation. Integrates Claude, Veo 3.1, ElevenLabs TTS, and Gemini for: concept → shot list → video generation → voiceover → assembly.

## Commands

```bash
npm start                    # Start server at http://localhost:3000
node analyze-clips.js        # Batch analyze clips with Gemini (needs GOOGLE_PROJECT_ID, INPUT_DIR, OUTPUT_FILE)
```

## Architecture

Express server (`server.js`) with React frontend (`public/app.jsx`). Server proxies all external APIs. Credentials stored in `data/config.json`.

## Core Video Generation Endpoints

### Job Queue (`/api/jobs`)
Background job processing for video/image generation. Jobs persist to `jobs.json`.
```
POST /api/jobs { type: "veo-generate", input: { prompt, aspectRatio?, durationSeconds?, referenceImagePath? } }
GET /api/jobs/:id → { id, status, result: { path, duration }, error }
GET /api/jobs → array of all jobs
```

### Project Generation (`/api/generate-project-from-structure`)
```json
POST { "concept": "...", "duration": 12, "arc": "tension-release", "style": "...", "include_vo": true }
```
Returns `{ characters: [{ id, description }], shots: [{ shot_id, role, energy, duration_target, description, characters, vo? }] }`

### Character Locking (`/api/lock-character`)
Generates reference image and extracts immutable visual features for character consistency.
```json
POST { "character": { "id": "woman_1", "description": "..." }, "style": "..." }
→ { "character_id": "...", "base_image_path": "...", "locked_description": "East Asian woman, late 20s, shoulder-length black hair, slim build." }
```

### Project Execution (`/api/execute-project`)
Generates Veo prompts and submits jobs for all shots.
```json
POST { "project": {...}, "style": "...", "aspectRatio": "9:16" }
// Or shorthand:
POST { "concept": "...", "duration": 12, "style": "..." }
→ { "project_id": "...", "jobs": [{ "shot_id": "...", "job_id": "...", "veo_prompt": "..." }] }
```

### Video Assembly (`/api/assemble`)
```json
POST {
  "shots": [{ "videoPath": "/video/clip.mp4", "energy": 0.5 }],
  "audioLayers": [{ "type": "vo", "text": "...", "voice_id": "...", "volume": 1, "startTime": 0 }],
  "outputFilename": "output.mp4"
}
```
Energy-based transitions: drop ≥0.4 → black insert, rise ≥0.4 → hard cut, change <0.2 → crossfade.
audioLayers support `path` for existing files OR `text` + `voice_id` for inline TTS.

### Other Endpoints
- `/api/elevenlabs/tts` - TTS generation: `{ voice_id, text }` → `{ path }`
- `/api/elevenlabs/voices/cached` - List voices with caching
- `/api/generate-image` - Imagen 3: `{ prompt }` → `{ imageUrl }`
- `/api/gemini/analyze-video` - Video analysis: `{ videoPath }` → `{ description }`
- `/api/extract-frame` - Frame extraction from video

## Video Generation Workflow

### Standard Flow
```
1. POST /api/generate-project-from-structure { concept, duration, style, include_vo: true }
   → { characters, shots }

2. POST /api/lock-character { character: characters[0] }  // Optional: lock character appearance
   → { locked_description }

3. POST /api/execute-project { project, style, aspectRatio: "9:16" }
   → { jobs: [{ job_id }] }

4. GET /api/jobs/:job_id  // Poll until status: "complete"
   → { result: { path } }

5. POST /api/assemble { shots: [...], audioLayers: [...] }
   → { path: "/exports/final.mp4" }
```

### Quick 2-Step Flow
```
1. POST /api/execute-project { concept, duration, style }  // Auto-generates project
2. Poll jobs → POST /api/assemble with video paths
```

## Other Systems

- **MCP Server** (`mcp/veo-clips-mcp/`): Query/sequence pre-analyzed clip library. Build with `npm run build`.
- **Real-time Narrative** (`realtime-narrative/`): Python system for live clip playback with LLM selection.

## Dependencies

- **ffmpeg/ffprobe** - Video assembly, frame extraction
- **gcloud CLI** - For batch analysis script
- **mpv** - Only for realtime-narrative playback

## Credentials (`data/config.json`)

- `claudeKey` - Anthropic API key
- `elevenLabsKey` - ElevenLabs API key
- `veoServiceAccountPath` - GCP service account JSON path (needs `roles/aiplatform.user`)

## File Locations

- Generated videos: `data/video/`
- Generated audio: `data/audio/`
- Generated images: `generated-images/`
- Exports: `data/exports/`
- Projects: `data/projects/`
