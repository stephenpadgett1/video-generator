# CLAUDE.md

## Overview

AI video production system: concept → structured shots → video generation → assembly. Uses Claude (Opus 4), Veo 3.1, ElevenLabs TTS, Gemini.

```bash
npm start  # Server at http://localhost:3000
```

## Documentation

| Topic | File |
|-------|------|
| API endpoints & workflow | `.claude/rules/core-workflow.md` |
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
- Agents: `src/agents/`
