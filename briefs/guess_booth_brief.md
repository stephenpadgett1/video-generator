# GUESS YOUR _____ — Shooting Script v1

**Date:** 2026-05-24
**Slug:** `guess-booth` — workspace `data/workspace/guess-booth/`
**Format:** 9:16 vertical, 4K final (Real-ESRGAN ×2 from 1080).
**Runtime target:** ~45s (6 shots + end card).
**Pipeline:** Veo 3.1 (Fast default, 2 Standard reserved for the pivot beats) book-ended off nano-banana poster frames.

---

## Logline

A carnival "Guess Your _____" booth, but the guesser is a brass-bodied, CRT-headed
robot. Three marks step up; the guesses escalate from impressively specific to
unspeakably intimate. A sneak peek behind the curtain reveals the trick — it's just
a phone running an LLM. We return to the front. The last mark is still standing
there. She slides over another dollar.

## Tone

Dusk-warm carnival nostalgia turning quietly horrific. Played straight, no winking.
The comedy lives in the first guess and curdles by the third. The piece is **about
us, not the robot** — every face we hold is the joke and then the wound. No
soundtrack swell at the turn; the air just gets thinner.

## Through-line (never stated)

*We already feed it everything. The booth is just being honest about it.*

---

## The Setting

A small county-fair midway at **golden-hour-to-dusk**. Warm practical incandescent
string lights overhead (NOT neon — Veo botches neon, see veo-techniques). Dust in
the air, distant calliope and crowd murmur, popcorn-scented. Camera anchored on
one painted wooden booth among many.

**The booth:** hand-painted plywood front, faded carnival red and cream. The sign
across the top, in painted block letters with theatrical strike-throughs:

> GUESS YOUR ~~WEIGHT~~ ~~AGE~~ ~~JOB~~ **_____**

A coin/bill slot in the counter. A small tip jar. A painted "$1" placard.

**The Guesser:** behind the counter, a 1950s sci-fi robot redesigned by a Victorian
taxidermist — brass riveted body, articulated shoulders, no legs (mounted to the
booth floor), a single coin-slot vertical in its chest. **Its head is a small
vintage CRT television** in a brass frame, screen displaying a slow scrolling
amber-on-black text and a soft pulsing waveform. The CRT face doesn't move;
it changes content. It tilts its head between marks with a faint servo whir.

## Characters (the marks)

Three ordinary fairgoers, demographically varied, not telegraphing anything in
particular. Faces clearly readable in every shot — the whole piece lives on their
reactions.

- **TYLER** — 17, baseball cap pushed back, friend's hoodie. Cocky half-smile.
- **DAVID** — 48, polo shirt, slightly sunburned forehead. Came alone.
- **SARAH** — late 20s, sweater pulled over her hands. Was not going to play.

## Audio Bed

- **Ambient (constant):** distant calliope organ + crowd murmur + occasional
  faraway laughter or bell. Always present, never loud. Provides "carnival" without
  needing to show one.
- **Veo native dialogue (`generateAudio: true`) on shots with the robot speaking.**
  The robot's voice is **flat, synthesized, warm-friendly** — same calm register
  every line, no escalation in its delivery. If Veo native can't hold the synthetic
  flatness, fall back to ElevenLabs **River** (flat/measured) and align in post.
  See [[feedback_veo_native_audio_default]].
- **SFX:** soft servo whir on each head-tilt; faint coin-clink on the dollar slap;
  a low CRT hum under the robot's speaking lines.
- **No music score.** The ambient *is* the score. No swell at the turn — the
  silence after Sarah's guess is the whole point.

---

## Shot List

| # | Beat | Veo | Dur |
|---|------|-----|-----|
| S1 | **WIDE — the booth.** Dusk. The painted booth sits among others in a row, string lights overhead, a small idle crowd drifting past. The CRT-head robot stands behind the counter, motionless, its screen scrolling soft amber text. A distant unseen barker calls *"Step right up — the machine knows what you know!"* Hold. | Fast | ~6s |
| S2 | **TYLER — the warm-up.** MEDIUM on the counter. Tyler slaps a dollar down with a grin. Robot's head tilts (servo whir). CRT screen flickers. ROBOT (flat, friendly): *"Hello, Tyler. You are seventeen. You will fail your driver's test on Saturday."* Tyler barks a startled laugh, glances back at his friend offscreen. | Fast | ~7s |
| S3 | **DAVID — the turn.** MEDIUM on David at the counter. He's smiling slightly, curious. Slides a bill across. Tilt. Screen pulse. ROBOT: *"Hello, David. Your father didn't love you the way you wanted him to. He knew that you knew."* David's smile holds for one beat too long, then breaks. He does not walk away. His hand goes to his wallet. | **Standard** | ~8s |
| S4 | **SARAH — the wound.** MEDIUM on Sarah, sweater-cuffed hands. She wasn't going to play; her hand moves to a bill almost without her. Tilt. Pulse. ROBOT: *"Hello, Sarah. The thing you're not telling anyone — you don't have to. I already know."* Hold on her face. She does not move. She does not blink. | **Standard** | ~8s |
| S5 | **THE PEEK — behind the curtain.** Camera drifts low, around the side of the booth, lifts a corner of dusty red curtain. A cheap phone is gaffer-taped to a music stand. Its screen shows scrolling text: *"…subject D. — father deceased 2019, no recorded estate visit; subject S. — query history…"* The phone's case has a hairline crack. | Fast | ~6s |
| S6 | **BACK TO THE FRONT — the button.** MEDIUM-WIDE on the booth front. Sarah is still standing exactly where we left her. After a beat, she slides another dollar across the counter. The robot's head tilts (whir). End on her face. | Fast | ~7s |

