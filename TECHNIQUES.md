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

### Black & White Conversion

**Keywords:** black and white, grayscale, monochrome, desaturate, noir, film grain, vintage

Multiple approaches for B&W conversion, from simple desaturation to heavily stylized looks.

**Basic Methods:**

| Style | Filter | Notes |
|-------|--------|-------|
| Simple B&W | `hue=s=0` | Fastest, clean desaturation |
| Via eq | `eq=saturation=0` | Alternative, same result |
| Monochrome | `monochrome` | Custom color filter control |

**Stylized Looks:**

| Style | Filter Chain | Effect |
|-------|--------------|--------|
| High contrast noir | `hue=s=0,eq=contrast=1.4:brightness=0.02:gamma=0.9` | Deep blacks, punchy contrast |
| Film grain | `hue=s=0,noise=alls=15:allf=t,eq=contrast=1.1` | Vintage film texture |
| Cool monochrome | `monochrome=cb=0.1:cr=-0.1,eq=contrast=1.2` | Slight cool/blue bias in grays |
| Crushed blacks | `hue=s=0,curves=preset=cross_process,eq=saturation=0` | Lost shadow detail, stylized |
| Warm monochrome | `monochrome=cb=-0.1:cr=0.1` | Slight warm/sepia bias |

**Complete command examples:**

```bash
# Simple B&W (fastest)
ffmpeg -i input.mp4 -vf "hue=s=0" -c:a copy output_bw.mp4

# High contrast noir
ffmpeg -i input.mp4 -vf "hue=s=0,eq=contrast=1.4:brightness=0.02:gamma=0.9" -c:a copy output_noir.mp4

# Film grain vintage
ffmpeg -i input.mp4 -vf "hue=s=0,noise=alls=15:allf=t,eq=contrast=1.1" -c:a copy output_grainy.mp4

# Crushed blacks (note: requires -pix_fmt yuv420p for compatibility)
ffmpeg -i input.mp4 -vf "hue=s=0,curves=preset=cross_process,eq=saturation=0" -pix_fmt yuv420p -c:a copy output_crushed.mp4
```

**Important:** The `curves` filter can change pixel format to `yuv444p` which Windows Media Player doesn't support. Always add `-pix_fmt yuv420p` when using curves to ensure compatibility.

**GPU-accelerated (NVIDIA):**
```bash
ffmpeg -hwaccel cuda -i input.mp4 -vf "hue=s=0" -c:v h264_nvenc -c:a copy output_bw.mp4
```

**Combining with other effects:**
```bash
# B&W + vignette
ffmpeg -i input.mp4 -vf "hue=s=0,vignette=PI/4" -c:a copy output.mp4

# B&W + edge enhancement (gritty look)
ffmpeg -i input.mp4 -vf "hue=s=0,unsharp=5:5:1.5,eq=contrast=1.2" -c:a copy output.mp4

# B&W + slight blur (dreamy)
ffmpeg -i input.mp4 -vf "hue=s=0,gblur=sigma=1.5,eq=brightness=0.05" -c:a copy output.mp4
```

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

### Static Frame Interleaving (Ghost Effect)

**Keywords:** ghost, subliminal, flicker, presence/absence, interleave, flash frame, replace frame, static overlay, strobe image

Replaces every Nth frame of a video with a static "empty" version of the scene, creating a rapid flicker where subjects appear and disappear. Useful for ghostly presence/absence effects, subliminal flashing, or rapid visual transitions.

**Core FFmpeg pattern:**

```bash
ffmpeg -y -i video.mp4 -loop 1 -i static_image.png -filter_complex "
[0:v]setpts=PTS-STARTPTS[video];
[1:v]scale=WIDTH:HEIGHT:force_original_aspect_ratio=disable,setsar=1,fps=FRAMERATE[static];
[video][static]overlay=enable='eq(mod(n,N),N-1)':shortest=1[v]
" -map "[v]" -an output.mp4
```

