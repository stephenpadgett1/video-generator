# Model Weights — Educational Video Brief

## Overview

A 45–60s vertical (9:16) educational video explaining what model weights are, how they're stored, and what they encode. Audience: a technical viewer (software engineer) unfamiliar with deep learning. Register: educational, animated, warm but precise. No unsettling weirdness; fun lives in small motion details, not concept.

- **Duration:** ~55s
- **Aspect ratio:** 9:16 vertical
- **Voice:** VO throughout
- **Visual style:** Clean geometric animation. Warm-but-cool palette. Diagrammatic (3Blue1Brown-adjacent) with light terminal/code accents.
- **Math depth:** One equation shown with shapes (`y = x·W + b`). Conceptual, not lecture-heavy.

## Learning goals

By the end, a viewer should walk away with:

1. A model is a file of numbers; the architecture (code) is separate and often open source.
2. The file is organized — named tensors with shapes, not a soup.
3. Numeric representation matters (bf16, ~16 bits/weight) and explains the file size.
4. The forward pass is stacked matmuls + nonlinearities; a learned function.
5. Concepts are encoded in distributed patterns across many weights (with a light gesture at superposition), and interpretability research can extract them.

## Accuracy notes (non-negotiable)

- A single weight is **not** "the bridge weight." Concepts live in distributed patterns. Be careful not to imply otherwise in either VO or visuals.
- The Golden Gate Bridge / "Python code" / "uncertainty" examples reference Anthropic's *Scaling Monosemanticity* work using sparse autoencoders. Frame as features researchers extracted, not labels stored in the file.
- Use **bf16** for the precision callout (more honest for current frontier training).
- 70B parameters × 16 bits ≈ 140 GB is the arithmetic to land. Keep the file size consistent (139 GB shown on the file icon, ~140 GB in the math beat — the small discrepancy is fine and realistic).
- Don't claim a single equation explains the whole network. The `y = x·W + b` shot represents *one* step inside one layer.

---

## Shot-by-shot breakdown

### Shot 1 — Hook (0–6s)

**Visual:** Black. A glossy nameplate fades up: **"a frontier model."** Dissolves into a file icon labeled `model.safetensors`. Size badge slides in: **139 GB**.

**VO:** "This file is a model. The whole thing — everything it knows, stored as numbers."

**Notes:** The marketing-language nameplate dissolving into a plain file icon is the whole rhetorical move of the opener. Keep it understated; no smirk.

---

### Shot 2 — Architecture vs. weights (6–18s)

**Visual:** Split screen.
- **Left:** A few hundred lines of clean Python (transformer forward pass) scroll by. Labeled **"architecture."** Subtle open-source indicator (e.g., a small GitHub-style mark or "open source" tag).
- **Right:** The file icon from Shot 1, labeled **"weights,"** pulsing gently.

**VO:** "The architecture — the code that runs it — is often just a few thousand lines, and often open source. What makes one model different from another is the values inside this file."

**Notes:** Code on the left should be readable-ish but not the focus; viewers should register "this is normal Python" without trying to parse it. Real transformer code (e.g., from a Llama-style reference implementation) reads more honestly than fake code.

---

### Shot 3 — Inside the file / the math beat (18–30s)

**Visual:** Camera pushes into the file icon. It opens like a drawer. Inside: rows of labeled tensors slide forward.
- Tensor labels visible: `layers.0.attn.q_proj`, `layers.0.mlp.up_proj`, `layers.1.attn.q_proj`, etc.
- Each tensor rendered as a colored grid with its **shape** floating above (e.g., `[8192, 8192]`).
- One tensor zooms forward; a single cell magnifies to reveal a number: **0.0274**.
- Tag appears next to the number: `bfloat16 · 16 bits`.
- Counter rolls up: **70,000,000,000 parameters**.
- Math snaps in: **70B × 16 bits ≈ 140 GB**.

**VO:** "Open it up — it's organized into named tensors. Multidimensional arrays. A seventy-billion-parameter model holds seventy billion numbers, typically at sixteen bits each. That's where the gigabytes come from."

**Notes:** This is the densest shot in the piece. Visual rhythm should be: drawer opens → tensors slide → one zooms → number reveals → counter rolls → equation lands. ~12 seconds is enough if each beat is crisp. The example value `0.0274` is arbitrary; any plausible bf16 value works.

---

### Shot 4 — What the numbers do (30–40s)

**Visual:** The single tensor from Shot 3 becomes part of an equation: **`y = x·W + b`**.
- Vector `x` flows in from the left.
- Multiplies through `W` (the tensor lights up).
- `b` adds in.
- `y` flows out to the right.
- Camera pulls back; this op repeats and stacks — dozens of layers in a flowing pipeline.
- Small `ReLU` / `SiLU` icon appears between layers.

