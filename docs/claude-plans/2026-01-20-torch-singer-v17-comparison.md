# Torch Singer v17 - Compile Comparison Results

## Context
The previous session built 5 v17 variants with different editing approaches for syncing a spotlight clip to the "beneath the spotlight" lyric. Scene detection and frame extraction at 10.5s were completed. The `analyze_video_gemini` tool was removed, so comparison must use alternative methods.

## v17 Variants

| Variant | Style | Expected Beam Time | File |
|---------|-------|-------------------|------|
| v17a | Spotlight bookended by intercuts | 10.5s | `torch_singer_v17a.mp4` |
| v17b | Full intercuts → spotlight reveal | 16.2s | `torch_singer_v17b.mp4` |
| v17c | Woven fragments through intercuts | ~13s | `torch_singer_v17c.mp4` |
| v17d | Spotlight opener, moon as climax | 8.5s (early) | `torch_singer_v17d.mp4` |
| v17e | Staccato rapid cuts | ~10.5s | `torch_singer_v17e.mp4` |

## Files Available
- **Final edits**: `data/workspace/torch_singer_v17{a-e}.mp4`
- **Experiment videos**: `data/workspace/v17_experiments/v17{a-e}_video.mp4`
- **Sync frames**: `data/workspace/v17{a-e}_sync_10.5s.png`
- **Concat lists**: `data/workspace/v17_experiments/v17{a-e}_concat.txt`

## Comparison Plan

### Step 1: Gather Technical Metrics
For each variant, collect:
- Total duration (ffprobe)
- Scene change count & timestamps (ffmpeg scene detection)
- Cut rhythm analysis (time between cuts)

### Step 2: Visual Sync Verification
View the extracted 10.5s frames to verify what's visible at the target lyric moment:
- Read each `v17{a-e}_sync_10.5s.png`
- Note whether spotlight beam is visible
- Record visual content at sync point

### Step 3: Compile Comparison Table
Create a summary table with:
- Duration
- Beam timing accuracy (vs expected)
- Scene change count
- Cut rhythm (avg time between cuts)
- Visual state at 10.5s

### Step 4: Qualitative Assessment
Based on the metrics and frame analysis:
- Which variants hit the lyric sync?
- Which have the best pacing/rhythm?
- Recommendation for preferred edit

## Verification
- All data captured in structured format
- Clear recommendation with reasoning
- Results suitable for future reference
