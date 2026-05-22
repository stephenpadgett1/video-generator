# Book Graphs & Ramsey Numbers — Educational Video Brief

*AI Teaches Math — Episode 1*

## Overview

A ~85–92s vertical (9:16) educational video explaining the **book Ramsey number**: how large a 2-colored complete graph must be before a monochromatic *book graph* B_n becomes unavoidable — and the surprise that the answer collapses to a clean linear formula, **R(B_n) = 4n + 2**.

This launches a new series, **AI Teaches Math**, a sibling to the AI-explainer series (*Model Weights*, *Named Tensors*). Same production pipeline and craft standards; new subject domain and a new framing device (see Persona, below).

Audience: a viewer who **already knows basic graph theory** — vertices, edges, complete graphs, edge-colorings are assumed, not taught. The runtime is spent on Ramsey theory and the book result, not primitives.

- **Duration:** ~85–92s
- **Aspect ratio:** 9:16 vertical
- **Voice:** single VO throughout — the AI-teacher persona (see below)
- **Visual style:** continuous with the AI-explainer series — warm-but-cool palette, mono-font for symbolic elements, 3Blue1Brown-adjacent geometric clarity, generous negative space. New series-specific touch: a faint graph-paper / grid field instead of the terminal-panel look.
- **Spine:** the **book's spine edge**. The video opens on a single edge (two vertices, one line); pages accrue into a book graph; that same edge anchors the Ramsey question; the final card returns to the edge with the formula resting on it. The book's spine *is* the video's spine — the pun is the design.

## The AI-teacher persona (new series element)

"AI Teaches Math" is framed as an explicit teacher. The persona is realized lightly, so it never competes with the diagrams:

- **Bookend avatar.** A small, friendly geometric avatar — a rounded node-tile with a minimal single-mark "face," palette-consistent — appears in the Shot 1 series card and the Shot 7 sign-off. It does *not* sit on screen during the diagram shots.
- **Corner presence (optional).** During the two direct-address beats (Shots 5 and 7) the avatar may return small in a corner. Diagram shots (2, 3, 4, 6) are avatar-free.
- **First-person teaching VO.** Bella, warm and direct, speed ~1.05. The register shifts from the prior series' neutral narration to a teacher speaking *to you* ("I want to show you…", "Expect the worst…", "That's the beauty.").
- **Series sign-off.** "I'm AI Teaches Math. See you next lesson." Establishes the recurring outro.

> Persona naming, avatar look, and whether the avatar appears in corners during Shots 5/7 are listed under Open production decisions.

## Learning goals

By the end, a viewer should walk away with:

1. A **book graph** B_n is n triangles sharing one common edge — n "pages" bound to a "spine."
2. The **Ramsey number** of a graph G, R(G), is the smallest N such that *every* red/blue edge-coloring of K_N contains a monochromatic copy of G.
3. General Ramsey numbers are famously intractable (R(5,5) is still unknown).
4. Yet the **book** Ramsey number has an exact, simple closed form: **R(B_n) = 4n + 2** — linear. Each added page costs exactly four more vertices.

## Visual spine

The single edge — two vertices, one line — is the central object. Opaque and plain at the start; it grows pages into B_n; it remains the literal spine of every book drawn during the Ramsey shots; the final card returns to it with `R(B_n) = 4n+2` set above it. Every shot is built in service of that one edge being carried across the whole piece.

---

## Shot-by-shot

### Shot 1 — Series open + hook (0–11s)
**Visual:** "AI Teaches Math" series card on the graph-paper field, AI-teacher avatar present. Card recedes; a single edge draws itself — two vertices, one connecting line — centered, plain, faintly glowing.
**VO:** "Hi — I'm your teacher for the next ninety seconds, and I want to show you something genuinely beautiful. It begins with the simplest object in graph theory: a single edge. Two vertices, one line."
**Notes:** Music near-silent. The edge that draws here is the spine — it must land at the exact position it will hold for the rest of the video.

### Shot 2 — Build the book graph (11–27s)
**Visual:** A triangle forms on the edge (one new vertex connected to both endpoints). Then another page fans in, then another — each a new vertex completing a triangle on the *same* edge. Pages fan like a physical book opening. Labels animate in: **spine** (the shared edge), **page** (one triangle). A small counter ticks B₁ → B₂ → B₃ → … → Bₙ.
**VO:** "Build a triangle on that edge. Now another, sharing the same edge — and another. Each triangle is a page; the shared edge is the spine. n triangles on one spine: mathematicians call this a book graph, B-n."
**Notes:** This is a PIL set-piece — exact, repeatable vertex geometry. The fan layout reads "book" better than a symmetric flower; keep all page vertices on one side of the spine. End on a clean Bₙ with ~5 pages drawn and an "…" implying general n.

