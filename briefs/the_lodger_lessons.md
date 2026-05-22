# The Lodger — Lessons Learned

Companion to `the_lodger_brief.md`. Production session 2026-05-21 — an **expressive
short** (not an explainer), and the first piece where the user handed Claude full
creative latitude on *concept*: "what's pulling at you?" Fully autonomous build,
Veo 3.1 Fast, book-ended.

---

## What worked

- **Concept handoff.** The user set only format constraints (9:16, 30–60s, Veo Fast)
  and asked what concept pulled. Pitching one idea with conviction — plus the named
  alternative I set aside and *why* — landed better than a menu. A houseplant that
  leans toward light and turns back when you rotate it: small, tender, and every shot
  inside Veo's strengths. **For open creative briefs, commit to one and defend it;
  don't offer a buffet.**

- **Veo Fast, book-ended, zero rerolls.** All 7 shots generated usably on the first
  submission. Book-ending (nano poster A → poster B, Veo interpolates) held the plant,
  pot, window, and lean state across the clip. The carry shot — plant lifted into
  golden doorway backlight — was the standout, and it came free from a good poster pair.

- **Constrain the brief to the generator's strengths.** Interiors, raking light,
  weather-of-the-day, a single hand, a plant. No faces, no VFX, no physics, no
  transformations. Nothing in the film asked Veo to do a thing it reliably fails.
  This is *why* there were no rerolls — the failure modes were designed out at the
  brief stage.

- **The reveal-on-the-cut.** Two state changes happen *off-screen, between shots*: the
  plant leaning (Shot 4 upright → Shot 5 leaning) and the turn-back (Shot 6 rotated
  away → Shot 7 leaning toward again). The viewer does the arithmetic on the cut. No
  shot has to *animate* the change — each just has to hold a clear endpoint state.

- **Dip-to-black transitions as time.** Per-clip 0.3s fades to black between shots.
  For a film explicitly about time passing, the dips *are* the passage — and the
  Shot 6→7 dip reads as the literal overnight. Same per-clip-fade technique as the
  Ramsey piece (fade each clip before concat — chained `fade` filters black the whole
  stream).

- **Veo `generateAudio: true` as the ambient bed.** Each shot prompt carried explicit
  ambience cues (shop hum, street, terracotta knock, room tone, birds). The per-clip
  generated tracks became the sound design; per-clip audio fades smoothed the ambience
  changes at cuts. Music sat under at ~17%, the one VO line on top.

---

## Surprises / things to plan for

- **nano-banana tool path.** The skill SKILL.md shows `tools/nano-banana.cjs` but the
  examples and the skill's own base dir implied `.claude/skills/nano-banana/tools/`.
  The real path is **`tools/nano-banana.cjs`** at project root. Check before scripting.

- **nano-banana 429 rate-limit on rapid batches.** Generating 13 poster frames back-
  to-back tripped a 429 after the 3rd call. **Space nano-banana calls (~10s apart) and
  wrap in a retry-with-backoff** when generating many frames in one pass.

- **The lean had to be exaggerated to read.** First pass of the Shot 5 "lean" poster
  came back nearly upright — nano-banana under-commits to a described pose change.
  Regenerating with "clearly, unmistakably, a pronounced obvious curve, dramatic"
  produced a readable lean. Shot 6A needed the same fix so the pot-rotation gag had a
  lean to flip. **For any pose/gesture poster, overshoot the description** — same as
  book-end principle 3 (endpoint distinctness), applied at the frame-prompt stage.

- **Veo output lands in GCS, not locally.** `check_veo_status` returns a `gs://` URI.
  Download with `node tools/gcp/dl.cjs <gsUri> <local>` (infra service account). Not
  obvious from the submit/poll tools alone.

- **Veo Fast is fast.** All 7 jobs (48 Veo-seconds total) were `done` within ~5 minutes
  of submission — submit all in parallel, then poll once.

- **The rotation gag came through softer than designed.** Shot 6 ends with the plant's
  lean changed but not a dramatic 180° flip. It still reads because the *hand visibly
  turning the pot* carries the information — the viewer infers. Accepted; the gag lands
  on inference + the Shot 7 contrast, not on a perfect end-state lean.

---

## Cost notes

- ~15 nano-banana Pro frames (13 + 2 regen) ≈ $2; 7 Veo Fast clips, 48 Veo-seconds at
  720p ≈ $7; ElevenLabs music + one VO line ≈ $0.5. **API ≈ $10**, plus Claude tokens.
- Zero Veo rerolls — the cost lever (book-end skill: "frame re-rolls are the cheap
  lever; avoid Veo re-rolls") held. Two cheap nano re-rolls, no expensive Veo ones.

---

## For the next expressive piece

- The brief-to-generator-strengths discipline is the whole game with Veo. Pick a
  concept whose every beat is a thing Veo does well, and rerolls approach zero.
- Book-end everything; it is not optional for object/continuity work.
- Reveal state changes on the cut, not within a shot — cheaper and cleaner.
- A wordless or near-wordless tone poem carries fine on image + light + one line.
  Resist the urge to narrate.

---

## Revision rounds (added after user review)

The user reviewed and the build went through **four versions** — and the key lesson
is humbling:

- **Static-frame QA misses Veo motion artifacts.** I reviewed every clip by extracting
  still frames and judged them clean. The user watched the video and caught: a hand
  *duplicating* mid-shot, the plant being *placed → vanishing → placed again*, the lean
  shot *wobbling* (plant pointing toward/away/toward), and the first turn-around only
  *partially* completing. **None of these are visible in stills** — they are temporal.
  For any Veo build, real-time playback review (the user's, or an actual video scan) is
  not optional. Static frames verify composition, not motion.

- **The keep / trim / reroll ladder, in practice.** Most fixes were *trims*, not
  rerolls: cut a whole shot (the carry, then later restored as a 2s slice), head-trim a
  shot to skip a glitch, tail-trim to drop a duplicate hand, end a shot at a clean
  moment. Only one shot (the ending) needed an actual Veo reroll. **Trimming around
  artifacts is the cheap, first-line fix; reroll last.**

- **Fast vs Quality for the hero beat.** The shot-7 re-roll on Veo **Fast** under-
  delivered the motion — the plant only partly turned. Re-rolling on **Quality**
  (`veo-3.1-prod`) with strong, clearly-opposed end frames and a very explicit prompt
  ("turns itself, no hands, no human presence anywhere") produced a full, convincing
  turn. **For the one shot the whole film rests on, spend the Quality call.**

- **Endpoint extremity drives motion completeness.** The first re-roll used a mild
  "leaning toward window" end frame; the plant under-turned. The second used an end
  frame with the plant leaning *hard* toward the glass — exaggerated — and the turn
  completed. Book-end principle 3 again: overshoot the end pose.

- **The user can restore what they cut.** The carry shot was cut whole in v2, then the
  user asked for a specific 2-second slice of it back in v3. Keep source clips around;
  "cut" often means "cut most of," not "delete forever."