**Key parameters:**
- `mod(n,N)` — N controls frequency (3 = every 3rd frame replaced)
- `enable='eq(mod(n,N),N-1)'` — triggers on frame numbers where `n % N == N-1`
- `scale=WIDTH:HEIGHT:force_original_aspect_ratio=disable` — exact match to video dimensions
- `fps=FRAMERATE` — match source framerate (usually 24)
- `-an` — removes audio (add back with `-c:a copy` if needed)

**Complete example with ping-pong loop:**

```bash
# Create ghost flicker effect with reversed loop
ffmpeg -y -i singer_performance.mp4 -loop 1 -i empty_stage.png -filter_complex "
[0:v]setpts=PTS-STARTPTS,reverse,setpts=PTS-STARTPTS[rev];
[0:v]setpts=PTS-STARTPTS[fwd];
[fwd][rev]concat=n=2:v=1:a=0,loop=-1:size=48,trim=duration=8,setpts=PTS-STARTPTS[pingpong];
[1:v]scale=720:1280:force_original_aspect_ratio=disable,setsar=1,fps=24[static];
[pingpong][static]overlay=enable='eq(mod(n,3),2)':shortest=1[v]
" -map "[v]" -t 8 -an output_ghost.mp4
```

**Frequency guide:**

| N Value | Effect | Description |
|---------|--------|-------------|
| 2 | Every other frame | 50% visibility, aggressive strobe |
| 3 | Every 3rd frame | ~33% ghost presence, visible flicker |
| 4 | Every 4th frame | 25% ghost, subtle shimmer |
| 6 | Every 6th frame | ~17% ghost, near-subliminal |
| 8+ | Every 8th+ frame | Brief flashes, subliminal at high framerates |

**Preparing the static "empty" frame:**

1. **Extract a frame** from the source video where the subject is absent (if available)
2. **Generate with AI** — use ImageGen to create an "empty" version of the scene
3. **Clone/inpaint** — use image editing to remove the subject from a frame
4. **Match exactly** — resolution, aspect ratio, and color grading must match the video

```bash
# Extract frame from video
ffmpeg -ss 0.0 -i video.mp4 -frames:v 1 -update 1 reference_frame.png

# Check video specs for matching
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate video.mp4
```

**Variations:**

```bash
# Replace with solid color instead of image
ffmpeg -y -i video.mp4 -f lavfi -i "color=black:s=720x1280:r=24" -filter_complex "
[0:v][1:v]overlay=enable='eq(mod(n,4),3)':shortest=1
" -an output_black_flash.mp4

# Multiple interleave patterns (ghost at N=3, flash at N=7)
ffmpeg -y -i video.mp4 -loop 1 -i ghost.png -loop 1 -i flash.png -filter_complex "
[0:v]setpts=PTS-STARTPTS[v];
[1:v]scale=720:1280,fps=24[g];
[2:v]scale=720:1280,fps=24[f];
[v][g]overlay=enable='eq(mod(n,3),2)':shortest=1[vg];
[vg][f]overlay=enable='eq(mod(n,7),6)':shortest=1[out]
" -map "[out]" -an output_multi.mp4
```

**Use cases:**
- Ghostly presence/absence (singer appears and disappears on stage)
- Moon phase rapid transitions (full moon ↔ crescent flicker)
- Subliminal messaging (brief frame insertions)
- Glitch/corruption aesthetic
- "Now you see it, now you don't" reveals

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

---

## Film Strip Scroll Effect (2026-01-16)

**Keywords:** film strip, sprockets, vintage, scroll, still images, photo montage, vertical scroll

Creates a vintage film strip effect from still images with scrolling sprocket holes. The entire strip (images + sprockets) scrolls vertically for an authentic film reel look.

### Specifications for 9:16 4K (2160x3840)

