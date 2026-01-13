# Plan: Polished Edit of Sagittarius Clips

## Goal
Analyze 8 Sagittarius-themed clips, determine optimal sequence and trim points, and assemble into a polished final video with tension-aware transitions.

## Clips (all 8s, 720x1280, 24fps)
- sagittarius_1.mp4
- sagittarius_2.mp4
- sagittarius_arrow.mp4
- sagittarius_arrow_2.mp4
- sagittarius_end.mp4
- sagittarius_multiple_firing.mp4
- sagittarius_multiple_targets.mp4
- sagittarius_why_choose.mp4

## Workflow

### Phase 1: Content Analysis
Use `analyze_video_gemini` on each clip to understand visual content:
- What's happening in each clip?
- Where does meaningful action start/end?
- What mood/energy level?

This will inform both sequence ordering and trim recommendations.

### Phase 2: Technical Analysis
Use `analyze_clip_unified` on each clip to detect:
- Black frames at start/end
- Freeze frames (AI artifacts)
- Scene changes
- Audio activity timing

### Phase 3: Sequence & Trim Decisions
Based on analysis:
1. Propose narrative order (intro → action → climax → resolution)
2. Identify trim points for each clip (remove dead time)
3. Assign energy/tension values for transition logic

### Phase 4: Assemble Final Video
Use `assemble_video` MCP tool with explicit shots array. **Trimming is built-in** via `trimStart`/`trimEnd` per shot - no need for separate trim files.

```json
{
  "shots": [
    {
      "videoPath": "data/workspace/sagittarius_1.mp4",
      "trimStart": 0.5,
      "trimEnd": 7.2,
      "energy": 0.5,
      "tension": 0.3
    },
    ...
  ],
  "outputFilename": "sagittarius_final.mp4"
}
```

Transitions will be auto-selected based on tension/energy values:
- High→Low tension: long crossfade
- Low→High tension: black insert
- Sustained high: hard cuts

## Audio Treatment
Keep original clip audio (no additional music or VO).

## Deliverable
`data/exports/sagittarius_final.mp4` - polished assembled video

## Verification
1. Review each trimmed clip duration
2. Check final video plays smoothly with no glitches
3. Verify transitions feel natural between shots
