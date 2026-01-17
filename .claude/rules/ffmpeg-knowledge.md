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

## Frame Extension Techniques

**Problem:** Need to hold the last frame of a clip for additional time.

**Approaches (in order of reliability):**

1. **Adjust clip timing** (most reliable)
   - Don't extend - just start the next clip earlier
   - Avoids filter complexity entirely

2. **tpad filter** (works but order-sensitive)
   ```bash
   # CORRECT: trim → tpad → setpts (single setpts at end)
   [0:v]trim=start=6.5:end=8.0,tpad=stop_duration=0.5:stop_mode=clone,setpts=PTS-STARTPTS+1.5/TB[out];

   # WRONG: double setpts breaks tpad
   [0:v]trim=...,setpts=PTS-STARTPTS,tpad=...,setpts=PTS-STARTPTS+X/TB[out];
   ```

3. **eof_action=repeat on overlay** (unreliable in chains)
   - May not work correctly with multiple chained overlays
   - Last resort, prefer tpad or timing adjustment

## Overlay eof_action Options

| Option | Behavior | Use Case |
|--------|----------|----------|
| `pass` | Pass through background when overlay ends | Default, most predictable |
| `repeat` | Repeat last overlay frame | Frame hold (but unreliable in chains) |
| `endall` | End output when shortest input ends | Trim to shortest |

**Recommendation:** Always use `eof_action=pass` and ensure overlay clip has sufficient duration.

## Filter Chain Ordering

**General rule:** `trim` → processing filters → `setpts` (positioning)

```bash
# Input processing order:
trim=start=X:end=Y           # 1. Cut segment from source
,tpad=stop_duration=0.5      # 2. Extend if needed
,setpts=PTS-STARTPTS+OFFSET/TB  # 3. Position in timeline (ONCE, at end)
```

**Why single setpts matters:** Multiple setpts calls can corrupt timestamps, especially after filters that add frames (tpad, loop).

## Debugging Overlay Chains

When overlays produce unexpected results:

1. **Test each overlay independently** - Comment out all but one
2. **Check clip durations** - Use `ffprobe -show_entries format=duration`
3. **Verify timing math** - Ensure overlay enable windows match clip placements
4. **Watch for gaps** - If clip ends before overlay window, you'll see black/background

## Text Label Overlap

**Problem:** Adjacent labels appear simultaneously at boundaries.

```bash
# WRONG: both true at t=3.5
enable='between(t,0,3.5)'
enable='between(t,3.5,6.0)'

# CORRECT: exclusive end bounds
enable='gte(t,0)*lt(t,3.5)'
enable='gte(t,3.5)*lt(t,6.0)'
```
