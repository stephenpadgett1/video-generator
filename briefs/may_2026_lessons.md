# May 2026 — Lessons Learned

Companion to `may_2026_brief.md`. Notes from the production session (2026-05-01) that should inform future monthly-etymology pieces.

---

## What worked

- **Cinta Senese as continuity anchor.** The distinctive white "belt" across black coat read across all four light states (afternoon → honey → evening blue → firelight). Breed choice was load-bearing — pick a marking that survives extreme light shifts. For animals reappearing across multiple light states, prioritize **graphic markings** over color subtleties.

- **Two canonical references (resting + alert).** Locking the sow in *two* canonical states (eye closed / eye open) up front gave us a clean source for both the body shots (resting state) and the face / final-eye shots (alert state). Future series pieces with a recurring subject: budget two canonical refs per state the subject must occupy.

- **Reverse-video as a thematic pivot.** Reversing `sow-eye.mp4` (open→close) to make the final beat *closed→open-to-firelight* fundamentally changed the emotional reading at zero gen cost. One ffmpeg call (`reverse,areverse`). Default to *try the reverse* on any climactic shot — cheap creative move.

- **2-second inserts.** The brief said "read clearly in under 3s" — going to 2s tightened the pacing dramatically. The piece felt better at 40s than at 50s. **Default insert length for series pieces should be 2–3s, not 4–5s.**

- **Per-shot audio prompts.** Explicit "no music, no human speech, no vocalizations" in every Veo audio prompt kept the generator from spontaneously adding score or muttering. Veo's diegetic ambient is high quality when bounded.

- **Run all inserts in parallel.** 5 inserts submitted simultaneously, single multi-op poller — saved ~20 min wall clock.

---

## Surprises / things to plan for

- **NB-chain locks light shifts the same way it locks pose.** Two attempts at "honey light, same composition" (chained off canonical v1) both came back essentially unchanged from afternoon. Only fresh-regen-from-text broke the lock. **Generalize the existing `chain-vs-regen` rule: for any major change — pose OR lighting OR mood — drop the chain. Use chain only for prop/expression edits.**

- **Veo RAI has at least two filter layers.** Prompt text + first-frame image are evaluated separately. The bike beat tripped first on prompt ("child"/"parent" + body parts → support code 58061214), then on a clean prompt the *image* tripped (visible child face → support code 17301594). When a beat involves children, plan to either (a) hide faces in the poster, (b) use neutral language in prompt, or (c) skip and substitute from the bench list.

- **NB Pro spontaneously adds modern livestock ear tags.** Generated unsolicited orange ear tag on the sow's face frame. **Always explicitly forbid "no ear tag, no plastic tag, no notch, no marker" in prompts for animals where they shouldn't appear.** Specific to period/historical pieces.

- **Veo end-frame drift.** Multiple clips had subtle color/state shifts in the last ~0.5s (honey was the most visible). **Plan to trim 0.3–0.5s off the end of every Veo clip during assembly.** Don't fight the drift in regen — trim it.

- **Drone stretching is essentially free.** `atempo=0.5,atempo=0.87` stretched a 10s sub-bass drone to ~23s with no audible artifacts. For tonal/atmospheric audio, prefer stretching over regenerating to preserve approved character. (Wouldn't work on rhythmic or pitched material.)

- **Upscale's % output is misleading.** Already saved to memory — the percent is the AI phase only; ffmpeg reassembly + audio remux still ahead.

- **VO duration runs short.** Lily at speed=0.9 gave 7.4s for an 85-char quote — ~12 chars/sec at slow contemplative speed. Below the 10s target the user expected. Plan for: slow further, add silence padding at start/end, or accept the difference and let it breathe.

- **Composition latitude pays off.** Several decision points (Cinta Senese as breed, the Roman altar's exact form, the bee on white daisy) — deciding rather than asking saved real time without sacrificing quality. The user explicitly invited this latitude in the saved feedback. **Lean toward deciding when the brief leaves room.**

---

## Tonal balance — specific to this kind of piece

- **The "weight" of inserts matters compositionally.** Bread, stone, smith, glass were all *loaded* gestures (domestic warmth, generations, fire-as-making, fire-as-breath). The original seed beat was also loaded (generations planting). When the user pulled stew (also loaded — cooking, transformation), they noted "starts to become very heavy handed."
  
  **Lesson: balance loaded gestures with at least one beat that's just nature being nature.** The bee on a daisy works because it carries no narrative weight — it's life feeding life, observed from outside human concern. In future series pieces, plan a "release valve" insert that's *fully natural and unloaded* — pollination, wind in grass, water on stone, dawn light through leaves.

- **The piece's emotional architecture.** Building dread (drone entering at sow body, growing through the second half) + a single still witness (the priest) + a closing voice (Lucretius VO) was the structural move that made it land. The diegetic ambient → drone → VO progression is a strong template for ~40s pieces with quiet narrative weight.

---

## Cost notes

- ~$30 total (estimated; not yet reflected in BigQuery billing export — 24h lag).
- Veo dominated (~$25 / ~83% of total).
- The 4 RAI-blocked Veo attempts (bike × 3, seed × 1) likely didn't bill — keep an eye on actual billing in 24h to confirm.
- NB Pro at ~30 calls / ~$5 was the second largest line. Worth re-examining whether all the bookend pairs *needed* both A and B (some sow beats had "weak" change deltas — could have used a single anchor).
- For future ~50s pieces of similar complexity, budget **$25–35**.

---

## Series-level (Monthly Etymological)

- **Sow-style continuity-locked subject + interleaved inserts** is a strong template. Same structural move could carry: "hearth" (Vesta), "two-faced gate" (Janus), "scales" (Libra), etc.
- **Etymology card off-screen (description, not in video)** kept the piece tight. Don't crowd a 40s piece with on-screen text.
- **Drone + VO at the end** is the most reliable tonal close — diegetic ambient through ~70% of the piece, then a slow tonal floor + voice for the last act.
- **Lucretius / Ovid / Macrobius / Servius** — Roman didactic-poetic sources are an almost unlimited well for these. The VO doesn't have to come from the source the etymology comes from; cross-source pairing (Maia from Macrobius, voice from Lucretius's hymn to Venus) added richness.