### Shot 3 — Ramsey setup: the 2-coloring (27–44s)
**Visual:** The book recedes to a corner ghost. A complete graph K₆ materializes; every edge colors red or blue. The party-problem nod: 6 vertices = 6 people; a monochromatic triangle is highlighted as unavoidable. On-screen: `R(3,3) = 6`.
**VO:** "Now, Ramsey theory. Color every edge of a complete graph red or blue, however you like. Ramsey's theorem says some patterns become unavoidable. Among any six people, you can't escape three mutual friends — or three mutual strangers."
**Notes:** Use a fixed, hand-checked coloring of K₆ that demonstrably contains a monochromatic triangle (every 2-coloring of K₆ does — pick one and highlight the triangle). PIL for the graph + coloring; drawtext for `R(3,3)=6`.

### Shot 4 — The book Ramsey question (44–58s)
**Visual:** Reframe. A larger 2-colored complete graph. The question is no longer "monochromatic triangle" but "monochromatic **book**." A red copy of B_n is found and lit inside the colored graph — its spine and pages traced in pure red. On-screen, the definition assembles: **R(Bₙ) = smallest N such that every 2-coloring of K_N contains a monochromatic Bₙ.**
**VO:** "So ask it of books. How large must the graph be, so that every 2-coloring is forced to contain a whole book — all n pages — in a single color? That threshold is the book's Ramsey number: R(B-n)."
**Notes:** The lit red book must visually echo Shot 2's book exactly — same spine-and-pages shape — so the viewer recognizes "that's a B_n, in red, hiding in here." PIL for the highlight traced over the colored graph.

### Shot 5 — Why you'd expect it to be hard (58–69s)
**Visual:** Direct-address beat — avatar may return small in corner. A short "Ramsey is monstrous" panel: a row of known/unknown values — `R(3,3)=6`, `R(4,4)=18`, `R(5,5)=?`. The `?` pulses; small dim caption notes the known bounds (43 ≤ R(5,5) ≤ 48).
**VO:** "Expect the worst. General Ramsey numbers are monstrous — we still don't know R(5,5). The book ought to be just as wild."
**Notes:** Keep this fast — it exists to set up the contrast. Don't dwell. The Erdős "aliens demanding R(5,5)" anecdote is *optional* flavor if timing allows; default is to cut it for pace.

### Shot 6 — The payoff: 4n+2 (69–81s)
**Visual:** The formula resolves, large and centered: **R(Bₙ) = 4n + 2**. Beside/below it, a small axis plots the points (n, 4n+2) for n = 1,2,3,… — they fall on a perfectly straight line, which draws itself. The straightness *is* the surprise. Dim example-attribution caption (see Open decisions) names the result.
**VO:** "It isn't. The answer is astonishingly clean: R(B-n) equals four n plus two — a perfect straight line. Conjectured by Rousseau and Sheehan, proved by Conlon for every large book. Each new page costs exactly four more vertices."
**Notes:** PIL for the plotted line; drawtext for the formula reveal synced to "four n plus two." The line drawing should complete on "perfect straight line."

### Shot 7 — Final card (81–~88s)
**Visual:** Everything clears. The original spine edge returns, centered, with `R(Bₙ) = 4n + 2` set above it. AI-teacher avatar present. Series mark: **AI Teaches Math — Episode 1**.
**VO:** "An exact, infinite answer — hiding inside one of the hardest problems in mathematics. That's the beauty. I'm AI Teaches Math. See you next lesson."
**Notes:** Hold ~3s. The edge that was plain in Shot 1 now carries a theorem — the spine closes the loop visually.

---

## Production notes

### Pipeline
Hybrid all-stills + programmatic motion — **no Veo**, same as the AI-explainer series.
- **Nano Banana Pro:** series title card, AI-teacher avatar, final card styling, graph-paper field texture. Typography-light — NB does the *look*, not time-varying text.
- **PIL (programmatic):** carries the bulk of this piece. Every graph is vertices + edges — exactly PIL's strength. Book-graph build (Shot 2), K₆ + coloring (Shot 3), the colored graph + lit red book (Shot 4), the (n, 4n+2) plotted line (Shot 6). Shared coordinate system across shots so the spine edge holds position.
- **ffmpeg drawtext:** all VO-synced text — series card text, spine/page labels, the Bₙ counter, `R(3,3)=6`, the R(Bₙ) definition build, the `4n+2` formula reveal, captions, final card.

