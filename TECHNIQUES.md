# Video Generation Techniques

Hybrid methods combining FFmpeg processing with Veo AI generation.

## Edge Detection as Compositional Constraint

**Discovery:** Feeding an edge-detected frame to Veo as a reference image preserves shape/silhouette while allowing content transformation.

**Workflow:**
1. Extract frame from source video
2. Apply edge detection: `ffmpeg -i frame.png -vf "edgedetect=low=0.1:high=0.3" edges.png`
3. Use `edges.png` as Veo reference image
4. Prompt for different content

**Result:** Veo maintains the compositional structure (where shapes are) while generating new content based on prompt. This creates a "semantic layer" - edges define WHERE, prompt defines WHAT.

**Tested:** Soldier silhouette edge frame + tree prompt = tree that follows soldier's outline shape.

**Use cases:**
- Enforce specific shapes persist across generations
- Content swap while maintaining composition
- Sketch-to-video (hand-drawn edges → AI fills in)
- Storyboard-to-animation pipeline

---

## FFmpeg Effects Reference

### Visual Filters

| Effect | Command | Use Case |
|--------|---------|----------|
| Edge detect | `-vf "edgedetect=low=0.1:high=0.3"` | Composition constraint, sketch aesthetic |
| Quad mirror | `-vf "crop=iw/2:ih/2,split[a][b];[b]hflip[c];[a][c]hstack,split[d][e];[e]vflip[f];[d][f]vstack"` | Kaleidoscope, mandala |
| Hue cycle | `-vf "hue=h='360*t/5'"` | Rainbow color rotation |
| Ghost/trail | `-vf "tmix=frames=5:weights='1 1 1 1 1'"` | Motion blur, echo effect |
| RGB shift | `-vf "rgbashift=rh=-10:bh=10:rv=5:bv=-5"` | Chromatic aberration, glitch |
| Invert | `-vf "negate"` | Negative colors |
| Bloom | `-vf "boxblur=luma_radius=2:luma_power=3"` | Soft glow |
| High contrast | `-vf "eq=contrast=1.5:brightness=0.1"` | Punch up visuals |

### Speed Control

```bash
# 2x speed
-vf "setpts=0.5*PTS"

# 4x speed
-vf "setpts=0.25*PTS"

# 8x speed (near-subliminal)
-vf "setpts=0.125*PTS"
```

### Frame Extraction

```bash
# Extract all frames
ffmpeg -i clip.mp4 -vsync 0 frames/frame_%02d.png

# Extract single frame at timestamp
ffmpeg -ss 2.0 -i clip.mp4 -frames:v 1 frame.png
```

### Strobe/Flash Effects

For visible strobing, alternate between content and black frames:

```bash
# Create concat list
cat > strobe.txt << 'EOF'
file 'content_frame.png'
duration 0.2
file 'black.png'
duration 0.2
EOF

# Generate strobe
ffmpeg -f concat -safe 0 -stream_loop 24 -i strobe.txt -t 10 -vf "fps=24" strobe.mp4
```

**Timing guide:**
- 0.2s per frame = visible alternation (2.5Hz)
- 0.1s per frame = fast strobe (5Hz)
- 0.017s per frame (60fps) = subliminal

### Frame Sequences

**Forward sequence (pulse):**
```bash
# Concat frames 1→8 in order, loop
```

**Bounce sequence (breathe):**
```bash
# Concat frames 1→2→3→4→5→6→7→8→7→6→5→4→3→2→1, loop
```

---

## Veo Reference Image Behavior

**Observations:**
- Edge-detected images are interpreted as compositional guides
- High-contrast silhouettes are preserved even with divergent prompts
- Black areas in reference may be filled with prompt-driven content
- Reference acts as soft constraint, not hard mask

**Best practices for edge-as-reference:**
- Use high contrast edges (clear white lines on black)
- Simple shapes work better than complex detail
- Prompt should complement, not contradict, the silhouette
- Test with both content-swap and style-match prompts

---

## Experimental Directions

1. **Feedback loops:** Veo output → FFmpeg effect → back to Veo as reference
2. **Style frames:** Heavy effects as reference to inject aesthetic without prompting
3. **Iterative abstraction:** Edge detect → generate → edge detect → generate...
4. **Composition lock:** Same edge reference, vary prompts for A/B content tests
5. **Hand-drawn integration:** Sketch on paper → scan → edge enhance → Veo fills in

