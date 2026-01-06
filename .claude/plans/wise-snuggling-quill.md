# Autonomous Video Producer Agent

## Overview
An agent that takes raw video ideas from a slush pile directory and autonomously produces finished videos.

## Input/Output
- **Input**: `data/slush-pile/` directory containing idea files (`.txt` or `.md`)
- **Output**: Assembled videos in `data/exports/`

## Agent Flow

```
1. INTAKE
   - Read idea file from slush pile
   - Parse raw text (can be anything from one sentence to detailed brief)

2. INTERPRET (Claude decision)
   - Analyze the idea and decide:
     - duration (15-60 seconds, based on complexity)
     - arc type (linear-build, tension-release, wave, flat-punctuate, bookend)
     - style (cinematic guidance)
     - production_style (stage_play, documentary, music_video, noir, or none)
     - include_vo (true if narrative/story, false if abstract/visual)
   - Output reasoning for decisions

3. GENERATE PROJECT
   - POST /api/generate-project-from-structure
   - Receive structured shots with characters, environments, descriptions

4. LOCKING DECISION (Claude decision)
   - Analyze project: does it have recurring characters across shots?
   - If yes: lock characters via POST /api/lock-character
   - If environments repeat: lock environments via POST /api/lock-environment

5. EXECUTE
   - POST /api/execute-project
   - Receive job IDs for each shot

6. WAIT
   - Poll GET /api/jobs/:id every 5 seconds
   - Track progress, handle errors
   - Timeout after 10 minutes per job

7. VOICE SELECTION (if VO enabled)
   - Fetch available voices from GET /api/elevenlabs/voices
   - Claude selects best voice based on concept tone/mood
   - Consider: gender, age, accent, emotional range

8. ASSEMBLE
   - POST /api/assemble with project_id
   - Include selected voice_id if project has VO
   - Output final video path

9. CLEANUP
   - Move processed idea file to data/slush-pile/done/
   - Log results
```

## File Structure

```
src/agents/
├── video-producer.ts      # Main agent
├── lib/
│   └── api-client.ts      # HTTP client for localhost:3000
└── types.ts               # Shared types
```

## Key Implementation Details

### video-producer.ts
- Uses Anthropic SDK for interpretation decisions
- Calls local API via fetch for video generation
- Handles the full async workflow with polling
- Logs progress to console

### Interpretation Prompt
The agent uses Claude to analyze the idea and output structured decisions:
```
Given this video idea, decide:
1. Duration (15-60s) - longer for complex narratives
2. Arc type - match to emotional journey
3. Style - visual/cinematic guidance
4. Production style - if it fits a preset, use it
5. Include VO - true for stories, false for abstract visuals
```

### Error Handling
- Veo job failures: log error, continue with other shots, note in output
- API failures: retry 3x with backoff
- Timeout: mark as failed, move to `data/slush-pile/failed/`

### CLI Usage
```bash
cd src/agents
npx tsx video-producer.ts                    # Process next idea in queue
npx tsx video-producer.ts my-idea.txt        # Process specific file
npx tsx video-producer.ts --all              # Process entire slush pile
```

## Files to Create/Modify
1. `src/agents/video-producer.ts` - Main agent (~200 lines)
2. `src/agents/lib/api-client.ts` - API wrapper (~100 lines)
3. `src/agents/types.ts` - Shared types (~50 lines)
4. `data/slush-pile/` - Create directory for ideas
5. `data/slush-pile/done/` - Processed ideas
6. `data/slush-pile/failed/` - Failed ideas
7. Update `CLAUDE.md` with agent documentation
