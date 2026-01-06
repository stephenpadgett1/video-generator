# Plan: Clip Edit System - COMPLETED

## Status: Implemented and committed (9fa9294)

Now testing with Veo-generated clip containing intentional edit points.

## User Requirements
- Full editing: trims, speed, audio, regeneration
- Render actual files for each variation (verbose, condense later)
- Per clip (job_id) as primary unit, roll up to shot level eventually

## Structure

```
data/edits/
  {job_id}/
    manifest.json           # Edit state, history, project context
    source.mp4              # Symlink or copy of original
    v001_trim.mp4           # Variation: trimmed
    v002_trim_speed.mp4     # Variation: trimmed + speed adjusted
    v003_trim_audio.mp4     # Variation: trimmed + audio fixed
    ...
```

### manifest.json Schema

```json
{
  "job_id": "job_1767669325111_3r6aey",
  "source": {
    "path": "../video/veo_1767669367859_abc123.mp4",
    "duration": 8.0
  },
  "context": {
    "project_id": "two_friends_meet...",
    "shot_id": "shot_3",
    "take_index": 0,
    "expected_dialogue": "Three years. Since the wedding."
  },
  "analysis": {
    "trim_start": 0.15,
    "trim_end": 7.56,
    "usable_duration": 7.41,
    "issues": ["dead_time at end", "0.76s internal pause"],
    "analyzed_by": "cut-point-analyzer",
    "analyzed_at": "2026-01-06T..."
  },
  "variations": [
    {
      "id": "v001",
      "filename": "v001_trim.mp4",
      "edits": {
        "trim_start": 0.15,
        "trim_end": 7.56
      },
      "created_at": "2026-01-06T...",
      "created_by": "clip-editor-agent",
      "notes": "Basic trim per analysis"
    },
    {
      "id": "v002",
      "filename": "v002_trim_speed.mp4",
      "edits": {
        "trim_start": 0.15,
        "trim_end": 7.56,
        "speed": 1.1
      },
      "created_at": "...",
      "notes": "Slight speed up to fit shot duration"
    }
  ],
  "selected": "v001",
  "status": "in_progress"
}
```

### Status Values
- `pending` - Edit folder created, no variations yet
- `in_progress` - Variations being created/tested
- `review` - Ready for human review
- `approved` - Variation selected, ready for assembly
- `archived` - Finalized and cleaned up

## Implementation

### 1. Create edit folder structure
- `data/edits/` directory
- Helper to initialize edit folder from job_id

### 2. Routes for clip editing
```
POST /api/edit/start
  { job_id }
  → Creates edit folder, symlinks source, initializes manifest

POST /api/edit/trim
  { job_id, trim_start, trim_end, notes? }
  → Renders trimmed variation via ffmpeg

POST /api/edit/speed
  { job_id, base_variation?, speed, notes? }
  → Applies speed change (can stack on previous variation)

POST /api/edit/select
  { job_id, variation_id }
  → Marks variation as selected

GET /api/edit/:job_id
  → Returns manifest
```

### 3. clip-editor agent
TypeScript agent that:
- Takes job_id and project context
- Reads cut-point-analyzer annotations
- Automatically creates recommended trim variation
- Optionally creates speed variation if needed to hit duration target

### 4. Assembly integration
Update assembly to check `data/edits/{job_id}/manifest.json`:
- If exists and has selected variation → use that file
- Otherwise → use original source

## Files to Create/Modify

| File | Action |
|------|--------|
| `routes/edit.js` | New - CRUD for edit operations |
| `server.js` | Mount edit routes |
| `src/agents/clip-editor.ts` | New - Automated editing agent |
| `server.js` (assembly) | Check for edited variations |
| `CLAUDE.md` | Document edit system |

## Naming Convention

Variations: `v{NNN}_{edits}.mp4`
- `v001_trim.mp4` - trimmed only
- `v002_trim_speed.mp4` - trim + speed
- `v003_audio.mp4` - audio adjustment
- `v004_regen.mp4` - regenerated clip (new job_id referenced)

Three-digit version allows sorting and 999 variations per clip.