---

## Color-Coded Reference Experiment (2026-01-07)

Tested whether Veo interprets colored shapes as compositional/semantic guides.

### Test 1: High-Contrast Color Silhouette
**Reference:** Red silhouette on black (from thresholded video frame)
**Prompt:** "Person standing in misty forest"
**Result:** Worked as expected. Veo followed the compositional pattern. Person positioned where red shape was.

### Test 2: Multi-Color Shapes (Human + Abstract)
**Reference:** Red human silhouette (left) + Blue rectangle (right) + Green strip (bottom)
**Prompt:** "Person facing glowing monolith in field"
**Result:** Interesting stylized effect. Needs more investigation.

### Test 3: Edges + Posterized Color
**Reference:** Posterized colors with cyan edge lines overlaid
**Prompt:** "Person on road at sunset"
**Result:** **Ghostly double effect** - Veo rendered both the actual person AND a translucent ghost/echo.

**Key finding:** Edges + color creates a "double exposure" effect - Veo tries to satisfy both structural edges AND color regions.

| Reference Style | Compositional Control | Notes |
|-----------------|----------------------|-------|
| Color silhouette | Strong | Clean, predictable |
| Multi-color shapes | Unclear | Needs more testing |
| Edges + color | Strong | Creates ghost/double effect |

### Test Files
- generated-images/test_ref_*.png (references)
- data/video/test_gen*.mp4 (outputs)

---

## Frame Chaining with Double Edge Detection (2026-01-07)

**Keywords:** tunnel, continuous motion, scroll, frame chain, multi-clip, seamless, descent, flythrough

Technique for generating seamless multi-clip continuous motion through constrained environments (tunnels, corridors, abstract passages).

### The Problem

When generating sequential clips with Veo for continuous motion:
1. Structural elements (walls, borders) fade or disappear after 1-2 clips
2. Motion direction drifts or reverses
3. Visual continuity breaks at clip boundaries

### The Solution: First+Last Frame Constraints with Double Edge Detection

**Core insight:** Use the edge-detected image as BOTH first AND last frame to "bookend" each generation, forcing Veo to maintain structural boundaries throughout the clip.

**For clip N+1:** Composite the edge-detected last frame of clip N WITH the original structural edges, then use that composite as both first and last frame.

### Complete Workflow

#### Step 1: Generate Structural Reference with ImageGen

```bash
curl -X POST "http://localhost:3000/api/generate-image" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A view looking down a natural rocky cave tunnel. The tunnel walls frame the image on the left and right sides, leaving the center open. Rough stone texture, stalactites, organic rock formations. The walls should be prominent and take up about 20% of each side. Dark rocky grays and browns. The center is dark/black. Portrait orientation 9:16.",
    "aspectRatio": "9:16"
  }'

# Rename to semantic name
mv generated-images/frame_*.png generated-images/tunnel_base.png
```

**Why ImageGen:** FFmpeg-drawn borders (rectangles, lines) are too subtle. ImageGen creates organic, prominent structural elements that Veo respects better.

#### Step 2: Edge Detect the Base Structure

```bash
ffmpeg -y -i generated-images/tunnel_base.png \
  -vf "edgedetect=low=0.1:high=0.4" \
  -update 1 generated-images/tunnel_edges.png
```

**Note:** Use `-update 1` flag when outputting single images from FFmpeg.

#### Step 3: Scale Edges to Match Veo Output (if needed)

ImageGen outputs 768x1408, Veo outputs 720x1280. Scale for compositing:

```bash
ffmpeg -y -i generated-images/tunnel_edges.png \
  -vf "scale=720:1280" \
  -update 1 generated-images/tunnel_edges_720.png
```

#### Step 4: Generate Clip 1 with First+Last Frame

```bash
curl -X POST "http://localhost:3000/api/veo/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Camera descending into a natural rocky cave tunnel. Rough stone walls visible on left and right edges of frame. Light filtering from above. Camera moving smoothly downward through the tunnel. Rocky textures scrolling upward as we descend. Continuous vertical movement. 8 seconds.",
    "aspectRatio": "9:16",
    "durationSeconds": 8,
    "referenceImagePath": "generated-images/tunnel_edges.png",
    "lastFramePath": "generated-images/tunnel_edges.png"
  }'
```

