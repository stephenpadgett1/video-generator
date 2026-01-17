# Caution Music Video Build

**Date:** 2026-01-17
**Song:** "Caution" (Suno AI)
**Duration:** 62.25 seconds
**Aspect Ratio:** 9:16 (vertical)
**Resolution:** 2160x3840
**Frame Rate:** 24 fps

## Summary

A music video for "Caution" featuring AI-generated clips from Veo arranged in a fast-paced montage style. The edit uses an overlay-based compositing approach with a black base layer, allowing precise timeline control of each clip segment.

## Audio Structure

The audio uses a 3-way mix:
1. **music1**: Caution.wav from 0-40.5s plays at timeline 0-40.5s
2. **clip_audio**: Closeup_static_camera audio from source 2.50-7.45s plays at timeline 40.5-45.45s
3. **music2**: Caution.wav from 40.5s onwards plays starting at timeline 45.45s until song end (~62.27s)

## Timeline

| Time | Clip | Source Trim | Duration |
|------|------|-------------|----------|
| 0.000-1.500 | Static_camera_yellow_4k | 0-1.5 | 1.5s |
| 1.500-3.000 | Static_camera_yellow_4k | 6.5-8 | 1.5s |
| 3.000-5.708 | Upward_sweeping_dolly_4k | 1-3.708 | 2.708s |
| 5.709-7.917 | The_trio_in_4k | 0-2.208 | 2.208s |
| 7.917-9.417 | High_energy_rap_4k | 6.5-8 | 1.5s |
| 9.417-10.333 | The_trio_in_4k | 5-5.916 | 0.916s |
| 10.333-12.333 | The_mysterious_robed_4k | 2-4 (reversed) | 2.0s |
| 12.333-13.333 | Quick_cuts_of_4k | 5.5-6.5 | 1.0s |
| 13.333-14.833 | Intercuts_of_the_4k | 2.5-4 | 1.5s |
| 14.833-15.833 | Quick_cuts_of_4k | 6.5-7.5 | 1.0s |
| 15.833-17.333 | Intercuts_of_the_4k | 6.5-8 | 1.5s |
| 17.333-18.333 | Quick_cuts_of_4k | 0-1 | 1.0s |
| 18.333-20.000 | Intercuts_of_the_4k | 0-1.667 | 1.667s |
| 20.000-24.000 | split_screen_real | full | 4.0s |
| 24.000-25.500 | Three_women_in_4k | 0-1.5 | 1.5s |
| 25.500-27.500 | filmstrip_4k_2sec | full | 2.0s |
| 27.500-29.000 | Arc_shot_slowly_4k | 0-1.5 | 1.5s |
| 29.000-30.000 | Arc_shot_slowly_4k | 7-8 | 1.0s |
| 30.000-34.583 | Upbeat_rave_dance_4k | 0-4.583 | 4.583s |
| 34.583-39.500 | Wide_shot_of_4k | 3.083-8 | 4.917s |
| 39.500-45.450 | Closeup_static_camera_4k | 1.5-7.45 | 5.95s |
| 45.450-50.450 | The_mysterious_robed_4k | 2-7 | 5.0s |
| 50.450-52.450 | Three_women_in_4k | 6-8 | 2.0s |
| 52.450-54.450 | Golden_slop_raining_4k | 0-2 | 2.0s |
| 54.450-55.200 | Classic_noir_scene_4k | 0-0.75 | 0.75s |
| 55.200-57.000 | Technicolor_1950s_mgm_4k | 0.5-2.3 | 1.8s |
| 57.000-59.000 | High_energy_rave_4k | 0-2 | 2.0s |
| 59.000-62.250 | High_energy_rave_4k | 4.75-8 | 3.25s |

## Source Clips

| Input | Filename |
|-------|----------|
| 0 | Black base layer (generated) |
| 1 | The_trio_in_4k_202601152125.mp4 |
| 2 | workspace_filmstrip_4k_2sec.mp4 |
| 3 | Upbeat_rave_dance_4k_202601152143.mp4 |
| 4 | Quick_cuts_of_4k_202601152120.mp4 |
| 5 | Static_camera_yellow_4k_202601161757.mp4 |
| 6 | Upward_sweeping_dolly_4k_202601161741.mp4 |
| 7 | High_energy_rap_4k_202601161629.mp4 |
| 8 | Extremely_quick_115_4k_202601152150.mp4 |
| 9 | Wide_shot_of_4k_202601161611.mp4 |
| 10 | split_screen_real.mp4 |
| 11 | Arc_shot_slowly_4k_202601161726.mp4 |
| 12 | The_mysterious_robed_4k_202601161822.mp4 |
| 13 | Intercuts_of_the_4k_202601161540.mp4 |
| 14 | Three_women_in_4k_202601162230.mp4 |
| 15 | Closeup_static_camera_4k_202601152101.mp4 |
| 16 | High_energy_rave_4k_202601161315.mp4 |
| 17 | Golden_slop_raining_4k_202601170047.mp4 |
| 18 | Classic_noir_scene_4k_202601170104.mp4 |
| 19 | Technicolor_1950s_mgm_4k_202601170112.mp4 |
| 20 | Caution.wav |