| Element | Value | Notes |
|---------|-------|-------|
| Frame size | 2160x3840 | 4K vertical |
| Black border width | 160px | Each side |
| Content area | 1840x3840 | Between borders |
| Sprocket dimensions | 90w x 60h | Wider than tall (horizontal rectangles) |
| Sprocket X positions | Left: 35, Right: 2035 | Centered in borders |
| Sprocket Y spacing | 960px apart | 4 visible per frame |
| Sprocket Y start | 450 | First sprocket top-left corner |
| Corner radius | 100px | Rounded corners on images |

### Workflow Overview

1. **Process each image** with rounded corners on white background
2. **Stack vertically** into tall strip
3. **Draw borders and sprockets** on full strip (so they scroll)
4. **Animated crop** to create scrolling effect

### Step 1: Process Images with Rounded Corners

Each image gets scaled to fill the content area with only the corners rounded. White shows through the corner cutouts.

```bash
RADIUS=100
CONTENT_W=1840
CONTENT_H=3840
FRAME_W=2160
FRAME_H=3840

ffmpeg -y -i "source_image.jpeg" \
  -f lavfi -i "color=white:s=${CONTENT_W}x${CONTENT_H}" \
  -filter_complex "
    [0]scale=${CONTENT_W}:${CONTENT_H}:force_original_aspect_ratio=increase,crop=${CONTENT_W}:${CONTENT_H},format=rgba,
    geq='
      r=r(X,Y):g=g(X,Y):b=b(X,Y):
      a=if(
        lte(X,${RADIUS})*lte(Y,${RADIUS})*gt(hypot(${RADIUS}-X,${RADIUS}-Y),${RADIUS})+
        gte(X,W-${RADIUS})*lte(Y,${RADIUS})*gt(hypot(X-(W-${RADIUS}),${RADIUS}-Y),${RADIUS})+
        lte(X,${RADIUS})*gte(Y,H-${RADIUS})*gt(hypot(${RADIUS}-X,Y-(H-${RADIUS})),${RADIUS})+
        gte(X,W-${RADIUS})*gte(Y,H-${RADIUS})*gt(hypot(X-(W-${RADIUS}),Y-(H-${RADIUS})),${RADIUS}),
        0,255)
    '[img];
    [1][img]overlay=0:0,pad=${FRAME_W}:${FRAME_H}:(ow-iw)/2:0:white
  " -frames:v 1 "frame_output.png"
```

**How the rounded corners work:**
- `geq` (generic equation) filter sets alpha channel per-pixel
- For each corner quadrant, calculates distance from corner center
- If distance > radius, pixel is transparent (a=0), otherwise opaque (a=255)
- Image is overlaid on white background, so white shows through transparent corners

### Step 2: Stack Images Vertically

```bash
ffmpeg -y \
  -i frame_00.png -i frame_01.png -i frame_02.png \
  -i frame_03.png -i frame_04.png -i frame_05.png \
  -i frame_06.png -i frame_07.png -i frame_08.png \
  -filter_complex "[0][1][2][3][4][5][6][7][8]vstack=inputs=9" \
  -update 1 stacked_strip.png
```

For 9 images at 3840px each: total strip height = 34560px

### Step 3: Build Scrolling Sprocket Filter

Sprockets must be drawn on the FULL strip BEFORE the animated crop so they scroll with the content.

```bash
# Black borders (full strip height)
FILTER="drawbox=x=0:y=0:w=160:h=34560:c=black:t=fill"
FILTER="$FILTER,drawbox=x=2000:y=0:w=160:h=34560:c=black:t=fill"

# Sprockets every 960px (Y positions: 450, 1410, 2370, 3330, ...)
for y in 450 1410 2370 3330 4290 5250 6210 7170 8130 9090 \
         10050 11010 11970 12930 13890 14850 15810 16770 17730 18690 \
         19650 20610 21570 22530 23490 24450 25410 26370 27330 28290 \
         29250 30210 31170 32130 33090 34050; do
  FILTER="$FILTER,drawbox=x=35:y=$y:w=90:h=60:c=white:t=fill"
  FILTER="$FILTER,drawbox=x=2035:y=$y:w=90:h=60:c=white:t=fill"
done
```

