# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Video Pipeline Local is an AI-assisted video production system for short-form vertical (9:16) video creation. It integrates Claude, Google Veo 3.1, ElevenLabs TTS, and Gemini for an end-to-end workflow: brief → shot list → video generation → voiceover → AI review → final assembly.

## Commands

```bash
# Start the web app server (opens at http://localhost:3000)
npm start
# or
node server.js

# Batch analyze video clips with Gemini (requires gcloud auth)
GOOGLE_PROJECT_ID=your-project INPUT_DIR=/path/to/clips OUTPUT_FILE=manifest.json node analyze-clips.js

# MCP server (veo-clips-mcp)
cd mcp/veo-clips-mcp
npm install && npm run build
npm start

# Real-time narrative system (Python)
cd realtime-narrative
export ANTHROPIC_API_KEY=your_key
python orchestrator.py /path/to/manifest.json /path/to/clips --dummy  # test mode
python orchestrator.py /path/to/manifest.json /path/to/clips          # with mpv
```

## Architecture

### Main Web App (`server.js` + `public/app.jsx`)
Express server with React frontend (via Babel standalone). The server acts as a proxy for all external APIs to keep credentials server-side. All API routes are in `server.js`.

Key API routes:
- `/api/config` - Load/save API keys (stored in `data/config.json`)
- `/api/project` - Project CRUD (stored in `data/projects/`)
- `/api/claude` - Proxy to Anthropic API
- `/api/elevenlabs/voices` - List voices (default 5, use `?count=N` for more)
- `/api/elevenlabs/voices/cached` - Cached voice list with auto-refresh (7 days), `?refresh=true` to force
- `/api/elevenlabs/tts` - Generate speech audio from text
- `/api/veo/*` - Vertex AI video generation proxy (Veo 3.1)
- `/api/gemini/analyze-video` - Video analysis via Gemini 2.5 Flash
- `/api/assemble` - ffmpeg-based video assembly with VO mixing, transitions, overlays, and inline TTS
- `/api/generate-structure` - Generate shot structure from concept using Claude
- `/api/generate-project-from-structure` - Generate full project with shot descriptions and optional VO text
- `/api/execute-project` - Execute a project: generates Veo prompts and submits jobs for all shots
- `/api/extract-frame` - Frame extraction for reference shots (supports `saveToDisk` option to save to `generated-images/`)
- `/api/generate-image` - Generate images via Vertex AI Imagen 3 (saves to `generated-images/`)
- `/api/generate-frame-prompts` - Generate first/last frame image prompts from a Veo prompt
- `/api/breakdown-shot` - Break a shot into takes with Veo prompts and transition strategies
- `/api/generate-veo-prompt` - Generate Veo prompts from action descriptions with optional frame image analysis
- `/api/jobs` - Job queue for background generation (POST to create, GET to list/fetch)
- `/api/projects` - [WIP] List all saved projects
- `/api/projects/:id` - [WIP] Get project with resolved video paths and job status

**Job Queue:**
Jobs are persisted to `jobs.json`. Supported types: `veo-generate`, `imagen-generate`. Veo jobs automatically poll for completion every 10 seconds and download/save videos locally when complete.
```
POST /api/jobs { type: "veo-generate", input: { prompt, aspectRatio?, durationSeconds?, referenceImagePath?, lastFramePath? } }
GET /api/jobs/:id → { id, type, status, input, result, error, createdAt, updatedAt }
GET /api/jobs → array of recent jobs

Completed veo-generate jobs have result: { operationName, filename, path, duration }
Completed imagen-generate jobs have result: { imagePath, imageUrl }
```

**ElevenLabs TTS (`/api/elevenlabs/tts`):**
```json
POST /api/elevenlabs/tts {
  "voice_id": "abc123",                    // required
  "text": "Hello world",                   // required
  "model_id": "eleven_turbo_v2_5",         // optional, default shown
  "filename": "intro_vo"                   // optional, auto-generated if omitted (.mp3 added)
}
// Response: { "success": true, "filename": "intro_vo.mp3", "path": "/audio/tts/intro_vo.mp3" }
```

**Project Generation (`/api/generate-project-from-structure`):**
```json
POST /api/generate-project-from-structure {
  "concept": "a single drop of ink falling into water",  // required
  "duration": 12,                                         // required (seconds)
  "arc": "tension-release",                               // optional (linear-build|tension-release|wave|flat-punctuate|bookend)
  "style": "cinematic, moody lighting",                   // optional
  "include_vo": true                                      // optional - generates VO text + timing for select shots
}
// Response includes:
// - characters: array of { id, description } for people/entities in the concept
// - shots: array with shot_id, role, energy, duration_target, position, description, characters (array of character IDs)
// When include_vo: true, shots also have: vo: { text, timing } or vo: null
```

**Character Extraction:**
Characters are automatically extracted from concepts. Each character has:
- `id`: snake_case identifier (e.g., "woman_1", "elderly_man", "robot_dog")
- `description`: visual appearance suitable for image generation (age, clothing, hair, distinguishing features)

Only people and anthropomorphized entities with agency are extracted as characters (not objects or locations).
Each shot includes a `characters` array listing which character IDs appear in that shot.

