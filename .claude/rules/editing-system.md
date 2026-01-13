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

## MCP Tools

| Tool | Input | Output |
|------|-------|--------|
| `edit_start` | job_id, project_id?, shot_id?, take_index?, expected_dialogue? | Creates edit folder, copies source |
| `edit_trim` | job_id, trim_start?, trim_end?, notes?, precise? | Renders trimmed variation |
| `edit_speed` | job_id, base_variation?, speed, notes? | Creates speed-adjusted variation |
| `edit_select` | job_id, variation_id | Marks variation as selected |
| `edit_store_analysis` | job_id, analysis | Store analysis results |
| `edit_auto_analyze` | job_id, apply_suggestions?, context? | Analyze and optionally auto-trim |
| `get_edit_manifest` | job_id | Returns manifest |
| `list_edits` | - | Lists all edit folders |

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

## Trim Options

| Option | Default | Purpose |
|--------|---------|---------|
| `trim_start` | 0 | Start time in seconds |
| `trim_end` | source duration | End time in seconds |
| `precise` | false | Re-encode for frame-accurate cuts |

When `precise: false` (default), uses stream copy which is fast but snaps to keyframes.
When `precise: true`, re-encodes for exact timestamps (slower).

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
