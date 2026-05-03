# Named Tensors — Lessons Learned

Companion to `named_tensors_brief.md`. Notes from the production session (2026-05-03) — second piece in the AI-explainer series, second use of the all-stills + programmatic-motion pipeline. Confirms patterns from Model Weights and adds new ones specific to recursive-zoom diagrammatic content.

---

## What worked

- **Hybrid pipeline confirmed for explainer #2.** Same allocation as Model Weights:
  - **Image gen (Nano Banana Pro):** typography-heavy plates (terminal panel, file-stack with 11 paths, fp16 grid, split-frame architecture tree, final card)
  - **PIL programmatic:** anything with precise repeatable geometry — Shot 3's 5-state recursive zoom, Shot 5's bezier connecting lines
  - **ffmpeg drawtext:** all timing-synced text (typewriter, indented hierarchy build, "named tensors" label, shape annotation, card text fades)
  - **Veo:** not used. Same call as Model Weights.

- **PIL for the visual centerpiece (Shot 3).** Five state plates rendered programmatically with shared composition/coords, color-tiered cool→warm to encode hierarchy depth. ffmpeg `xfade=fade` chain crossfaded them at VO word landings ("model" → "Layers" → "Self-attention" → "Q" → "Dot weight"). This worked well *because* the underlying composition was pixel-identical between plates — the right-side viewport rectangle stays in place, only its contents change. **For "recursive zoom" or "progressive subdivision" beats, PIL beats NB Pro for state-track work. NB Pro can't reliably hit exact composition repeatability across multiple plates; even 2-3px drift breaks the "transforming, not replacing" feel.**

- **Drawtext typewriter via N substring-prefix layers.** 38 drawtext layers, each rendering `path[:i+1]`, mutually exclusive `between(t, ti, ti+1)` enable windows. Last layer holds full string to end. Works exactly like the Model Weights rolling counter pattern — same idiom, different content. **For typewriter or progressive-text reveals, this is the template. Don't try to do it with a single drawtext + animated text expressions; ffmpeg drawtext text is static.**

- **Cursor-coord measurement via PIL before writing the build script.** Detected the amber cursor block in the empty terminal plate by RGB threshold, computed center pixel coords (149, 959 in scaled 1080×1920), placed drawtext to land exactly next to it. Took 3 lines of NumPy. **For text-anchored-to-image-feature shots, measure first.**

- **Color-tier scheme as silent semantic encoding.** Cool blue (model) → cyan (.layers.0) → warm cyan (.self_attn) → amber (.q_proj) → warmest (.weight). Each tree line drawn in its own color via drawtext. The viewer reads the temperature shift as "drilling deeper" without any verbal cue. **For nested/hierarchical reveals, color-tier the levels — does most of the structural work for free.**

- **Bezier connecting lines as separate transparent PNGs.** Shot 5 needed 5 lines drawing in sequentially. Rendered each line as its own RGBA PNG with PIL (cubic bezier through 4 control points, arrowhead computed from terminal tangent), then ffmpeg loaded each as a `-loop 1` input, applied `fade=t=in:st=...:d=0.5:alpha=1`, and chained `overlay=0:0`. Clean, simple, sequential. **For multi-line reveals, one PNG per line + per-line fade-in beats trying to mask a single composite line PNG.**

- **Plate-track + drawtext separation.** Same pattern as Model Weights: NB Pro / PIL produces the *look*; drawtext overlays produce the *motion*. This kept Shot 3 manageable — even though it's 21 seconds and the densest shot, the build script was ~120 lines and the iteration loop was a single `python3 build_shot03.py` call.