**End card:** black, hand-painted-style cream lettering: **GUESS YOUR _____**. ~2s.

**Total:** 6+7+8+8+6+7 ≈ 42s + 2s card ≈ **44s.** Inside the 45–60s window.
(If we want to push to 50s, S3 and S4 can each take an extra beat of silence after the guess.)

### Standard allocation

S3 (David) and S4 (Sarah) — the two pivot guesses. These shots live or die on a
face holding still under a long, specific, ambient-only beat after the line lands.
Standard is for the **performance hold**, not for VFX complexity. Everything else
runs on Fast.

---

## Poster Frames (book-end)

Locked camera angles per shot. Per [[feedback_face_visible_in_ref]], every mark's
face is readable in their refs.

- **Char refs:** Tyler, David, Sarah, the CRT-head Robot, the booth front (master
  plate).
- Per shot: **Frame A** (start) + **Frame B** (end).
  - S1: A and B nearly identical; subtle dusk-light shift.
  - S2: A = Tyler placing dollar; B = Tyler mid-laugh, head turned.
  - S3: A = David sliding bill, smiling; B = David's smile broken, hand back at his wallet.
  - S4: A = Sarah at counter, hand on bill; B = Sarah, motionless, eyes locked on the CRT.
  - S5: A = side of booth, curtain corner; B = curtain lifted, phone on stand revealed.
  - S6: A = Sarah from S4 end; B = Sarah's dollar half across the counter, robot mid-tilt.

The robot's CRT face content (scrolling text, waveform) is baked into the nano
poster frames so Veo isn't asked to author legible UI in motion — see
[[feedback_nano_vintage_text]] / [[feedback_veo_allcaps_text]] for why we don't
trust Veo with on-screen text.

Run `tools/frame-qa.py` on every A/B pair before submitting to Veo.

## Risk Log

- **Robot lip-sync.** The CRT has no mouth — the voice should feel disembodied,
  coming from the booth speaker. This actually *helps*: Veo doesn't have to animate
  a moving mouth, only the screen pulse and a single head-tilt. If Veo tries to
  invent a mouth or eyes on the CRT, regen the poster frame with the CRT content
  more locked-down (denser text, no facial features).
- **Robot voice landing flat enough.** If Veo native gives us anything inflected
  or "warm-actor," fall back to ElevenLabs River on those three lines and align.
- **Sarah's hold.** The whole piece rests on S4's silent beat. If the Standard
  generation gives us a blink or a smile, that's the one shot worth a reroll.
- **RAI on intimate content.** S3 ("your father didn't love you the way you
  wanted him to") and S4 ("the thing you're not telling anyone") are emotionally
  loaded but not body-violent and not sexual — should clear RAI. If S3 trips, try
  *"He knew that you knew. You both knew."* If S4 trips, try *"You came here so
  you wouldn't have to think about it. I know what it is."*
- **The peek shot (S5).** The legible phone-screen text must be baked into the
  nano poster frame — Veo will mangle it as live text. Use a still-frame approach
  if motion makes it illegible.

## Cost Estimate

Per [[feedback_veo_bills_attempts]] — count every submission including possible
rerolls and duration round-up:

- Veo: 6 shots × ~7s = ~42s minimum, budget ~55–60s for 1–2 reroll attempts on
  the pivot shots → **~$5.5–6 Veo.**
- Nano: ~14–18 images (char refs + booth master + 6 A/B pairs + S5 phone-screen
  variants) → **~$2–2.7.**
- TTS/SFX (River fallback on 3 lines if needed) — small, **~$1.**
- QA Anthropic (clip-qa, frame-qa) — **~$1–2.**

**Rough total: $10–12.**

## Working Doctrine

Per [[feedback_autonomous_build_doctrine]]: Fast-default, one generation per shot,
keep / edit-rescue / flag-skip ladder. The two Standard shots (S3, S4) get **one**
attempt; if either misses the held-stillness on the face, queue for review rather
than autonomous reroll. Show imperfect clips. Per [[feedback_no_auto_reroll]] and
[[feedback_skip_clip_qa_for_user_review]] — skip clip-qa, the user will play and
react.
