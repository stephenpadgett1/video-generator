# FFmpeg Knowledge

## Stream Copy vs Re-encode for Trimming

**Problem:** `-c copy` (stream copy) cannot cut at arbitrary timestamps. It snaps to the nearest keyframe, often producing segments 50-100% longer than requested.

```bash
# Fast but imprecise (keyframe-aligned)
ffmpeg -y -ss 1.5 -i input.mp4 -t 2.0 -c copy output.mp4
# Requested 2.0s, may get 3.0-4.0s depending on keyframe placement

# Slower but frame-accurate
ffmpeg -y -ss 1.5 -i input.mp4 -t 2.0 -c:v libx264 -preset fast -crf 23 -c:a aac output.mp4
# Gets exactly 2.0s
```

**When to use each:**
- `precise: false` (stream copy) — Quick previews, rough cuts, when exact timing doesn't matter
- `precise: true` (re-encode) — Dialogue editing, tight cuts, when timestamps must be exact

## Timestamp Reset Flags

When using stream copy, add these flags to prevent container metadata corruption:
```bash
-avoid_negative_ts make_zero -reset_timestamps 1
```

Without these, concatenated clips may have incorrect frame rates or audio sync issues.

## Title Cards with Silent Audio

FFmpeg requires matching audio tracks for concatenation. For silent title cards:
```bash
ffmpeg -f lavfi -i "color=c=black:s=720x1280:r=24:d=2" \
  -f lavfi -i "anullsrc=r=48000:cl=stereo" \
  -vf "drawtext=text='Title':fontcolor=white:fontsize=48:x=(w-tw)/2:y=(h-th)/2" \
  -c:v libx264 -c:a aac -t 2 -pix_fmt yuv420p -shortest title.mp4
```

## Concatenation

Normalize all clips to same specs before concat:
- Same resolution, frame rate, pixel format (`-pix_fmt yuv420p`)
- Same audio codec, sample rate, channels (`-c:a aac -ar 48000 -ac 2`)

Then use concat demuxer:
```bash
printf "file 'a.mp4'\nfile 'b.mp4'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4
```
