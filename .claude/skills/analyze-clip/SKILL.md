---
name: analyze-clip
description: Analyze video clips for quality issues, timing problems, and dialogue accuracy. Use when checking generated videos, validating clips, finding black frames, freeze frames, or audio sync issues.
allowed-tools: Read, Bash(curl:*), Bash(ffprobe:*)
context: fork
agent: general-purpose
---

# Analyze Clip

Comprehensive video clip analysis using unified analysis endpoint.

## Quick Start

Analyze a clip:
```bash
curl -X POST http://localhost:3000/api/analyze-clip-unified \
  -H "Content-Type: application/json" \
  -d '{"videoPath": "data/video/clip.mp4"}'
```

## What It Detects

| Signal | Source | Purpose |
|--------|--------|---------|
| Scene changes | ffmpeg scene detection | Visual discontinuities |
| Black frames | ffmpeg blackdetect | Fades, dead regions |
| Freeze frames | ffmpeg freezedetect | Static frames, AI artifacts |
| Speech segments | Whisper | Audio activity |
| Dialogue match | Comparison | Validate generated speech |

## With Dialogue Context

```bash
curl -X POST http://localhost:3000/api/analyze-clip-unified \
  -H "Content-Type: application/json" \
  -d '{
    "videoPath": "data/video/clip.mp4",
    "context": {
      "dialogue": [
        {"speaker": "marcus", "text": "Hello there"}
      ]
    }
  }'
```

## Interpreting Results

- `recommended_action`: 'use_as_is', 'trim', 'review', or 'regenerate'
- `trim_recommendation`: Suggested start/end times
- `anomalies`: Issues found (with severity)

See `.claude/rules/agents.md` for full response schema.
