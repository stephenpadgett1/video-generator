# CLAUDE.md

## Overview

AI video production system: concept → structured shots → video generation → assembly. Uses Claude (Opus 4), Veo 3.1, ElevenLabs TTS, Gemini.

All functionality is exposed via MCP (Model Context Protocol) tools. The `video-generator` MCP server provides ~45 tools covering the complete pipeline.

```bash
# Build the MCP server
cd mcp/video-generator && npm install && npm run build

# The server is configured in .mcp.json and runs automatically
```

## Documentation

| Topic | File |
|-------|------|
| MCP tools & workflow | `.claude/rules/core-workflow.md` |
| Narrative model (energy/tension/mood) | `.claude/rules/narrative-model.md` |
| Veo techniques & limitations | `.claude/rules/veo-techniques.md` |
| FFmpeg encoding knowledge | `.claude/rules/ffmpeg-knowledge.md` |
| Multi-character dialogue | `.claude/rules/dialogue-system.md` |
| Clip editing & variations | `.claude/rules/editing-system.md` |
| Agent reference & QA | `.claude/rules/agents.md` |
| Advanced hybrid techniques | `TECHNIQUES.md` |
| **Skills** (auto-triggered) | `.claude/skills/` |

## File Locations

- Videos: `data/video/`
- Audio: `data/audio/`
- Images: `generated-images/`
- Exports: `data/exports/`
- Edits: `data/edits/`
- Projects: `data/projects/`
- Config: `data/config.json`

## MCP Server

The MCP server is located at `mcp/video-generator/` and provides tools for:
- Project generation and execution
- Video generation via Veo 3.1
- Image generation via Imagen 3.0
- Audio (TTS, music) via ElevenLabs
- Video analysis (transcription, scene detection, quality checks)
- Clip editing (trim, speed variations)
- Assembly with tension-aware transitions
- Project validation
