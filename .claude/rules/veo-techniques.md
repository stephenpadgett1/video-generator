# Veo Techniques & Limitations

## Known Limitations

- VFX-heavy prompts (neon, hologram, glowing) often fail
- Character consistency improves with locking but poses still vary
- Complex physics unreliable
- Static starting positions unreliable - Veo tends to add entrance movement (door opening, stepping into frame) even when character should already be in place. Consider using reference frames or accepting brief lead-in action.

## Advanced Techniques

See **TECHNIQUES.md** in project root for hybrid FFmpeg + Veo methods including:

- **Frame chaining with double edge detection** — Multi-clip continuous motion (tunnels, corridors, infinite passages)
- **Edge detection as compositional constraint** — Shape preservation across generations
- **Color-coded reference experiments** — Semantic guides for Veo

## Tips

- Use reference images for consistent environments
- Lock characters before multi-shot sequences
- Accept ~1s lead-in action rather than fighting static starts
- For continuous motion, use last-frame chaining with edge overlays
