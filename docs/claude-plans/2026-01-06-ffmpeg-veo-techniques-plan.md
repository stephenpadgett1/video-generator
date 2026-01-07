# Plan: Create TECHNIQUES.md for FFmpeg + Veo Hybrid Methods

## Task
Document the edge-as-reference technique and related FFmpeg/Veo hybrid methods discovered in this session.

## Key Findings to Document

### Edge Detection as Compositional Constraint
- Apply FFmpeg `edgedetect` filter to source frame
- Feed edge-detected frame to Veo as reference image
- Veo preserves shape outlines while filling with new content
- Test A (tree prompt) maintained top/bottom silhouette shapes from soldier reference
- This gives us a "semantic layer" - edges define WHERE, prompt defines WHAT

### FFmpeg Effects Explored
| Effect | Filter | Creative Use |
|--------|--------|--------------|
| Edge detect | `edgedetect=low=0.1:high=0.3` | Shape/composition constraint |
| Quad mirror | crop+hflip+hstack+vflip+vstack | Kaleidoscope, mandala |
| Hue cycle | `hue=h='360*t/5'` | Rainbow color shift |
| Ghost/trail | `tmix=frames=5` | Motion blur, echo |
| RGB shift | `rgbashift=rh=-10:bh=10` | Glitch aesthetic |
| Inverted | `negate` | Negative colors |
| Bloom | `boxblur` | Soft glow |

### Frame Manipulation Techniques
- Extract individual frames: `ffmpeg -i clip.mp4 frames/frame_%02d.png`
- Speed control: `setpts=0.5*PTS` (2x), `setpts=0.125*PTS` (8x)
- Strobe effect: alternate content frame with black frame via concat
- Frame rate control: output at 60fps for faster strobing

### Veo Reference Image Findings
- Edge-detected images work as references
- Veo interprets edges as compositional guidance
- Shape silhouettes persist even with divergent prompts
- Can enforce "there will always be X shape in frame"

## Files to Create
- `TECHNIQUES.md` in project root

## Execution
1. Create TECHNIQUES.md with above findings
2. Run /closeout
