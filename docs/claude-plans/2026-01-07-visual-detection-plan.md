# Plan: Add blackdetect and freezedetect to Unified Analysis

## Goal
Add two FFmpeg visual detection filters to `/api/analyze-clip-unified` for coarse edit timing signals.

## File to Modify
`routes/unified-analysis.js`

---

## Implementation

### 1. Add `detectBlackFrames()` function (after line 61)

```javascript
function detectBlackFrames(videoPath, threshold = 0.98, minDuration = 0.1) {
  // blackdetect: finds sequences of black frames
  // threshold: how dark is "black" (0.98 = nearly pure black)
  // minDuration: minimum length to report
  const cmd = `ffmpeg -i "${videoPath}" -vf "blackdetect=d=${minDuration}:pix_th=${threshold}" -f null - 2>&1`;

  // Parse output lines like:
  // [blackdetect @ ...] black_start:1.5 black_end:2.0 black_duration:0.5

  return [{ start, end, duration }]
}
```

### 2. Add `detectFreezeFrames()` function

```javascript
function detectFreezeFrames(videoPath, noiseTolerance = 0.001, duration = 0.5) {
  // freezedetect: finds static/frozen frames
  // noise: how much pixel variation allowed
  // duration: minimum freeze length to report
  const cmd = `ffmpeg -i "${videoPath}" -vf "freezedetect=n=${noiseTolerance}:d=${duration}" -f null - 2>&1`;

  // Parse output lines like:
  // [freezedetect @ ...] freeze_start: 3.0
  // [freezedetect @ ...] freeze_end: 4.5 freeze_duration: 1.5

  return [{ start, end, duration }]
}
```

### 3. Call detectors in main endpoint (around line 553)

```javascript
const blackFrames = detectBlackFrames(fullPath);
const freezeFrames = detectFreezeFrames(fullPath);
```

### 4. Add to response JSON

Add new section to response:

```javascript
visual_detection: {
  black_frames: blackFrames,
  freeze_frames: freezeFrames,
  summary: {
    has_black_frames: blackFrames.length > 0,
    has_freeze_frames: freezeFrames.length > 0,
    total_black_duration: sum of durations,
    total_freeze_duration: sum of durations
  }
}
```

### 5. Integrate into anomaly detection

Add to `detectAnomalies()`:
- **Black frame at start/end** → natural cut point (info)
- **Freeze frame > 1s** → potential AI artifact or dead time (warning)
- **Freeze frame during expected speech** → likely generation issue (warning)

### 6. Integrate into edit suggestions

In `generateEditSuggestions()`:
- Use black frames as high-confidence trim points
- Flag freeze frames as potential trim-out regions

---

## Options to expose

Add to `options` parameter:
```javascript
blackThreshold = 0.98,      // How dark is "black"
blackMinDuration = 0.1,     // Minimum black duration to detect
freezeNoise = 0.001,        // Freeze detection noise tolerance
freezeMinDuration = 0.5     // Minimum freeze to detect
```

---

## Testing

After implementation, test with:
```bash
curl -X POST http://localhost:3000/api/analyze-clip-unified \
  -H "Content-Type: application/json" \
  -d '{"videoPath": "some_clip.mp4"}'
```

Verify `visual_detection` section appears in response with black/freeze frame data.
