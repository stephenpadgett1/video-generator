# Plan: Tunnel Scroll Test - Edge-Reinforced Veo Generation

## Concept
Quick controlled test of vertical scroll through an organic tunnel using stronger edge constraints. Only 2 clips to validate the approach before scaling up.

**Key change from previous test:** Edge-detect BOTH reference frames to reinforce structural boundaries.

**Specs:** 720x1280 (9:16), 2 chained clips (~16 seconds), silent

---

## Key Changes from Previous Test

| Aspect | Previous (Failed) | This Test |
|--------|-------------------|-----------|
| Border creation | FFmpeg drawbox | ImageGen (organic tunnel) |
| Border prominence | Subtle gray tubes | Prominent rocky cave walls |
| Reference for clip 2 | lastframe + edges overlay | edge(lastframe) + edges overlay |
| Clip count | 4 clips | 2 clips (quick validation) |

---

## Step 1: Generate Tunnel Border with ImageGen

**Prompt:**
```
A view looking down a natural rocky cave tunnel. The tunnel walls frame the
image on the left and right sides, leaving the center open. Rough stone
texture, stalactites, organic rock formations. The walls should be prominent
and take up about 20% of each side. Dark rocky grays and browns. The center
is dark/black. Portrait orientation 9:16.
```

Save as: `generated-images/tunnel_base.png`

---

## Step 2: Edge Detect Tunnel Base

```bash
ffmpeg -i generated-images/tunnel_base.png \
  -vf "edgedetect=low=0.1:high=0.4" \
  -y generated-images/tunnel_edges.png
```

---

## Step 3: Generate Clip 1 (Tunnel Entrance)

**Reference:** `generated-images/tunnel_edges.png`

**Prompt:**
```
Camera descending into a natural rocky cave tunnel. Rough stone walls visible
on left and right edges of frame. Light filtering from above. Camera moving
smoothly downward through the tunnel. Rocky textures scrolling upward as we
descend. Continuous vertical movement. 8 seconds.
```

Save as: `data/video/tunnel_clip1.mp4`

---

## Step 4: Create Clip 2 Reference (DOUBLE EDGE)

```bash
# Extract last frame
ffmpeg -sseof -0.1 -i data/video/tunnel_clip1.mp4 \
  -frames:v 1 -y generated-images/clip1_lastframe.png

# Edge detect the last frame
ffmpeg -i generated-images/clip1_lastframe.png \
  -vf "edgedetect=low=0.1:high=0.4" \
  -y generated-images/clip1_lastframe_edges.png

# Composite: last frame edges + tunnel edges
ffmpeg -i generated-images/clip1_lastframe_edges.png \
  -i generated-images/tunnel_edges.png \
  -filter_complex "[0:v][1:v]blend=all_mode=lighten" \
  -y generated-images/clip2_reference.png
```

---

## Step 5: Generate Clip 2 (Deeper Tunnel)

**Reference:** `generated-images/clip2_reference.png`

**Prompt:**
```
Continuing descent through rocky cave tunnel. Stone walls on left and right
edges. Darker now, less light from above. Camera moving smoothly downward.
Rocky textures scrolling upward. Seamless continuation. 8 seconds.
```

Save as: `data/video/tunnel_clip2.mp4`

---

## Step 6: Concatenate with Annotations

```bash
# Concatenate
ffmpeg -f concat -safe 0 -i list.txt -c copy data/exports/tunnel_scroll_test.mp4

# Add debug annotations showing clip boundaries
```

---

## Success Criteria (for 2-clip test)

| Criteria | Pass | Fail |
|----------|------|------|
| Tunnel walls in clip 1 | Visible throughout | Fade or disappear |
| Tunnel walls in clip 2 | Visible throughout | Lost after frame chain |
| Scroll motion | Continuous downward | Stops, reverses, or drifts |
| Transition | Smooth continuation | Hard cut or jarring |

---

## Output Files

| File | Purpose |
|------|---------|
| `generated-images/tunnel_base.png` | ImageGen tunnel |
| `generated-images/tunnel_edges.png` | Edge baseline |
| `generated-images/clip1_lastframe_edges.png` | Edge-detected last frame |
| `generated-images/clip2_reference.png` | Double-edge composite |
| `data/video/tunnel_clip1.mp4` | First clip |
| `data/video/tunnel_clip2.mp4` | Second clip |
| `data/exports/tunnel_scroll_test.mp4` | Final (16s) |
| `data/exports/tunnel_scroll_test_annotated.mp4` | Debug version |
