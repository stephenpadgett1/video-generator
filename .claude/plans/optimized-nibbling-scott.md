# Plan: Add Visual Debug Overlays to Clip Validator

## Goal

Update clip-validator to render annotations directly on video clips so we can visually review what's being flagged.

## Approach

Add `--visual` flag to clip-validator that creates annotated copies of clips with overlay text showing validation results.

```bash
npx tsx clip-validator.ts project.json --visual
```

## How It Works

1. Run normal validation (as before)
2. For each clip, build ffmpeg drawtext filter with annotations
3. Assemble all clips into one video with annotations rendered
4. Output to `data/exports/{project_id}_validated.mp4`
5. Color-code by severity: green (passed), yellow (warning), red (error)

## Visual Format

```
┌─────────────────────────────────────────────┐
│ [TOP-LEFT]                                  │
│ shot_3 (take 1)                             │
│ clip-validator                              │
│                                             │
│                                             │
│                                             │
│                                             │
│ [BOTTOM-LEFT]                               │
│ ✓ File exists                               │
│ ⚠ Duration 8.0s vs target 3s               │
│ ✓ Audio track present                       │
│ ✓ Resolution 1920x1080                      │
└─────────────────────────────────────────────┘
```

- **Top**: Shot ID, take index, agent name
- **Bottom**: Validation results with symbols (✓/⚠/✗) color-coded

## Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `src/agents/clip-validator.ts` | Add `--visual` flag, ffmpeg overlay generation |

### Code Changes

1. **Parse `--visual` flag** from CLI args
2. **Add `assembleWithAnnotations()` function**:
   - For each shot/take: get video path from jobs.json
   - Build ffmpeg filter chain with drawtext overlays per clip
   - Use ffmpeg concat + filter_complex to assemble with overlays
   - Color: `fontcolor=green` / `yellow` / `red` based on severity
   - Output to `data/exports/{project_id}_validated.mp4`
3. **Call after validation** if `--visual` is set
4. **Print output path** in summary

### FFmpeg Filter Example

```bash
ffmpeg -i input.mp4 -vf "
  drawtext=text='shot_3 (take 1)':fontsize=24:fontcolor=white:x=20:y=20,
  drawtext=text='✓ File exists':fontsize=18:fontcolor=green:x=20:y=h-100,
  drawtext=text='⚠ Duration 8.0s vs 3s':fontsize=18:fontcolor=yellow:x=20:y=h-70,
  drawtext=text='✓ Audio present':fontsize=18:fontcolor=green:x=20:y=h-40
" -c:a copy output.mp4
```

## Test

```bash
cd src/agents
npx tsx clip-validator.ts ../../data/projects/two_friends_meet_unexpectedly__1767668356193.json --visual
# Output: data/exports/two_friends_meet_unexpectedly__1767668356193_validated.mp4
```