**VO:** "Each tensor is a multiplication step. Stack them, add a few nonlinearities, and the whole stack becomes a learned function — input goes in, output comes out."

**Notes:** The equation is the only math in the piece. It should feel like a label on the visual, not a problem to solve. The pull-back to "stack of layers" is doing more work than the equation itself. Pick one nonlinearity icon and use it consistently — SiLU is more accurate for modern models, ReLU is more recognizable. Either is fine.

---

### Shot 5 — Concepts live in patterns (40–50s)

**Visual:** Camera pulls back further. The full file is now a vast field of softly glowing weights.
- Hold for a beat.
- A pattern lights up: not one weight, but a constellation of *thousands*, scattered across many tensors, pulsing in sync.
- Label fades in: **"Golden Gate Bridge."**
- Another pattern lights up: **"Python code."**
- Another: **"uncertainty."**
- The patterns overlap — they share some weights.
- Small caption flickers near the overlap: *superposition.*

**VO:** "But the things the model knows aren't stored in single weights. Each concept is a pattern spread across thousands of them — and the patterns overlap, packed into the same space."

**Notes:** This is the conceptual payoff and the shot most worth lingering on. The "constellation" should clearly read as *many distributed points*, not a single highlighted region. The overlap between patterns is the visual argument for superposition; the caption is optional reinforcement. If the caption clutters the shot in production, drop it — the visual carries.

---

### Shot 6 — Payoff (50–55s)

**Visual:** The patterns settle into a calm steady state.
- Small text overlay in corner: *sparse autoencoders, 2024–.*
- Final card: **"the weights are a learned language. we're learning to read it."**

**VO:** "Researchers can now reach into those patterns and pull out features that map to human ideas. The weights are a learned language — and we're just starting to read it."

**Notes:** The corner caption is for the curious viewer who wants to search — not in VO. If it crowds the final card, drop it. The closing line should land clean.

---

## Production notes

### Visual system

- **Palette:** Cool background (deep blue / near-black) with warm accents (amber, soft orange) for active elements. Tensors and patterns in a desaturated complementary range.
- **Typography:** Monospace for code, tensor names, shapes, and numeric values. Sans-serif for labels and the final card.
- **Motion:** Smooth, eased. Avoid bouncy or playful easing curves — this is educational, not promotional. Small motion details (drawer-open, tensor slide, counter roll) carry the "fun."
- **Camera:** Continuous push-in from Shot 1 through Shot 3, then a sustained pull-back from Shot 4 through Shot 5. The camera move *is* the structural through-line: zoom in to the smallest unit (one number), zoom out to see the patterns.

### Audio

- **VO:** Calm, clear, mid-range. Not announcer-y. Slightly warmer than neutral.
- **Music:** Minimal. Soft underscore, no melodic hook competing with VO. Could be near-silent for the first ~6s to let the hook land.
- **SFX:** Light. Drawer open, tensor slide, counter tick, soft chime on equation snap-in. Nothing percussive enough to distract.

### Text on screen

All on-screen text is supplementary, not redundant with VO. Keep it minimal:
- File name + size (Shot 1)
- "architecture" / "weights" labels (Shot 2)
- Tensor names + shapes, single value, precision tag, parameter counter, size equation (Shot 3)
- `y = x·W + b` (Shot 4)
- Concept labels + "superposition" caption (Shot 5)
- Corner caption + final card (Shot 6)

### Open production decisions

- **Nonlinearity icon:** SiLU (accuracy) vs. ReLU (recognizability). Lean SiLU.
- **Superposition caption (Shot 5):** Keep or drop based on visual density in production.
- **SAE corner caption (Shot 6):** Keep or drop based on final-card composition.
- **Code source (Shot 2):** Real reference implementation (Llama-style) recommended over synthetic code for honesty.

---

## VO script (consolidated)

> This file is a model. The whole thing — everything it knows, stored as numbers.
>
> The architecture — the code that runs it — is often just a few thousand lines, and often open source. What makes one model different from another is the values inside this file.
>
> Open it up — it's organized into named tensors. Multidimensional arrays. A seventy-billion-parameter model holds seventy billion numbers, typically at sixteen bits each. That's where the gigabytes come from.
>
> Each tensor is a multiplication step. Stack them, add a few nonlinearities, and the whole stack becomes a learned function — input goes in, output comes out.
>
> But the things the model knows aren't stored in single weights. Each concept is a pattern spread across thousands of them — and the patterns overlap, packed into the same space.
>
> Researchers can now reach into those patterns and pull out features that map to human ideas. The weights are a learned language — and we're just starting to read it.

Approximate word count: 135. Target read time: ~50–55s at a relaxed educational pace.
