# Model Weights — Lessons Learned

Companion to `model_weights_brief.md`. Notes from the production session (2026-05-02) — the first all-stills + programmatic-motion piece. Should inform future educational/explainer pieces and any future "no Veo needed" judgment calls.

---

## What worked

- **VO-first workflow, designed-around word timestamps.** Generated the full VO before any visuals, transcribed it with Whisper for word-level timestamps, then built `timeline.md` mapping every visual cue to a specific word landing (e.g. "70 billion parameter" lands at 18.00–18.96 → counter rolls during that window). Every visual had a precise timing target before any plate was generated. **Default this for any VO-driven piece — extract word-level timing once, design to it.**

- **One image plate per shot + ffmpeg overlay stack.** Shot 1: nameplate + file icon plates, badge slid in via drawtext. Shot 2: full split-screen plate, labels animated via drawtext. Shot 3: tensor interior plate, all dynamic elements (tensor name, cell value, bf16 tag, counter, equation) as drawtext layers with timed alpha. Clean separation: image-gen produces the look, ffmpeg produces the motion. **For educational/diagrammatic pieces, this is the template — almost no need for Veo.**

- **Multi-drawtext "rolling counter" via mutually exclusive enable windows.** Each step value (`1,000` → `1,000,000` → `100,000,000` → ... → `70,000,000,000`) is a separate drawtext with `alpha='if(lt(t,start)+gte(t,end),0,1)'`. 100ms steps reads as a rapid count-up. Hacky but works perfectly for short discrete reveals — much simpler than rendering animated number frames.

- **PIL overlays for positional control.** For Shot 5's three constellations needing designed *overlap regions* (the visual argument for superposition), PIL beat nano-banana easily — fixed seed, cluster-anchor scatter, identical positioning across overlay regenerations. Image gen can't reliably hit specific point coordinates; programmatic can.

- **xfade for the pull-back transition.** Shot 4 Phase A (single tensor close-up) → Phase B (stacked pipeline) via plain `xfade=transition=fade` read cleanly as "camera pull-back" without needing any actual scale animation. The visual context (close-up → wide) carries the camera-move metaphor.

- **VO speed=1.2 multiplier.** Already saved to memory — `mood: contemplative` locked `speed_factor: 0.833` (17% slower than natural), and the `speed` parameter multiplies it (0.833 × 1.2 ≈ 1.0). Preserves the mood profile's stability/similarity_boost while fixing the pace.

- **Confirming the "hybrid not Veo" call upfront.** I asked the user before committing, surfaced the trade-off (Veo garbles typography; image-gen is great at exact text). User confirmed, and the entire production followed from that decision. **For any text/diagram-heavy piece, default to asking this up front before generating anything.**

---

## Surprises / things to plan for

- **Constellations defaulted way too subtle.** First pass at PIL constellation overlays used dot diameter 7, glow radius 14, muted desaturated colors. User feedback: "much, much more prominent." Fix was bumping point count +70%, dot diameter to 14, glow radius to 22, adding a white-hot core to each point, and saturating colors toward pure amber/green/violet. **For "lit pixel" effects, default to brighter than feels right — softness reads as ambient texture, not as a deliberate signal.** Save the brighter constellation params as a default starting point for future pieces.

- **Nano Banana Pro returned empty response on a verbose prompt.** First attempt at shot05_field came back with "No image data in response" — likely a content-policy or complexity trip. Simplified prompt (removed specific hex colors, shortened paragraphs) worked on second try. **When NB Pro returns empty, simplify the prompt rather than retrying the same one.**

- **Shot durations don't naturally match VO segments.** Each shot was rendered to its own VO span length, but the VO file has 0.08s–1.02s of silence between sentences. Direct concatenation drifts audio out of sync. Fix: extend each shot to cover "its VO span + silence before the next shot." **Account for inter-VO silences when planning shot durations — add a column to `timeline.md` for "shot duration including tail silence."**

- **`amix duration=first` clipped the final video.** With VO at 50.16s and video at 50.86s, `duration=first` (referring to the VO input) capped output to VO length, losing 0.7s of final-card hold. Fix would be `apad=whole_dur=N` on the VO before mixing, or `duration=longest`. **Default to `apad`-extending the VO before mixing so the video drives output duration, not the audio.**

- **drawtext + Unicode is finicky.** `·` (middle dot, U+00B7) rendered fine in HelveticaNeue. `×` (multiplication, U+00D7) and `≈` (approximation, U+2248) were risky enough I fell back to `x` and `=` for the final equation. **For ASCII-safe equations, just use `x` and `=`. For typographic characters that work: middle dot, em-dash, en-dash, curly quotes — all OK in HelveticaNeue.**

