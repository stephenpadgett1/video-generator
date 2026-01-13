---
name: edit-clip
description: Create trimmed or speed-adjusted variations of video clips. Use when editing clips, trimming videos, adjusting speed, or creating clip variations.
allowed-tools: Read, Bash(curl:*)
context: fork
agent: general-purpose
---

# Edit Clip

Create variations (trim, speed) of generated video clips.

## Quick Start

### Initialize Edit

```bash
curl -X POST http://localhost:3000/api/edit/start \
  -H "Content-Type: application/json" \
  -d '{"job_id": "job_abc123"}'
```

### Trim Clip

```bash
curl -X POST http://localhost:3000/api/edit/trim \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_abc123",
    "trim_start": 0.5,
    "trim_end": 7.2
  }'
```

### Adjust Speed

```bash
curl -X POST http://localhost:3000/api/edit/speed \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_abc123",
    "speed": 1.5
  }'
```

### Select for Assembly

```bash
curl -X POST http://localhost:3000/api/edit/select \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_abc123",
    "variation_id": "v001"
  }'
```

## Auto-Analyze & Edit

Analyze clip and auto-create trim variation:

```bash
curl -X POST http://localhost:3000/api/edit/auto-analyze \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "job_abc123",
    "apply_suggestions": true
  }'
```

## Edit Folder Structure

```
data/edits/{job_id}/
├── manifest.json      # Edit state
├── source.mp4         # Original
├── v001_trim.mp4      # Trimmed
└── v002_speed.mp4     # Speed adjusted
```

See `.claude/rules/editing-system.md` for full API reference.