**Video Assembly (`/api/assemble`):**
```json
POST /api/assemble {
  "shots": [
    { "videoPath": "/video/clip.mp4", "trimStart?": 0, "trimEnd?": 5, "energy?": 0.5 }
  ],
  "outputFilename?": "output.mp4",
  "textOverlays?": [
    { "text": "ESTABLISH", "startTime": 0, "duration": 2, "position": "bottom" }
  ],
  "audioLayers?": [
    { "type": "vo", "path": "/audio/tts/existing.mp3", "volume": 1, "startTime": 0 },
    { "type": "vo", "text": "Generate this on the fly", "voice_id": "abc123", "volume": 1, "startTime": 3 },
    { "type": "music", "path": "/audio/bg.mp3", "volume": 0.3, "startTime": 0 }
  ],
  "videoVolume?": 1.0
}
```
- **Energy-based transitions** (when `energy` values provided on shots):
  - Drop ≥ 0.4: insert 0.5s black
  - Rise ≥ 0.4: hard cut with 0.1s trimmed from outgoing
  - Change < 0.2: 0.25s crossfade dissolve
- **textOverlays**: Burn text onto video (position: "top", "center", "bottom")
- **audioLayers**: Mix audio tracks. Use `path` for existing files OR `text` + `voice_id` for inline TTS generation
- **videoVolume**: Control video's native audio level (0=mute, 1=full)
- **project_id** (WIP): Load shots from saved project instead of passing shots array
- **voice_id** (WIP): When used with project_id, auto-generates VO from project's shot.vo fields

---

## [WIP] Project Persistence (NOT YET TESTED)

> **Warning**: These endpoints were just implemented and have not been tested. This should be the next item addressed before using in production.

The following features enable project state persistence across sessions:

**Auto-save behavior:**
- `/api/generate-project-from-structure` now auto-saves projects to `data/projects/`
- `/api/execute-project` now stores `job_id` in each shot and saves the updated project

**`GET /api/projects`** - List all saved projects:
```json
// Response
[
  { "project_id": "red_balloon_123", "concept": "...", "duration": 12, "shot_count": 3 }
]
```

**`GET /api/projects/:id`** - Get project with resolved video paths:
```json
// Response
{
  "project_id": "red_balloon_123",
  "concept": "a red balloon escaping into the sky",
  "status": "complete",  // complete | processing | error | pending
  "shots": [
    {
      "shot_id": "shot_1",
      "description": "...",
      "energy": 0.3,
      "job_id": "job_xxx",
      "job_status": "complete",
      "video_path": "/video/veo_xxx.mp4",
      "video_duration": 4
    }
  ]
}
```

**`POST /api/assemble` with project_id:**
```json
{
  "project_id": "red_balloon_123",
  "voice_id": "abc123",           // optional - enables auto-VO from project shot.vo fields
  "outputFilename": "final.mp4"
}
```
- Loads shots from project, resolves video paths from completed jobs
- If `voice_id` provided, auto-generates audioLayers from shots with `vo.text`
- Can still pass explicit `audioLayers` to add music or additional VO

**Simplified workflow:**
```
POST /api/generate-project-from-structure → project auto-saved
POST /api/execute-project → jobs submitted, project updated with job_ids
GET /api/projects/:id → poll until status="complete"
POST /api/assemble { project_id, voice_id } → final video
```

---

**Project Execution (`/api/execute-project`):**
Generates Veo prompts for all shots and submits them to the job queue, returning immediately with job IDs.
```json
// Option 1: Full project
POST /api/execute-project {
  "project": { "project_id": "...", "shots": [{ "shot_id": "shot_1", "description": "...", "duration_target": 4 }] },
  "style": "cinematic, bold colors",
  "aspectRatio": "9:16"
}

// Option 2: Shorthand (generates project first)
POST /api/execute-project {
  "concept": "a red balloon escaping into the sky",
  "duration": 12,
  "arc": "linear-build",
  "style": "cinematic, bold colors"
}

// Response
{
  "project_id": "...",
  "jobs": [
    { "shot_id": "shot_1", "job_id": "job_xxx", "duration_target": 4, "veo_prompt": "..." }
  ]
}
```

Generated assets go to `data/` subdirectories: `audio/`, `video/`, `exports/`, `frames/`. Generated images go to `generated-images/`.

### MCP Server (`mcp/veo-clips-mcp/`)
TypeScript MCP server for querying and sequencing a pre-analyzed video clip library. Reads from `manifest.json` containing Gemini-analyzed clip metadata.

Build: `npm run build` → outputs to `dist/server.js`

**Tools:**
- `search_clips` - Search by query, mood, subjects, visual style, duration, motion intensity, aspect ratio, clean start/end
- `get_clip_details` - Full metadata for a specific clip
- `get_clip_json` - Raw JSON for programmatic use
- `list_subjects` - All subjects in library with counts
- `list_moods` - All mood descriptors
- `get_library_stats` - Overall statistics
- `find_edit_compatible_clips` - Find clips that cut well together
- `list_sequence_types` - Available sequence type definitions
- `build_sequence` - Build a sequence with AI-powered clip selection and gap filling
- `call_video_generator_api` - Make HTTP requests to the video generator API at localhost:3000

