# Named Tensors — Educational Video Brief

## Overview

A 45–60s vertical (9:16) educational video explaining what a "tensor" is and what "named tensors" means in the context of an LLM. Standalone follow-up to the *Model Weights* video — same series, same style. Picks up the thread the prior video set down ("the file is organized into named tensors") and unpacks it.

Audience: a technical viewer (software engineer) familiar with traditional software, unfamiliar with deep learning. Register: educational, animated, warm but precise. No unsettling weirdness; fun lives in small motion details, not concept.

- **Duration:** ~55s
- **Aspect ratio:** 9:16 vertical
- **Voice:** VO throughout
- **Visual style:** Match the *Model Weights* video. Clean geometric animation. Warm-but-cool palette. Diagrammatic (3Blue1Brown-adjacent) with light terminal/code accents.
- **Spine:** A single tensor path string — `model.layers.0.self_attn.q_proj.weight` — shown opaque at the start, decomposed across the body of the video, returned legible at the end.

## Learning goals

By the end, a viewer should walk away with:

1. A "tensor" in ML is just a multi-dimensional array. The word is borrowed loosely from math/physics.
2. An LLM file holds hundreds of these tensors, each with a string key (a "name").
3. The names are hierarchical paths that mirror the architecture's module tree.
4. The file is structured (a dictionary), not a binary blob — every entry knows where it goes.

## Visual spine

The path string `model.layers.0.self_attn.q_proj.weight` is the central object. It appears opaque, gets decomposed segment-by-segment into an indented hierarchy with visuals attached to each segment, then returns flat and legible at the end. Every other element supports this decomposition.

---

## Shot-by-shot

### Shot 1 — Hook (0–7s)
**Visual:** Dark terminal-ish panel, single cursor blinking. The path types out character-by-character with a soft mono-font feel:
`model.layers.0.self_attn.q_proj.weight`
It sits, opaque, slightly glowing. No labels yet.
**VO:** "This is part of an LLM. Not the whole thing — one piece of it. And this is its address."
**Notes:** Pace the typing slow enough to read but quick enough to land before the VO ends. Keep music near-silent here.

### Shot 2 — Frame the term (7–14s)
**Visual:** Pull back. The single path becomes one of many in a file-representation column — a vertical stack of similar-looking paths scrolling subtly. A `.safetensors` file icon sits at the top. One path (ours) stays highlighted; others fade slightly.
**VO:** "An LLM file holds hundreds of entries like this. They're called *named tensors*. The names look like paths — let's read one."
**Notes:** "named tensors" should appear as on-screen text in sync with VO. The other paths in the stack should be plausible — `model.embed_tokens.weight`, `model.layers.0.mlp.up_proj.weight`, `model.layers.31.post_attention_layernorm.weight`, etc. Real-shape Llama-style names recommended.

### Shot 3 — Unpack the path (14–35s)
**Visual:** Our path moves to the top of the frame, then "explodes" into an indented hierarchy as each segment lights up in turn. Each segment animates in alongside a small supporting visual:

```
model
  .layers.0
    .self_attn
      .q_proj
        .weight
```

- **`model`** — a simple outlined box materializes. *VO: "Model — the root. The whole thing."*
- **`.layers.0`** — the box subdivides into a vertical stack of identical blocks (32 of them, transformer layers). The bottom block highlights. *VO: "Layers — LLMs are stacks of identical blocks. This is the first."*
- **`.self_attn`** — the highlighted block opens up into two sub-modules side by side (attention + MLP). The attention sub-module highlights. *VO: "Self-attention — inside the block, the attention sub-module."*
- **`.q_proj`** — the attention sub-module further subdivides into Q, K, V, O projections. Q highlights. *VO: "Q-projection — inside attention, one specific projection."*
- **`.weight`** — an arrow snaps from `q_proj` to a materializing grid of numbers. *VO: "And `.weight` — the numbers themselves."*

**Notes:** Each segment is ~4s of screen time. Color-code each level (subtle, palette-consistent) so the hierarchy reads at a glance. The indented tree should grow downward as each segment is added — viewer sees the hierarchy build, doesn't have to hold it in memory.

### Shot 4 — Tensor reveal (35–43s)
**Visual:** The materialized grid fills more of the frame. Shape annotation pops up: `[4096, 4096]`. The grid populates with small fp16 values (legible only as "lots of decimals"). Briefly, the grid shrinks to a single highlighted cell, then expands back.
**VO:** "A tensor — just a multi-dimensional array. A grid. Sixteen million values, in this one. ML uses the word loosely."
**Notes:** Don't dwell on the math. The viewer should walk away knowing "tensor = array" and not feeling lectured. The "ML uses the word loosely" line is the one moment of intellectual honesty in the video — keep the read warm and matter-of-fact, not apologetic.