- **Audition voices applied auto mood profile (peaceful, speed 0.85).** Even without specifying mood/tension/energy on the audition calls, the MCP applied defaults that affected pace. The audition was still fair (all four voices got the same profile), but worth knowing the default isn't "raw natural delivery." **For straight voice-character auditions, explicitly disable mood profile or pass `speed=1.18` to compensate.**

- **The `speed` param vs mood `speed_factor` interaction is subtle.** Memory note added — but worth restating: when audio comes back too slow, don't change mood, add `speed: 1.2` to multiply against the locked profile.

---

## Workflow notes — for future explainer-style pieces

- **Hybrid render allocation:**
  - **Image gen (Nano Banana Pro):** typography-heavy plates, structured layouts, illustrations with exact text, file icons, code panels, diagrammatic backgrounds.
  - **PIL / programmatic:** anything needing precise positioning, repeatable layouts, point-clouds, specific overlap regions, custom curves/grids that need to be exact.
  - **ffmpeg drawtext + overlay:** all timing-synced text reveals, slide-ins, fades, labels, equation reveals, counter rolls.
  - **Veo:** *not used here.* For educational/diagrammatic pieces, only consider Veo for organic motion (camera moves with parallax, character work, physical phenomena, anything where AI motion really would be cheaper than animating it programmatically).

- **Workspace + naming worked well.** `data/workspace/model-weights/` with `frames/`, `clips/`, `scratch/`, `final/`, `vo-auditions/`, plus `timeline.md` as the single source of truth for shot timing. Python scripts in `scratch/` (constellation renderer) — kept the production tooling alongside the artifacts.

- **Per-shot review cadence was fast.** `open clips/shotNN_v1.mp4` after each shot let the user respond in seconds. No batched reviews, no surprises in assembly. Compared to Veo-based projects where review-after-generation has minutes of latency, programmatic shots iterate in <5s.

- **Re-rendering all six shots at correct duration was trivial.** Internal animation timing referenced VO-segment-start as local t=0, so just bumping `-t` on each ffmpeg invocation extended the tail-hold without touching expressions. **When designing animation timing, anchor everything to "local t=0 = VO segment start" — makes re-render-at-different-duration painless.**

---

## Cost notes

- **~$10–16 total**, dominated by Claude tokens (~$8–15). API spend was ~$1 (NB Pro ~$0.30 + ElevenLabs TTS ~$0.50 + ElevenLabs Music ~$0.20 + Whisper local).
- **Order-of-magnitude cheaper than Veo-based pieces** ($17–30 in archive). For diagrammatic/explainer content, default to this pipeline and budget $1–3 in APIs + Claude tokens on top.
- **The biggest cost lever is what you ask Claude to do.** Long sessions with lots of image-read + complex ffmpeg back-and-forth dominate. Where the production work itself is cheap, time-to-converge with the user is the line item.

---

## Genre-level — for educational explainers

- **Brief format that worked.** This brief was unusually rich: shot-by-shot breakdown with specific visual descriptions, exact text to render, accuracy non-negotiables called out separately, production notes on style/audio/text, and a consolidated VO script. Made decision-points few and cheap — almost everything was already specified. **For future explainer pieces, ask the writer/concept-owner to deliver in this format if possible.**

- **Accuracy non-negotiables as a separate section was load-bearing.** "bf16 not fp16," "concepts in distributed patterns NOT single weights," "equation represents one step, not the whole network" — calling these out explicitly meant they could be verified against every visual and VO line. **Standardize "Accuracy non-negotiables" as a brief section for any educational piece.**

- **VO timing-driven design > visual-design-then-fit-VO.** Generating VO first and designing visuals to its word landings produced clean sync everywhere. The alternative (design visuals to brief targets, then fit VO to them) would have required either re-cutting visuals or stretching/compressing VO. **Lock VO first for any VO-driven piece.**

- **The "marketing nameplate dissolves into a plain file icon" hook.** Worked exactly as the brief promised — the conceptual move (de-mystifying "frontier model" by showing the file) lands in 4 seconds and sets the whole tone. Brief authors knew what they were doing. **When a brief has a clear rhetorical opener, lean into it visually rather than ornamenting it.**

- **Soft music ducked to ~12% with 6s fade-in is the right level for educational VO.** Fades in unobtrusively while the hook lands silently, then sits underneath narration without competing. Use this as a default music level for explainer-style pieces.

- **The "constellation of distributed patterns" beat was the most conceptually load-bearing shot and the riskiest visually.** First pass too subtle — viewer couldn't read "many distributed points lighting up." Brighter, denser, more saturated overlays made it land. **For abstract concept reveals, err visually toward "this is happening, you can clearly see it" rather than "this is happening if you look carefully."**
