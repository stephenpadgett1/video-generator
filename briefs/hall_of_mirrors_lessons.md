# Hall of Mirrors — Lessons (v1 + v2)

Built 2026-05-25. Two distinct pieces from the same brief concept:
- **v1**: gallery-style hall with discrete framed mirrors. Tone poem, silent, felt-piano. 28s.
- **v2 (Multiplication Horror)**: classic carnival funhouse mirror maze. Sister piece to Guess Booth. 32.6s.

## v1 (gallery hall)

### What worked
- **Silent + felt-piano + ambient** as a tone-poem audio bed. No dialogue, no muzak — just texture.
- **Concrete subtle wrong-notes** per mirror (lips moving silently / older reflection / back-of-head / gaze break to camera) each landed in their static frames AND in Veo motion. The audience builds the wrongness over the piece.

### What didn't work
- Nothing major. Smooth build.

## v2 (funhouse maze — Multiplication Horror)

### What worked
- **Over-the-shoulder (OTS) compositions** are the cinematic solution for "reflection diverges from the real person." Showing both anchors (real character in fg + reflection in mirror) gives nano/Veo a clear physics frame to work within. Without that, the AI can't represent "the reflection is acting independently" because the prompt is metaphysically nonsensical from the model's POV.
- **Top-down bird's-eye drone shot** rendered well with explicit "looking straight down (90 degrees, perfectly overhead)" language and architectural detail in the prompt (rectangular roof, 4 doors with light puddles).
- **Reversing the stinger** to convert "4 figures exiting" → "4 figures entering" gave a stronger reveal logic (multiplicity outside) for almost no extra cost (just ffmpeg `-vf reverse`).
- **Cross-cut/interleave editing** between S4 (reflection walks away) and NEW_A (multiplication appears) created simultaneity tension — two impossibilities happening at once. Easy in ffmpeg: slice each clip into parts and concat in the alternating order.

### What didn't work
- **Wide-shot divergence in multiplied reflections** is essentially impossible. Nano and Veo both refuse to break mirror symmetry — every reflection in a chain stays in sync with the source. Several attempts (head turn on one rogue, raised arm on one reflection) all failed. Solution: don't try; either commit to OTS singles or fall back to a stylistic-strange direction.
- **First-attempt close-ups rendered as isolated framed mirrors** rather than panels of the maze wall. The prompt language must explicitly call out "this is a WALL of the maze, NOT a discrete framed mirror." Even with maze_master.png as a ref, prose can override.
- **Nano identity drift in a single OTS frame**: the reflection's face in v2_s3_ots_A first attempt rendered a different person than the character ref, and Veo propagated that drift through motion. The static-frame identity must be verified BEFORE submitting Veo, not just the Veo output. Fixed by passing a known-good prior frame (v2b_s2_ots_A) as an additional nano reference. Memory captured: see [[feedback_veo_ots_identity_drift]].

## Generalizable techniques

- **The bilabial test for lip-sync detection** (also applies to Guess Booth) — false-positive prone but useful as a negative filter.
- **Reverse cinema as a low-cost reframing** — when a Veo clip has the right elements but the wrong narrative direction, reversing the timeline can produce a different read.
- **OTS as a structural anchor** for any "two of the same person in frame" scene — the convention gives the model real physics to render.
- **When a complex Veo motion fails, fall back to interleaved cuts** of two simpler clips to imply the complex motion (e.g., "many things happening simultaneously" → cross-cut two single-event clips).

## Cost

v1: ~$15. v2: ~$22 of the $50 budget (~$8 Veo Fast, ~$4 Veo Standard, ~$6 nano with multiple iterations, ~$1 ElevenLabs, ~$3 upscale).