## FFmpeg Build Script

```bash
#!/bin/bash
cd "$(dirname "$0")/../.."

ffmpeg -y \
  -f lavfi -i "color=c=black:s=2160x3840:r=24:d=65" \
  -i "data/workspace/The_trio_in_4k_202601152125.mp4" \
  -i "data/workspace/workspace_filmstrip_4k_2sec.mp4" \
  -i "data/workspace/Upbeat_rave_dance_4k_202601152143.mp4" \
  -i "data/workspace/Quick_cuts_of_4k_202601152120.mp4" \
  -i "data/workspace/Static_camera_yellow_4k_202601161757.mp4" \
  -i "data/workspace/Upward_sweeping_dolly_4k_202601161741.mp4" \
  -i "data/workspace/High_energy_rap_4k_202601161629.mp4" \
  -i "data/workspace/Extremely_quick_115_4k_202601152150.mp4" \
  -i "data/workspace/Wide_shot_of_4k_202601161611.mp4" \
  -i "data/workspace/split_screen_real.mp4" \
  -i "data/workspace/Arc_shot_slowly_4k_202601161726.mp4" \
  -i "data/workspace/The_mysterious_robed_4k_202601161822.mp4" \
  -i "data/workspace/Intercuts_of_the_4k_202601161540.mp4" \
  -i "data/workspace/Three_women_in_4k_202601162230.mp4" \
  -i "data/workspace/Closeup_static_camera_4k_202601152101.mp4" \
  -i "data/workspace/High_energy_rave_4k_202601161315.mp4" \
  -i "data/workspace/Golden_slop_raining_4k_202601170047.mp4" \
  -i "data/workspace/Classic_noir_scene_4k_202601170104.mp4" \
  -i "data/workspace/Technicolor_1950s_mgm_4k_202601170112.mp4" \
  -i "data/workspace/Caution.wav" \
  -filter_complex_script "data/workspace/v023_filter_final.txt" \
  -map "[final]" -map "[audio_out]" \
  -c:v libx264 -preset fast -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -t 62.25 \
  "data/exports/caution_v023_final.mp4"
```

## FFmpeg Filter Script