**Critical:** Both `referenceImagePath` (first frame) AND `lastFramePath` must be set. This bookends the generation.

#### Step 5: Create Double-Edge Reference for Clip N+1

```bash
# Extract last frame from previous clip
ffmpeg -sseof -0.1 -i data/video/tunnel_clip1.mp4 \
  -frames:v 1 -update 1 -y generated-images/clip1_lastframe.png

# Edge detect the last frame
ffmpeg -y -i generated-images/clip1_lastframe.png \
  -vf "edgedetect=low=0.1:high=0.4" \
  -update 1 generated-images/clip1_lastframe_edges.png

# Composite: last frame edges + structural edges (lighten blend)
ffmpeg -y -i generated-images/clip1_lastframe_edges.png \
  -i generated-images/tunnel_edges_720.png \
  -filter_complex "[0:v][1:v]blend=all_mode=lighten,format=rgb24" \
  generated-images/clip2_reference.png
```

**Why double edge:** The last frame edges capture where Veo placed content. The structural edges reinforce the tunnel walls. Combining them gives Veo both continuity AND structure constraints.

#### Step 6: Generate Subsequent Clips

```bash
curl -X POST "http://localhost:3000/api/veo/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Continuing descent through rocky cave tunnel. Stone walls on left and right edges. Darker now, less light from above. Camera moving smoothly downward. Rocky textures scrolling upward. Seamless continuation. 8 seconds.",
    "aspectRatio": "9:16",
    "durationSeconds": 8,
    "referenceImagePath": "generated-images/clip2_reference.png",
    "lastFramePath": "generated-images/clip2_reference.png"
  }'
```

Repeat steps 5-6 for each additional clip.

#### Step 7: Concatenate

```bash
cat > /tmp/concat.txt << 'EOF'
file 'data/video/tunnel_clip1.mp4'
file 'data/video/tunnel_clip2.mp4'
file 'data/video/tunnel_clip3.mp4'
EOF

ffmpeg -y -f concat -safe 0 -i /tmp/concat.txt -c copy output.mp4
```

### Lessons Learned

| What We Tried | Result | Lesson |
|---------------|--------|--------|
| FFmpeg drawbox borders | Borders faded by clip 2 | Too subtle, Veo ignores |
| Single edge reference (first frame only) | Structure lost mid-clip | Need first+last bookend |
| Last frame only (no structural edges) | Walls disappeared | Need original structure overlay |
| ImageGen organic tunnel + double edge | Walls maintained across 3 clips | **This works** |

### Unexpected Behavior (Feature, Not Bug)

Veo interpreted "descending downward" as "flying forward into the tunnel" rather than vertical scroll. The result:
- Camera pushes INTO the cave (forward motion)
- Abstract geometric cave walls regenerate as camera advances
- Creates a compelling infinite tunnel effect

**If you want true vertical scroll:** May need different prompting or FFmpeg post-processing approach (see sprocket scroll experiments).

### Output Examples

| File | Description |
|------|-------------|
| `data/exports/tunnel_scroll_demo_final.mp4` | 26s demo with title card |
| `data/video/tunnel_clip[1-3].mp4` | Individual clips |
| `generated-images/tunnel_base.png` | ImageGen structural reference |
| `generated-images/tunnel_edges*.png` | Edge-detected versions |
| `generated-images/clip[N]_reference.png` | Double-edge composites |

### Quick Reference: API Parameters

```javascript
// Veo generate with first+last frame
{
  "prompt": "...",
  "aspectRatio": "9:16",
  "durationSeconds": 8,
  "referenceImagePath": "path/to/edges.png",  // First frame
  "lastFramePath": "path/to/edges.png"        // Last frame (same or different)
}
```

### Variations to Try

1. **Different structures:** Corridors, pipes, organic tubes, abstract geometric passages
2. **Emergence:** Add "something appears" to final clip prompt for payoff
3. **Color evolution:** Prompt color changes across clips (light→dark, warm→cool)
4. **Speed variation:** Generate clips at different "motion speeds" via prompting