### Accuracy non-negotiables
- **R(B_n) = 4n + 2** is presented as the headline result. Attribution must be honest: Rousseau & Sheehan (1978) **conjectured** it; it is known exactly when 4n+1 is a prime power (Paley-graph construction); **Conlon (2019)** proved it for all sufficiently large n. The on-screen caption must not claim it is proven for *all* n.
- **R(3,3) = 6** and **R(4,4) = 18** are exact and safe to state flatly.
- **R(5,5)** is unknown; bounds 43 ≤ R(5,5) ≤ 48. On-screen, a simple `?` is fine; the bound is a dim caption.
- The book graph B_n has n+2 vertices and 2n+1 edges. Any drawn B_n must be a correct book (all pages share the one spine edge).

### Motion
Smooth, deliberate, no bounces. Frame is fixed; content moves. The one "fan" flourish is the pages opening in Shot 2 — it should feel like a book opening, not elements popping in.

### Audio
- **VO:** Bella, speed ~1.05, warm first-person teaching register.
- **Music:** minimal ElevenLabs ambient underscore — near-silent under Shot 1, light pulse during the book build (Shot 2), a held tension flat during Shot 5, a small resolving swell as the formula lands (Shot 6), settle for the final card. ~13% under VO.
- **SFX:** soft pen/draw stroke as the edge and pages draw; a light page-turn whisper per page in Shot 2; a soft chime when the formula resolves in Shot 6. Nothing percussive.

### Example-attribution caption
Per series convention (from *Named Tensors*): when concrete results are shown, tag them on-screen, dim, where they don't compete with the primary visual. Shot 6 caption, small and dim: **"R(Bₙ) = 4n+2 — Rousseau–Sheehan conjecture; proved for all large n (Conlon, 2019)."**

---

## Open production decisions

- **Shot count:** 7 shots (vs. the series' usual 6) — the extra runtime (~88s vs ~55s) and the Ramsey-then-book two-step justify it. Confirm 7 is acceptable.
- **AI-teacher persona naming:** the avatar/persona can stay unnamed ("your teacher" / "AI Teaches Math") or get a short name. Default: unnamed — the series banner *is* the identity.
- **Avatar look:** proposed = rounded node-tile with a minimal single-mark face, palette-consistent. Alternative considered and set aside: representing the teacher *as a vertex* in the graph — elegant but risks confusing the math. Default: the node-tile avatar, bookends only.
- **Avatar in Shots 5/7 corners:** default = yes, small, during the two direct-address beats only. Diagram shots stay avatar-free.
- **Graph-paper field:** new series-specific background vs. the prior series' dark terminal panel. Default: faint grid, same warm-but-cool palette — distinct enough to brand the math series, close enough to read as a sibling.
- **Erdős "aliens" anecdote (Shot 5):** default cut for pace; available as flavor if the shot underruns.

---

## VO script (consolidated)

> Hi — I'm your teacher for the next ninety seconds, and I want to show you something genuinely beautiful. It begins with the simplest object in graph theory: a single edge. Two vertices, one line.
>
> Build a triangle on that edge. Now another, sharing the same edge — and another. Each triangle is a page; the shared edge is the spine. n triangles on one spine: mathematicians call this a book graph, B-n.
>
> Now, Ramsey theory. Color every edge of a complete graph red or blue, however you like. Ramsey's theorem says some patterns become unavoidable. Among any six people, you can't escape three mutual friends — or three mutual strangers.
>
> So ask it of books. How large must the graph be, so that every 2-coloring is forced to contain a whole book — all n pages — in a single color? That threshold is the book's Ramsey number: R(B-n).
>
> Expect the worst. General Ramsey numbers are monstrous — we still don't know R(5,5). The book ought to be just as wild.
>
> It isn't. The answer is astonishingly clean: R(B-n) equals four n plus two — a perfect straight line. Conjectured by Rousseau and Sheehan, proved by Conlon for every large book. Each new page costs exactly four more vertices.
>
> An exact, infinite answer — hiding inside one of the hardest problems in mathematics. That's the beauty. I'm AI Teaches Math. See you next lesson.

Approximate word count: ~240. Target read time: ~85–92s at a relaxed teaching pace (Bella, speed ~1.05).

---

## Continuity with the AI-explainer series

*AI Teaches Math* is a sibling series, not a sequel. Shared: pipeline, palette philosophy, mono-font for symbols, audio mix levels, the visual-spine design discipline, the example-attribution caption convention. New: subject domain, the explicit AI-teacher persona, the graph-paper field, first-person VO register. The two series should feel like the same studio, different shows.