```
[1:v]trim=start=0:end=2.208,setpts=PTS-STARTPTS+5.709/TB[trio_a];
[1:v]trim=start=5.0:end=5.916,setpts=PTS-STARTPTS+9.417/TB[trio_b];
[2:v]setpts=PTS-STARTPTS+25.500/TB[filmstrip];
[11:v]trim=start=0:end=1.5,setpts=PTS-STARTPTS+27.500/TB[arc_intro1];
[11:v]trim=start=7.0:end=8.0,setpts=PTS-STARTPTS+29.000/TB[arc_intro2];
[3:v]trim=start=0:end=4.583,setpts=PTS-STARTPTS+30.000/TB[rave_early];
[4:v]trim=start=5.5:end=6.5,setpts=PTS-STARTPTS+12.333/TB[newcut1];
[4:v]trim=start=6.5:end=7.5,setpts=PTS-STARTPTS+14.833/TB[newcut2];
[4:v]trim=start=0:end=1.0,setpts=PTS-STARTPTS+17.333/TB[newcut3];
[5:v]trim=start=0:end=1.5,setpts=PTS-STARTPTS+0.0/TB[static1];
[5:v]trim=start=6.5:end=8.0,setpts=PTS-STARTPTS+1.5/TB[static2];
[6:v]trim=start=1.0:end=3.708,setpts=PTS-STARTPTS+3.0/TB[dolly];
[7:v]trim=start=6.5:end=8.0,setpts=PTS-STARTPTS+7.917/TB[rap_end];
[9:v]trim=start=3.083:end=8.0,setpts=PTS-STARTPTS+34.583/TB[wide_new];
[10:v]setpts=PTS-STARTPTS+20.000/TB[splitscreen];
[12:v]trim=start=2.0:end=4.0,reverse,setpts=PTS-STARTPTS+10.333/TB[mysterious_rev];
[13:v]trim=start=2.5:end=4.0,setpts=PTS-STARTPTS+13.333/TB[newinter1];
[13:v]trim=start=6.5:end=8.0,setpts=PTS-STARTPTS+15.833/TB[newinter2];
[13:v]trim=start=0:end=1.667,setpts=PTS-STARTPTS+18.333/TB[newinter3];
[14:v]trim=start=0:end=1.5,setpts=PTS-STARTPTS+24.000/TB[threewomen];
[15:v]trim=start=1.50:end=7.45,setpts=PTS-STARTPTS+39.500/TB[closeup];
[12:v]trim=start=2:end=7,setpts=PTS-STARTPTS+45.450/TB[mysterious_end];
[14:v]trim=start=6:end=8,setpts=PTS-STARTPTS+50.450/TB[threewomen_end];
[16:v]trim=start=0:end=2,setpts=PTS-STARTPTS+57.000/TB[rave1];
[16:v]trim=start=4.75:end=8,setpts=PTS-STARTPTS+59.000/TB[rave2];
[17:v]trim=start=0:end=2,setpts=PTS-STARTPTS+52.450/TB[golden_slop];
[18:v]trim=start=0:end=0.75,setpts=PTS-STARTPTS+54.450/TB[classic_noir];
[19:v]trim=start=0.5:end=2.3,setpts=PTS-STARTPTS+55.200/TB[technicolor];
[0:v][static1]overlay=enable='between(t,0,1.5)':eof_action=pass[ov1];
[ov1][static2]overlay=enable='between(t,1.5,3.0)':eof_action=pass[ov2];
[ov2][dolly]overlay=enable='between(t,3.0,5.708)':eof_action=pass[ov3];
[ov3][trio_a]overlay=enable='between(t,5.709,7.917)':eof_action=pass[ov4];
[ov4][rap_end]overlay=enable='between(t,7.917,9.417)':eof_action=pass[ov5];
[ov5][trio_b]overlay=enable='between(t,9.417,10.333)':eof_action=pass[ov6];
[ov6][mysterious_rev]overlay=enable='between(t,10.333,12.333)':eof_action=pass[ov7];
[ov7][newcut1]overlay=enable='between(t,12.333,13.333)':eof_action=pass[ov8];
[ov8][newinter1]overlay=enable='between(t,13.333,14.833)':eof_action=pass[ov9];
[ov9][newcut2]overlay=enable='between(t,14.833,15.833)':eof_action=pass[ov10];
[ov10][newinter2]overlay=enable='between(t,15.833,17.333)':eof_action=pass[ov11];
[ov11][newcut3]overlay=enable='between(t,17.333,18.333)':eof_action=pass[ov12];
[ov12][newinter3]overlay=enable='between(t,18.333,20.000)':eof_action=pass[ov13];
[ov13][splitscreen]overlay=enable='between(t,20.000,24.000)':eof_action=pass[ov14];
[ov14][threewomen]overlay=enable='between(t,24.000,25.500)':eof_action=pass[ov15];
[ov15][filmstrip]overlay=enable='between(t,25.500,27.500)':eof_action=pass[ov16];
[ov16][arc_intro1]overlay=enable='between(t,27.500,29.000)':eof_action=pass[ov17];
[ov17][arc_intro2]overlay=enable='between(t,29.000,30.000)':eof_action=pass[ov18];
[ov18][rave_early]overlay=enable='between(t,30.000,34.583)':eof_action=pass[ov19];
[ov19][wide_new]overlay=enable='between(t,34.583,39.500)':eof_action=pass[ov20];
[ov20][closeup]overlay=enable='between(t,39.500,45.450)':eof_action=pass[ov21];
[ov21][mysterious_end]overlay=enable='between(t,45.450,50.450)':eof_action=pass[ov22];
[ov22][threewomen_end]overlay=enable='between(t,50.450,52.450)':eof_action=pass[ov23];
[ov23][golden_slop]overlay=enable='between(t,52.450,54.450)':eof_action=pass[ov24];
[ov24][classic_noir]overlay=enable='between(t,54.450,55.200)':eof_action=pass[ov25];
[ov25][technicolor]overlay=enable='between(t,55.200,57.000)':eof_action=pass[ov26];
[ov26][rave1]overlay=enable='between(t,57.000,59.000)':eof_action=pass[ov27];
[ov27][rave2]overlay=enable='between(t,59.000,62.250)':eof_action=pass[final];
[20:a]atrim=end=40.5,asetpts=PTS-STARTPTS[music1];
[15:a]atrim=start=2.50:end=7.45,asetpts=PTS-STARTPTS,adelay=40500|40500[clip_audio];
[20:a]atrim=start=40.5,asetpts=PTS-STARTPTS,adelay=45450|45450[music2];
[music1][clip_audio][music2]amix=inputs=3:duration=longest:normalize=0[audio_out]
```

## Technical Notes

- Uses overlay chain approach with black base layer for precise timeline control
- `eof_action=pass` allows overlays to pass through when clip ends
- `setpts=PTS-STARTPTS+OFFSET/TB` positions each clip segment on the timeline
- The `reverse` filter is used on mysterious_robed at 10.333s for visual effect
- Audio mixing uses `amix` with `normalize=0` to prevent automatic gain adjustment
- Debug version (v023_filter.txt) includes drawtext overlays for clip identification

## Output

- **Final:** `data/exports/caution_v023_final.mp4`
- **Debug:** `data/exports/caution_v023.mp4` (with clip labels and timecode)
