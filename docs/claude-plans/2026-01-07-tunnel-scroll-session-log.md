# Session Log: Tunnel Scroll Demo (2026-01-07)

## Accomplishments

### 1. Tunnel Scroll Test - Double Edge Detection Technique
Developed and tested a technique for maintaining structural elements across multi-clip Veo generations:

- **Problem solved:** Structural elements (walls, borders) fade or disappear after 1-2 clips when chaining Veo generations
- **Solution:** Use first+last frame constraints with double edge detection
  - Generate structural reference with ImageGen (organic rocky tunnel)
  - Edge detect the base structure
  - For each subsequent clip: composite edge-detected last frame WITH original structural edges
  - Use composite as both first AND last frame to "bookend" generation

### 2. Demo Video Created
- `data/exports/tunnel_scroll_demo_final.mp4` (14 seconds)
  - 2s title card with credits and autonomous pipeline highlight
  - 12s content (3 clips at 2x speed)
- Title card includes: date, GitHub repo, technique description, AI/tool credits

### 3. Technique Documentation
- Added comprehensive "Frame Chaining with Double Edge Detection" section to `TECHNIQUES.md`
- Added "Advanced Techniques" pointer in `CLAUDE.md`
- Includes: step-by-step workflow, lessons learned, API parameters, variation ideas

## Key Files Created/Modified

| File | Change |
|------|--------|
| `CLAUDE.md` | Added "Advanced Techniques" section pointing to TECHNIQUES.md |
| `TECHNIQUES.md` | Added tunnel/frame chaining technique with full documentation |
| `tunnel-scroll-test-plan.md` | Test plan in project root |
| `data/exports/tunnel_scroll_demo_final.mp4` | Final demo video |
| `data/video/tunnel_clip[1-3].mp4` | Individual Veo clips |
| `generated-images/tunnel_*.png` | Reference images and edge composites |

## Lessons Learned

| Approach | Result |
|----------|--------|
| FFmpeg drawbox borders | Too subtle, Veo ignores by clip 2 |
| Single edge reference (first frame only) | Structure lost mid-clip |
| Last frame only (no structural edges) | Walls disappeared |
| **ImageGen + double edge + first+last frame** | **Walls maintained across 3 clips** |

## Unexpected Behavior (Feature)
Veo interpreted "descending downward" as "flying forward into tunnel" rather than vertical scroll. Created compelling infinite tunnel flythrough effect.

## Next Steps / Future Work
- Test technique with different structures (corridors, pipes, abstract passages)
- Try true vertical scroll via different prompting or FFmpeg post-processing
- Experiment with color evolution across clips

## Session State
- All work complete and documented
- Ready to commit