**build_sequence** accepts:
```json
{
  "type": "mood_journey",
  "moods": ["ominous", "tense", "peaceful"],
  "clipsPerMood": 1,
  "subjects": ["robot"],
  "duration": { "target": 30, "tolerance": 5 },
  "aspectRatio": "720:1280",
  "mustStartClean": true,
  "mustEndClean": true
}
```
Returns filled slots with AI-selected clips, generates Veo prompts for gaps (using Gemini Pro), and warns if duration target is missed.

Requires: `gcloud auth application-default login` and `GOOGLE_PROJECT_ID` env var (or configured gcloud project)

### Real-time Narrative System (`realtime-narrative/`)
Python system for live, feedback-driven video playback from a clip library.

Components:
- `orchestrator.py` - Main loop: buffer monitoring, clip selection, feedback processing
- `selector.py` - LLM-based clip selection with coherence control
- `manifest_loader.py` - Clip manifest querying
- `playback.py` - mpv control via JSON IPC

Requires: Python 3.10+, anthropic package, mpv (for real playback)

### Batch Analyzer (`analyze-clips.js`)
Standalone script that processes video directories with Gemini 2.5 Pro, generating structured JSON metadata (mood, subjects, usable segments, discontinuities, etc.). Outputs incrementally to manifest file and supports resume on failure.

## Key Dependencies

- **ffmpeg/ffprobe** - Required in PATH for video assembly, frame extraction, duration detection
- **mpv** - Required for realtime-narrative playback (not needed for web app)
- **gcloud CLI** - Required for analyze-clips.js (uses `gcloud auth print-access-token`)

## API Credentials

The web app stores credentials in `data/config.json`:
- `claudeKey` - Anthropic API key
- `elevenLabsKey` - ElevenLabs API key
- `veoServiceAccountPath` - Path to GCP service account JSON (needs `roles/aiplatform.user`)

## Manifest Format

Clip manifests (used by MCP server and realtime-narrative) follow this structure per clip:
```json
{
  "filename": "clip.mp4",
  "technical": { "durationSeconds": 8, "width": 720, "height": 1280, "aspectRatio": "720:1280" },
  "analysis": {
    "description": "...",
    "subjects": [], "mood": "...", "visualStyle": "...",
    "motionIntensity": "low|medium|high",
    "audio": { "hasSpeech": bool, "speechTranscript": "...", "hasMusic": bool },
    "startsClean": bool, "endsClean": bool,
    "usableSegments": [{ "startSeconds": 0, "endSeconds": 3.5, "quality": "good" }],
    "discontinuities": [{ "atSeconds": 4.2, "type": "artifact", "description": "..." }]
  }
}
```

## Video Generation Workflow (for LLMs)

Complete end-to-end video generation follows these steps:

### Step 1: Generate Project Structure
```
POST /api/generate-project-from-structure
{ "concept": "...", "duration": 12, "arc": "tension-release", "style": "...", "include_vo": true }
```
Returns project with `characters` array and `shots` array. Each character has: `id`, `description`. Each shot has: `shot_id`, `role`, `energy`, `duration_target`, `description`, `characters` (array of character IDs), and optionally `vo: { text, timing }`.

### Step 2: Execute Project (Generate Videos)
```
POST /api/execute-project
{ "project": <project from step 1>, "style": "...", "aspectRatio": "9:16" }
```
Returns `jobs` array with `job_id` for each shot. Videos generate in background.

### Step 3: Poll for Job Completion
```
GET /api/jobs/:job_id
```
Poll until all jobs have `status: "complete"`. Completed jobs have `result.path` (e.g., `/video/veo_xxx.mp4`).

### Step 4: Get Voice ID (if using VO)
```
GET /api/elevenlabs/voices/cached
```
Returns `{ voices: [{ voice_id, name, ... }] }`. Pick a voice_id for TTS.

### Step 5: Assemble Final Video
```
POST /api/assemble
{
  "shots": [
    { "videoPath": "/video/veo_xxx.mp4", "energy": 0.3 },
    { "videoPath": "/video/veo_yyy.mp4", "energy": 0.8 }
  ],
  "audioLayers": [
    { "type": "vo", "text": "VO text from project", "voice_id": "xxx", "volume": 1, "startTime": 0 }
  ],
  "outputFilename": "final_video.mp4"
}
```
Returns `{ path: "/exports/final_video.mp4" }`.

### Shortcut: Minimal 2-Step Flow
For quick generation without manual job polling:
1. `POST /api/execute-project { "concept": "...", "duration": 12, "style": "..." }` - generates project + submits jobs
2. Poll jobs, then `POST /api/assemble` with completed video paths

### Tips
- Use `energy` values from project shots in assembly for automatic transitions
- `include_vo: true` generates sparse, selective VO - not every shot gets narration
- audioLayers with `text` + `voice_id` generate TTS inline during assembly (no separate TTS call needed)
- Check `/api/jobs` (GET) to see all recent jobs and their statuses
