# Plan: Rough Cut V4 - VO Boost and Video Trim

## Goal
Create rough_cut_v4.mp4 with:
1. VO boosted to 3.5x (up from 2.5x)
2. Video section 0:04-0:09 removed (5 seconds cut)
3. Native audio/SFX cut with video, but VO remains continuous

## Approach

### Step 1: Rebuild from rough_cut_v2 (has layered audio without VO)
- Trim video: keep 0:00-0:04 and 0:09-0:32
- Trim background audio (native + water + geese) same as video
- Result: 27-second video with background audio

### Step 2: Mix in VO at 3.5x volume
- VO plays continuously from start (no cuts)
- VO will now sync differently since 5s of video removed

## FFmpeg Command

```bash
ffmpeg -y \
  -i data/workspace/rough_cut_v2.mp4 \
  -i data/workspace/vo_recorded.aac \
  -filter_complex "
    [0:v]trim=0:4,setpts=PTS-STARTPTS[v1];
    [0:v]trim=9:32,setpts=PTS-STARTPTS[v2];
    [0:a]atrim=0:4,asetpts=PTS-STARTPTS[a1];
    [0:a]atrim=9:32,asetpts=PTS-STARTPTS[a2];
    [v1][v2]concat=n=2:v=1:a=0[vout];
    [a1][a2]concat=n=2:v=0:a=1[bgaudio];
    [1:a]volume=3.5[vo];
    [bgaudio][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]
  " \
  -map "[vout]" -map "[aout]" \
  -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k \
  data/workspace/rough_cut_v4.mp4
```

## Result
- Duration: ~27 seconds (32 - 5 = 27)
- VO: 3.5x volume, continuous playback
- Background audio: cut matches video cut

## Files
- Input: `data/workspace/rough_cut_v2.mp4`, `data/workspace/vo_recorded.aac`
- Output: `data/workspace/rough_cut_v4.mp4`

## Verification
- Play rough_cut_v4.mp4 and confirm:
  - Video jumps from ~4s to ~9s content
  - VO is louder and plays continuously
  - Background audio (water, geese) follows video cuts
