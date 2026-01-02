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

Generated assets go to `data/` subdirectories: `audio/`, `video/`, `exports/`, `frames/`.

### MCP Server (`mcp/veo-clips-mcp/`)
TypeScript MCP server for querying a pre-analyzed video clip library. Reads from `manifest.json` containing Gemini-analyzed clip metadata. Used by AI assistants to search clips by mood, subjects, visual style, edit compatibility, etc.

Build: `npm run build` → outputs to `dist/server.js`

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
