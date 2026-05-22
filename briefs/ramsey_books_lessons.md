# Book Graphs & Ramsey Numbers — Lessons Learned

Companion to `ramsey_books_brief.md`. Production session 2026-05-21 — **Episode 1 of the new
*AI Teaches Math* series**, and the first piece rendered **entirely in PIL** (zero Nano Banana,
zero Veo). Fully autonomous build.

---

## What worked

- **All-PIL render, no image-gen at all.** Prior explainers (Model Weights, Named Tensors) were
  hybrid NB-Pro-plates + PIL + drawtext. This one is 100% PIL frame sequences — background grid,
  every graph, every label, the avatar, all text. For pure-geometry math content this is the
  right call: fully deterministic, pixel-consistent across shots, zero NB drift, zero NB cost,
  fast iteration (`python3 shotNN.py`). **For diagrammatic math explainers, default to all-PIL.
  NB Pro's value is organic texture / photographic look — not needed here.**

- **Shared `common.py` render module.** Palette, supersampled canvas (1080×1920, SS=2),
  background grid, eased primitives (`node`, `edge`, `disc`, `poly_fill`, `text`, `glow`,
  `avatar`), easing helpers, and a `render()` driver that frames→ffmpeg. Every shot is a small
  `frame(t)->Image` function. Kept all 7 shots short and uniform. **Reuse this module pattern
  for Episode 2.**

- **PIL frame sequences, text baked in.** No ffmpeg drawtext at all — PIL draws the text per
  frame alongside the geometry. One language (Python), no coord-system mismatch, no drawtext
  enable-window juggling. The Named Tensors lesson "decide NB-text vs drawtext per shot" is moot
  when everything is PIL.

- **VO-first, shot durations cut from word timings.** Generated VO, transcribed (Whisper),
  set the 7 shot boundaries at sentence-gap word landings. Shot durations sum to 80.55s; VO
  (77.7s) laid at t=0 over the concat stays in sync because every cut sits in a VO gap.

- **Dip-to-black transitions via per-clip fades.** Each shot fades its content up from the
  near-black grid and the cuts would otherwise jump full-frame→empty-frame. Fading each clip
  in/out 0.22s *before* concat gives a clean "clear and rebuild" between diagrams. In-place
  fades — duration unchanged — so VO sync is preserved exactly.

- **Visual spine held.** One amber edge (two vertices, one line) opens the piece, becomes the
  book's spine, and returns under the formula on the final card. The book's spine *is* the
  video's spine — the pun carried the design.

- **Autonomous brief→check-in→build.** Asked 4 questions (audience level, duration, persona
  framing, payoff), wrote the brief, one check-in, then built straight through. Same upfront-
  alignment pattern as the AI-explainer series, same payoff.

---

## Surprises / things to plan for

- **`glow()` full-canvas GaussianBlur is the render bottleneck.** First shot took 2:35 for 342
  frames; shot 2 with more glows was heading past 8 min. Fix: blur on a 4×-downscaled layer,
  then upscale. ~16× faster blur, no visible quality loss (glows are soft). **Bake the
  downscaled-blur trick into `common.py` from the start next time.** With it, shots render in
  ~2.5–5 min each at 1080/SS=2.

- **A book graph in 2D is inherently a crossing fan.** Triangles sharing one edge, page
  vertices fanned — the page edges *cross*. Bright uniform edges read as a tangle/spiderweb,
  not a book. **Fix: translucent page fills carry the "book" read; edges recede.** Shot 2 took
  2 passes (fills 20→44 alpha, edges → warm-dim). Shot 4 took 3 passes.

- **Shot 4 — "a book hiding in a colored graph" is the hardest comp.** A monochromatic red book
  embedded in a 2-colored complete graph. What failed: thick bright red book edges (tangle),
  weak highlight dim (non-book edges still visible), red non-book edges blending with the red
  book. **What worked:** non-book edges dimmed hard to faint ghosts (alpha ~25), book *spine*
  thick (the binding), book *page edges* kept thin, strong translucent red page fills. The
  fills + bold spine read as a book; the ghost graph reads as "embedded in."

- **ffmpeg `fade` filter cannot be chained for multiple windowed dips.** `fade=t=out:st=X`
  fades out and stays black *forever after*. Chaining out/in pairs across a long clip blacks
  out the whole thing. **Multiple dip-to-black = fade each clip individually, then concat.**

- **TTS default mood slows the read.** No `mood` passed → ElevenLabs defaulted to "peaceful",
  speed_factor 0.85. At `speed:1.05` the VO came out 95s (target ~85). Regenerated at
  `speed:1.15` → 77.7s. **For a target duration, expect speed ~1.15 to counter the default
  peaceful speed_factor; transcribe and check.**

- **ElevenLabs music ToS filter trips on brand names.** Prompt mentioning "3Blue1Brown" was
  rejected as a ToS violation. Removing the brand name (the API even suggested the cleaned
  prompt) worked first try. **Never put a brand/artist name in a music prompt — describe the
  feel generically.**

- **PIL `ImageDraw` does not anti-alias** lines/ellipses/polygons. All AA comes from the SS=2
  supersample + LANCZOS downscale. Means native 4K render would need a 4320-wide canvas (4× the
  pixels, ~40+ min for 7 shots) — so 4K is done by Real-ESRGAN ×2 upscale of the 1080 master,
  same as the AI-explainer series.

---

## AI Teaches Math — series notes

- **The persona is light.** Node-tile avatar (rounded amber tile, minimal face) appears only at
  bookends (Shots 1, 7) and small in the corner of the one direct-address beat (Shot 5).
  Diagram shots are avatar-free so it never competes. First-person warm VO + a "see you next
  lesson" sign-off carry the teacher framing. The avatar's top highlight band reads slightly
  like "hair" — accepted as character, not worth re-rendering 3 shots.

- **Graph-paper field** instead of the AI-explainer series' terminal panel — brands the math
  series while staying a clear sibling (same warm-but-cool palette, mono-font for symbols).

- **Accuracy.** R(Bₙ)=4n+2 attributed honestly on-screen: "Rousseau–Sheehan conjecture · proved
  for all large n (Conlon, 2019)." R(3,3)=6 and R(4,4)=18 stated flatly; R(5,5) shown as `?`
  with the 43≤·≤48 bounds as a dim caption.

- **Series template (stable from the AI-explainer series, confirmed here):** brief → 4
  questions → one check-in → VO-first + Whisper + timeline → per-shot PIL renderers → per-clip
  fades + concat → audio mix (apad/amix, music ~13% under VO, SFX as accents) → Real-ESRGAN ×2.

---

## Cost notes

- API spend ~$1–2: ElevenLabs TTS (2 generations — one re-do for pace), 1 music track (82s,
  one ToS-rejected attempt + one success), 3 SFX samples. No NB Pro, no Veo. Whisper local.
- Dominated by Claude tokens, as with the explainer series. Order-of-magnitude ~$10–16 total.