### Step 4: Render with Animated Crop

```bash
# Calculate scroll speed: (strip_height - frame_height) / duration
# For 9 images: (34560 - 3840) / duration = 30720 / duration

# 5-second version: speed = 30720 / 5 = 6144 px/sec
ffmpeg -y -loop 1 -i stacked_strip.png \
  -vf "${FILTER},crop=2160:3840:0:'t*6144',format=yuv420p" \
  -t 5 -r 24 -c:v libx264 -pix_fmt yuv420p \
  output_5sec.mp4

# 3.5-second version: speed = 30720 / 3.5 = 8777 px/sec
ffmpeg -y -loop 1 -i stacked_strip.png \
  -vf "${FILTER},crop=2160:3840:0:'t*8777',format=yuv420p" \
  -t 3.5 -r 24 -c:v libx264 -pix_fmt yuv420p \
  output_3.5sec.mp4
```

**Key insight:** The `crop` filter's Y position uses `t*speed` where `t` is time in seconds. This creates smooth vertical scrolling. Drawing borders/sprockets BEFORE the crop makes them part of the scrolling content.

### Speed Reference

| Duration | Images | Speed (px/sec) | Feel |
|----------|--------|----------------|------|
| 5.0s | 9 | 6144 | Moderate, viewable |
| 3.5s | 9 | 8777 | Fast, dynamic |
| 4.0s | 9 | 7680 | Balanced |

**Formula:** `speed = (num_images - 1) * frame_height / duration`

### Customization

**Adjusting corner radius:**
- 50px = subtle rounding
- 100px = noticeable vintage feel
- 150px+ = very rounded, almost oval

**Adjusting sprocket size:**
- Current: 90w x 60h (horizontal rectangle)
- For taller sprockets: swap to 60w x 90h
- Scale proportionally for different frame sizes

**Adjusting border width:**
- 160px works well for 4K (2160 wide)
- For 1080p (720 wide): use ~55px borders
- Rule of thumb: ~7.5% of frame width per side

### Output Examples

| File | Description |
|------|-------------|
| `data/exports/workspace_filmstrip_4k.mp4` | 5-second version |
| `data/exports/workspace_filmstrip_4k_fast.mp4` | 3.5-second version |
| `data/workspace/stacked_strip_rounded.png` | Processed strip with rounded corners |

---

## Progressive Split Screen Effect (2026-01-16)

**Keywords:** split screen, grid, mosaic, multi-clip, animated grid, 16-up, quad split, picture-in-picture, montage

Creates an animated split screen effect where clips progressively multiply: 1→2→4→8→16, ending with a 4x4 grid. Existing clips shrink while new clips slide in from edges.

### Specifications for 9:16 4K (2160x3840)

| State | Grid | Clips | Each Clip Size | Layout |
|-------|------|-------|----------------|--------|
| 1 | 1×1 | 1 | 2160×3840 | Full frame |
| 2 | 1×2 | 2 | 2160×1920 | Stacked vertically |
| 3 | 2×2 | 4 | 1080×1920 | 2×2 grid |
| 4 | 2×4 | 8 | 1080×960 | 2 cols × 4 rows |
| 5 | 4×4 | 16 | 540×960 | 4×4 grid |

### Animation Approach

Each transition uses two simultaneous animations:
1. **Existing clips shrink** via animated `scale` filter
2. **New clips slide in** via animated `overlay` position

Transitions alternate direction:
- 1→2: Vertical split (clip 2 slides up from bottom)
- 2→4: Horizontal split (clips 3-4 slide in from right)
- 4→8: Vertical split (clips 5-8 slide up from bottom)
- 8→16: Horizontal split (clips 9-16 slide in from right)

### Core Technique: Expression-Based Animation