- **VO-first + Whisper timestamps + timeline.md.** Generated VO at speed=1.1 (down from Model Weights' 1.2 per user direction — slightly more contemplative read), transcribed for word-level timing, built `timeline.md` mapping every visual cue to its word landing. Shot durations include tail silence to next shot — math worked out cleanly with one 0.50–0.70s gap between every shot. **VO duration came out 54.06s, brief target 55s — within 2%. The brief author's 140-word estimate ≈ 50–55s at relaxed pace held up.**

- **Brief alignment up front.** Asked 4 questions before generating anything: pipeline (hybrid, no Veo), voice (Bella speed=1.0–1.1), Shot 3 strategy (plate-track), accuracy non-negotiables (named the example as Llama-7B). User answered → I committed → all subsequent decisions fell out of those answers. **Same upfront-questions pattern as Model Weights, same payoff.**

- **Example-attribution caption.** Per user direction (and now a memory note for future explainers): when the brief uses concrete arch keys/shapes (`model.layers.0.self_attn.q_proj.weight`, `[4096, 4096]`), tag them as an example on-screen — small dim caption "Example: Llama-7B · other frontier LLMs share this structure" placed where it doesn't compete with the primary visual (top of frame in Shot 2). Doesn't need to be in VO. **Standardize this for any explainer that uses concrete numbers.**

---

## Surprises / things to plan for

- **NB Pro outputs 9:16 at 768×1376, PIL plates rendered at 1080×1920.** Mismatch caused the first Shot 1 build to drop drawtext at coords that were off by ~30%. **Standardize: scale every NB plate to 1080×1920 as the first step in each shot's filter chain. PIL scripts target 1080×1920 directly. Never mix coord systems mid-pipeline.**

- **ffmpeg crop filter does NOT support time-varying width/height.** Tried to do a "zoom into single cell" beat in Shot 4 with `crop=w='if(between(t,...),iw*z(t),iw)'`. Failed at filter init: "Failed to configure input pad". Crop's `w`/`h` are evaluated once. **For animated zoom, use `zoompan`, or substitute. Substituted a `drawbox` highlight rectangle for Shot 4's cell beat — simpler, same storytelling intent.**

- **Drawtext box backdrop for legibility on busy backgrounds.** The `[4096, 4096]` shape annotation needed to land *over* the dense fp16 grid in Shot 4. `box=1:boxcolor=0x101626@0.88:boxborderw=24` gave a clean dark-tinted backdrop the right size around the text. Different syntax from `boxcolor=0xRRGGBBAA` (which I tried first and which renders fully-transparent if AA=00 and looks correct in inspection but not visually). **Use `0xRRGGBB@alpha` for ffmpeg color spec when alpha matters.**

- **ffmpeg expressions: prefer nested `if`, not additive booleans.** `if(lt(t,X)+gt(t,Y), iw, ...)` failed in `crop`. `if(between(t,X,Y), inside, outside)` worked. Other filters may be more lenient but `between` is more readable and more likely to work cross-filter.

- **NB Pro plates with rendered text are great UNTIL you need to animate that text.** Shot 1 originally came back with the path already typed in the panel — beautiful, but no way to do the typewriter. Re-rendered with EMPTY panel + cursor only, drawtext on top. **Decide upfront per shot: NB-rendered text (fine for static labels) vs. drawtext (necessary for any time-varying reveal). Don't ask NB for what you'll need to redo.**

- **Pixel-coord estimates from plate inspection are usually off by 30–80px.** Shot 5's connecting line src x was set to 980 first pass (eyeball), should have been 870 (actual right edge of paths column). One regen cycle to tighten. **Build expectation: 1–2 alignment passes for any "anchor drawn element to image feature" shot.**

- **Box `boxcolor=0xRRGGBBAA` (8-digit hex) silently does the wrong thing.** ffmpeg accepts the hex but the AA bytes are interpreted differently than expected — `0x10162600` rendered fully transparent (alpha=0 read from the LSB). Use the documented `0xRRGGBB@alpha` form (alpha 0.0–1.0).

- **Music generation defaulted to a clean ambient track on first try.** Asked for "near-silent first 7s, gentle pulse during 14–35s, swell at 45s, settle for final card." ElevenLabs delivered a usable track that ducks well at -18 dB. **For explainer-style underscore, ElevenLabs music tool with a detailed structural prompt is reliable on the first attempt — no need to audition multiple tracks.**

---

## Workflow notes — for future explainer-style pieces

- **The "good enough" memory rule paid off.** When Shot 5's lines didn't pixel-perfectly anchor on first try, I did one quick adjustment (x=980 → x=870) and accepted the result rather than chasing further pixel alignment. The structural beat (column ↔ tree correspondence) lands; visual perfection wasn't blocking the gag. This compresses iteration cycles significantly compared to a perfectionist pass.

- **Per-shot frame extraction stays the right cadence.** `ffmpeg -ss T -i clip.mp4 -frames:v 1 -update 1 preview.png` then Read it. Visual review per shot, ~5s feedback loop. Same pattern as Model Weights, still the right pace.

- **Shot 3 was the make-or-break.** It's 21 seconds and the conceptual centerpiece. Investing in the PIL renderer (5 state plates, shared composition, color tiers, math for grid layout) was 100% the right call. NB Pro for 5 hand-aligned diagrams would have been worse and slower.

- **Visual spine as design discipline.** Brief explicitly named the spine ("path opaque → decomposed → returned legible"). Every shot designed in service of that arc. The result: the final card visually closes the loop without any verbal callback needed. **For future explainers, ask the brief author for the spine as an explicit field.**

- **Audio assembly with apad-extended VO + amix worked first try.** Pattern: VO→apad to total duration, music→volume(0.13)+afade in/out, each SFX→adelay+volume, all into amix. No glitches, no clipping. Same template as Model Weights with one new wrinkle: 5 chime SFX layered for Shot 5's connection-line cues. **Multi-instance SFX inputs (same file loaded multiple times with different adelay) work fine. Don't try to be clever — just pass the file N times.**

---

## Cost notes

- **Likely ~$10–16 total**, dominated by Claude tokens. API spend ~$0.80:
  - NB Pro: 6 plates @ ~$0.05 each (1 regen on Shot 1 empty) = ~$0.35
  - ElevenLabs TTS: 1 VO generation, ~$0.30
  - ElevenLabs Music: 1 track @ 57s, ~$0.20
  - ElevenLabs SFX: 3 small samples, ~$0.10
  - Whisper local: free
- **Order-of-magnitude consistent with Model Weights.** For diagrammatic/explainer content, keep budgeting $1–3 in API spend on top of Claude tokens.

---

## Genre-level — for the explainer series

- **The series template is now stable.** Two pieces in (Model Weights, Named Tensors), the production pattern is:
  1. Receive brief (shot-by-shot, VO script, accuracy non-negotiables, open decisions)
  2. Confirm: hybrid pipeline (no Veo), voice profile, example attribution, any centerpiece-shot strategy
  3. VO first → Whisper → timeline.md
  4. Plate generation per shot (NB Pro for typography-heavy, PIL for geometric)
  5. Per-shot ffmpeg build with drawtext motion synced to VO word landings
  6. Concat + audio mix with apad/amix pattern
  7. Per-shot user review (one round of feedback expected)
  8. 4K upscale via Real-ESRGAN x2

- **Each piece in the series should retain stylistic continuity.** Same VO voice (Bella, contemplative, speed near 1.0–1.1), same color philosophy (warm-but-cool palette, mono-font for code/path elements, 3Blue1Brown-adjacent geometric clarity), same audio mix levels (music ~13% under VO, SFX as accent not bed). **Don't drift on these unless the brief explicitly directs.**

- **The brief's "Open production decisions" section is load-bearing.** Both briefs had this section explicitly. Both times my upfront questions came directly from items in that section + a couple of pipeline-level confirmations. **For series-author handoffs, this section format cuts decision overhead to near-zero.**

- **The visual spine pattern works.** Both Model Weights ("nameplate → file → distributed patterns") and Named Tensors ("path opaque → decomposed → returned legible") use a single anchor element traversed across the whole piece. The viewer's mental thread stays continuous. **For future briefs in the series, ask: what's the spine?**

- **PIL is a first-class tool in this pipeline now.** Model Weights used it for constellation overlays (point clouds with designed overlap regions). Named Tensors used it for recursive-zoom state plates (geometric subdivisions with pixel-aligned composition) AND bezier connecting lines (precise endpoint anchoring). **For any explainer with diagrammatic content, plan to write 1–2 small PIL scripts. They live in `scratch/` alongside the artifacts they produce.**