### Shot 5 — Payoff (43–52s)
**Visual:** Split frame. On the left: the column of named tensor paths from Shot 2. On the right: a simplified architecture module tree (the Python-ish structure of the model). Thin lines animate in, connecting each named path on the left to its corresponding node on the right. Several lines draw simultaneously.
**VO:** "The names mirror the architecture — the code that runs the model. That's what *named* means. The file isn't a pile of numbers. It's a dictionary — and every entry knows where it goes."
**Notes:** This is the structural revelation. The viewer should *see* the correspondence between the file's named tensors and the architecture's modules. Resist over-labeling the architecture side; let the connecting lines do the work.

### Shot 6 — Final card (52–55s)
**Visual:** Everything else fades. The original path returns, centered, fully legible:
`model.layers.0.self_attn.q_proj.weight`
Below it, the card text fades in:
**named tensors — every number knows its place.**
**VO:** (silent, or a soft underscore button)
**Notes:** Hold for ~3s. The path that was opaque at the start is now legible — that's the entire point of the video, expressed visually.

---

## Production notes

### Visual style
Match the *Model Weights* video. Clean geometric animation. Warm-but-cool palette. Generous negative space. Mono-font for code/path elements. Subtle, palette-consistent color-coding for hierarchy levels (e.g., `model` cool blue, `.layers.0` warmer, descending toward the warmest accent at `.weight`).

The decomposition motion in Shot 3 is the visual centerpiece. Each segment should feel like it *unfolds* from its parent — not appear from nowhere. Think origami, not pop-up.

### Motion
Smooth, deliberate. No bounces, no flourishes. Camera is implicit — content moves, frame stays fixed. The one "zoom" beat is into the tensor grid in Shot 4 (a single cell highlight, then back out).

### Audio
- **VO:** Calm, mid-range, slightly warmer than neutral. Same voice (or matched register) as *Model Weights* if possible.
- **Music:** Minimal underscore. Near-silent in Shot 1. Light pulse during the path decomposition (Shot 3) — something that ticks subtly with each segment reveal. Slight swell at Shot 5's correspondence-lines beat. Settle for the final card.
- **SFX:** Soft typing sound on the path in Shot 1. Light snap/click for each segment unfolding in Shot 3. Soft chime when lines connect in Shot 5. Nothing percussive.

### Text on screen
- Path string (Shots 1, 3, 6) — primary text element
- "named tensors" label (Shot 2)
- Hierarchy tree (Shot 3, builds across the shot)
- Shape annotation `[4096, 4096]` (Shot 4)
- Final card text (Shot 6)

All on-screen text supplements VO; nothing is redundant.

---

## Open production decisions

- **Layer count for the stack visual (Shot 3, `.layers.0` beat):** 32 blocks (Llama-7B-ish) is a good visual default. If 32 reads too dense at 9:16, drop to 16 — the point is "a stack" not the exact count.
- **fp16 values in the grid (Shot 4):** Real-looking values (e.g., `0.0234`, `-0.0871`) recommended over placeholders. They don't need to be legible — just plausibly numeric.
- **Architecture tree side of Shot 5:** Keep schematic. A box labeled `Transformer` containing 32 `Layer` boxes, each containing `SelfAttention` and `MLP`, etc. Don't render Python syntax — render *structure*. The lines from named paths to tree nodes are the payoff, not the tree itself.
- **Final card typography:** Match *Model Weights* card style. The line "every number knows its place" should sit slightly apart from "named tensors —" so it lands as its own beat.

---

## VO script (consolidated)

> This is part of an LLM. Not the whole thing — one piece of it. And this is its address.
>
> An LLM file holds hundreds of entries like this. They're called *named tensors*. The names look like paths — let's read one.
>
> *Model* — the root. The whole thing. *Layers* — LLMs are stacks of identical blocks; this is the first. *Self-attention* — inside the block, the attention sub-module. *Q-projection* — inside attention, one specific projection. *Dot weight* — and here, the numbers themselves.
>
> A tensor — just a multi-dimensional array. A grid. Sixteen million values, in this one. ML uses the word loosely.
>
> The names mirror the architecture — the code that runs the model. That's what *named* means. The file isn't a pile of numbers. It's a dictionary — and every entry knows where it goes.

Approximate word count: 140. Target read time: ~50–55s at a relaxed educational pace.

---

## Continuity with *Model Weights*

This video assumes nothing about whether the viewer has seen the prior one — but it pairs cleanly with it. If the two are watched in sequence, the named-tensors callout in *Model Weights* (Shot 3 of that video) is now fully unpacked here. No explicit callback in dialogue or visuals; continuity is stylistic only.