FFmpeg's `scale` and `overlay` filters support expressions with `eval=frame` for per-frame evaluation. The time variable `t` enables smooth interpolation.

**Linear interpolation pattern:**
```
if(lt(t,T_START), FROM_VALUE,
  if(lt(t,T_END), FROM_VALUE - (FROM_VALUE - TO_VALUE) * (t - T_START) / (T_END - T_START),
    TO_VALUE))
```

**Scale example (shrink width from 2160 to 1080 over 0.3s starting at t=1.9):**
```bash
scale=w='if(lt(t,1.9),2160,if(lt(t,2.2),2160-(2160-1080)*(t-1.9)/0.3,1080))':h=...:eval=frame
```

**Overlay example (slide from x=2160 to x=1080):**
```bash
overlay=x='if(lt(t,1.9),2160,if(lt(t,2.2),2160-(2160-1080)*(t-1.9)/0.3,1080))':y=0:eval=frame:enable='gte(t,1.9)'
```

**Key points:**
- `eval=frame` is required for time-based expressions
- `enable='gte(t,T)'` controls when a clip becomes visible
- Nest `if()` statements for multi-phase animations

### Default Timing (Accelerating Pace, 4s Total)

| Time | Event | Duration |
|------|-------|----------|
| 0.0 - 1.0s | State 1 (full screen) | 1.0s hold |
| 1.0 - 1.4s | Transition 1→2 | 0.4s |
| 1.4 - 1.9s | State 2 (2 clips) | 0.5s hold |
| 1.9 - 2.2s | Transition 2→4 | 0.3s |
| 2.2 - 2.6s | State 3 (4 clips) | 0.4s hold |
| 2.6 - 2.9s | Transition 4→8 | 0.3s |
| 2.9 - 3.2s | State 4 (8 clips) | 0.3s hold |
| 3.2 - 3.5s | Transition 8→16 | 0.3s |
| 3.5 - 4.0s | State 5 (16 clips) | 0.5s hold |

### Using the Script

Reference implementation: `scripts/split-screen/generate_split_filter.sh`

```bash
# Run from project root with 16 input clips
cd /path/to/video-generator
bash scripts/split-screen/generate_split_filter.sh
```

The script expects 16 input files at `data/exports/placeholder_{1-16}.mp4`. Modify the `INPUTS` section to use your own clips.

**Customizing timing:** Edit the timing constants at the top of the script:
```bash
T1=1.0   # End state 1, start transition 1→2
T2=1.4   # End transition 1→2
# ... etc
TEND=4.0 # Total duration
```

### Mixed Input Types

Videos and images can be combined. For images, use `-loop 1` before the input:

```bash
# Videos: direct input
-i clip1.mp4 -i clip5.mp4

# Images: with loop flag (MUST come before -i)
-loop 1 -i image2.png -loop 1 -i image3.jpg
```

### Creating Test Placeholders

Generate colored placeholder clips for testing:

```bash
# Create numbered colored placeholders
ffmpeg -y -f lavfi -i "color=c=red:s=2160x3840:r=24:d=5" \
  -vf "drawtext=text='1':fontsize=400:fontcolor=white:x=(w-tw)/2:y=(h-th)/2" \
  -c:v libx264 -preset fast -pix_fmt yuv420p -t 5 placeholder_1.mp4
```

### Output Examples

| File | Description |
|------|-------------|
| `data/exports/split_screen_16clips.mp4` | Full 16-clip version |
| `data/exports/split_test_4clips.mp4` | 4-clip test version |
| `scripts/split-screen/generate_split_filter.sh` | Reference implementation |

### Customization Ideas

1. **Different grid progression:** 1→4→9→16 (square numbers) instead of powers of 2
2. **Reverse effect:** Start with 16 clips, merge down to 1
3. **Hold on specific state:** Extend timing to showcase a particular grid
4. **Easing functions:** Replace linear interpolation with ease-in/ease-out curves
5. **Different slide directions:** All from center outward, spiral pattern, etc.
