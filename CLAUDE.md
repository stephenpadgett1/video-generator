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
- `/api/elevenlabs/*` - TTS proxy (voices list, generation)
- `/api/veo/*` - Vertex AI video generation proxy (Veo 3.1)
- `/api/gemini/analyze-video` - Video analysis via Gemini 2.5 Flash
- `/api/assemble` - ffmpeg-based video assembly with VO mixing
- `/api/extract-frame` - Frame extraction for reference shots
- `/api/generate-image` - Generate images via Vertex AI Imagen 3 (saves to `generated-images/`)
- `/api/generate-frame-prompts` - Generate first/last frame image prompts from a Veo prompt
- `/api/breakdown-shot` - Break a shot into takes with Veo prompts and transition strategies
- `/api/jobs` - Job queue for background generation (POST to create, GET to list/fetch)

**Job Queue:**
Jobs are persisted to `jobs.json`. Supported types: `veo-generate`, `imagen-generate`. Veo jobs automatically poll for completion every 10 seconds.
```
POST /api/jobs { type: "veo-generate", input: { prompt, aspectRatio?, durationSeconds?, referenceImagePath?, lastFramePath? } }
GET /api/jobs/:id → { id, type, status, input, result, error, createdAt, updatedAt }
GET /api/jobs → array of recent jobs
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
