# Clip Edit System

Per-clip editing structure for tracking variations. Edit folders are stored in `data/edits/{job_id}/`.

## Structure

```
data/edits/{job_id}/
  manifest.json           # Edit state, history, context
  source.mp4              # Copy of original video
  v001_trim.mp4           # Variation: trimmed
  v002_trim_speed.mp4     # Variation: trimmed + speed adjusted
```

## API Endpoints

```
POST /api/edit/start
  { job_id, project_id?, shot_id?, take_index?, expected_dialogue? }
  → Creates edit folder, copies source, initializes manifest

POST /api/edit/trim
  { job_id, trim_start, trim_end?, notes? }
  → Renders trimmed variation via ffmpeg

POST /api/edit/speed
  { job_id, base_variation?, speed, notes? }
  → Creates speed-adjusted variation (can stack on previous)

POST /api/edit/select
  { job_id, variation_id }
  → Marks variation as selected for assembly

POST /api/edit/analysis
  { job_id, analysis }
  → Store analysis results (from cut-point-analyzer)

GET /api/edit/:job_id
  → Returns manifest

GET /api/edit
  → Lists all edit folders with status
```

## Assembly Integration

Assembly automatically checks for edited variations. When loading shots from a project:
- If `data/edits/{job_id}/manifest.json` exists with `status: "approved"` and a `selected` variation
- Uses the selected variation file instead of the original
- No changes needed to assembly calls - it's automatic

## Manifest Schema

```json
{
  "job_id": "job_123_abc",
  "source": { "path": "../video/veo_xyz.mp4", "duration": 8.0 },
  "context": {
    "project_id": "my_project",
    "shot_id": "shot_3",
    "take_index": 0,
    "expected_dialogue": "Hello world"
  },
  "analysis": { "trim_start": 0.15, "trim_end": 7.56, ... },
  "variations": [
    { "id": "v001", "filename": "v001_trim.mp4", "edits": {...}, "duration": 7.41 }
  ],
  "selected": "v001",
  "status": "approved"
}
```

**Status values:** `pending`, `in_progress`, `review`, `approved`, `archived`

## Agent Annotations

Agents communicate through structured annotations stored in project JSON:

```typescript
interface Annotation {
  id: string;                    // "ann_" + timestamp + random
  agent: string;                 // Agent that created it
  timestamp: string;             // ISO date
  target: {
    shot_id: string;
    take_index?: number;         // For multi-take shots
    frame?: number;              // Seconds into clip (future)
  };
  type: "issue" | "passed";
  category: "timing" | "audio" | "visual" | "completeness" | "continuity";
  message: string;
  severity: "info" | "warning" | "error";
  resolved: boolean;
  resolved_by?: string;
  resolution_note?: string;
}
```

**Escalation:** Agents decide based on severity - errors block, warnings allow with flag, info logged only.
