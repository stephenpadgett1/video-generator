---
name: produce-video
description: End-to-end video production from concept to final assembly. Use when creating videos, producing content, generating video from ideas, or running the full production pipeline.
allowed-tools: Read, Bash(curl:*), Bash(npx tsx:*)
context: fork
agent: general-purpose
---

# Produce Video

Full production pipeline: concept → structure → execute → assemble.

## Workflow

1. **Structure** - Generate project from concept
2. **Lock** - Optionally lock characters/environments
3. **Execute** - Generate all video clips via Veo
4. **Poll** - Wait for jobs to complete
5. **Assemble** - Combine clips into final video

## Step 1: Generate Structure

```bash
curl -X POST http://localhost:3000/api/generate-project-from-structure \
  -H "Content-Type: application/json" \
  -d '{
    "concept": "A person walks through a forest",
    "duration": 30,
    "arc": "linear-build",
    "style": "cinematic, natural lighting"
  }'
```

## Step 2: Execute Project

```bash
curl -X POST http://localhost:3000/api/execute-project \
  -H "Content-Type: application/json" \
  -d '{
    "project": <project_from_step_1>,
    "style": "cinematic",
    "aspectRatio": "9:16"
  }'
```

## Step 3: Poll Jobs

```bash
curl http://localhost:3000/api/jobs/<job_id>
```

Repeat until `status: "completed"` for all jobs.

## Step 4: Assemble

```bash
curl -X POST http://localhost:3000/api/assemble \
  -H "Content-Type: application/json" \
  -d '{
    "shots": <shots_from_project>,
    "outputFilename": "my_video.mp4"
  }'
```

## Options

| Option | Default | Purpose |
|--------|---------|---------|
| `include_vo` | false | Add voiceover |
| `include_dialogue` | false | Multi-character dialogue |
| `production_style` | none | Preset (stage_play, documentary, etc.) |

See `.claude/rules/core-workflow.md` for full API reference.
See `workflow.md` for detailed step-by-step guide.
