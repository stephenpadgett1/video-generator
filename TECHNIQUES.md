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
