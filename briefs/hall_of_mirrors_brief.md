# HALL OF MIRRORS — Concept Brief

**Date:** 2026-05-24
**Slug:** `hall-of-mirrors` — workspace `data/workspace/hall-of-mirrors/` (when built)
**Format:** 9:16 vertical, 4K final. Target ~45–55s.
**Status:** **Banked.** Concept locked, beat sheet drafted, not yet greenlit for build.
**Pipeline (planned):** Mostly nano-banana stills + Veo Fast for subtle reflection motion (breath, blink, micro-shifts). 1 Standard held in reserve for the final mirror.

---

## Logline

A man walks into a carnival hall of mirrors. The mirrors don't distort his body —
they show the lives he didn't live. The last mirror shows him, exactly as he is,
and that's the one that stops him.

## Tone

Tone poem, not a sketch. Elegiac, intimate, no comedy. Closer to
[[project_passenger]] / The Lodger than to FLOORS or the guess booth. Carnival
imagery used for its melancholy, not its kitsch — empty hall after-hours feel,
single bare bulb, peeling paint on the mirror frames, scuffed floorboards. The
"AI" angle is implicit: these are generated alternate selves, and we no longer
need a metaphor for that.

## Through-line (never stated)

*The machine that can show you every life you didn't live cannot help you live
this one.*

## Camera / POV

The camera is **behind him and slightly above his shoulder** for the entries
into each mirror, then **becomes the mirror's POV** looking back — we see the
reflection as the reflection sees him. Each mirror beat is a tight match-cut
between "him approaching" and "him as the mirror shows him."

The final mirror breaks the pattern: we never leave his shoulder. He sees
himself. We don't.

## The Mirrors (beat sheet, ~45–55s, 6 beats)

| # | Beat | ~Dur | Veo | Notes |
|---|------|------|-----|-------|
| B1 | **ENTRY.** He steps through a velvet curtain into the hall. A single bulb. Five mirrors in a slow curve. Dust hangs. He takes a breath. | 7s | Fast | Establishes the space, the man, the silence. Nearly still. |
| B2 | **THE JOB.** First mirror. The reflection is him 15 years older, in the office he didn't take — graying, expensive suit, dead-eyed competence. The reflection breathes. He doesn't. | 8s | Fast | Subtle: the reflection looks back at him with a flicker of recognition, then away. |
| B3 | **THE LEAVING.** Second mirror. Him, the same age as he is now, but wearing the t-shirt he wore the day he left her. The reflection is mid-sentence to someone we can't see, lips moving, the apology he never finished. | 8s | Fast | Lips move; no audio of what's said. |
| B4 | **THE MOTHER'S EYES.** Third mirror. Not him — *him as his mother sees him*. Eight years old, in the kitchen, looking up with the face she remembers. He stops walking. | 7s | Fast | The hardest nano composition; child likeness must read as a younger version of this specific man. |
| B5 | **THE FUNERAL.** Fourth mirror. Him in the casket, the small slack settledness of a face that's no longer being performed. Around the edges of the mirror, blurred shapes of mourners. | 7s | Fast | Restraint required — restful, not grotesque. No injuries, no morbid detail. |
| B6 | **THE LAST MIRROR.** Fifth mirror. He approaches. The camera stays behind him. The reflection is just **him**, as he is, right now, looking back at himself. We never cut to the mirror's POV. He doesn't move. Hold. Slow fade. | 10s | **Standard** (reserve) | The whole piece lives or dies on this hold. |

**End card:** silence held, slow fade to black. Optional small serif title at end:
*HALL OF MIRRORS.* ~2s.

**Total:** ~47s + 2s ≈ 49s. Inside window.

## Audio (planned)

`generateAudio: false` on all Veo. Built in post.

- **Bed:** the room — the soft hum of a single bulb, distant wind through the
  carnival outside, faint creak of wood, his slow breathing. Constant.
- **Per mirror:** a single delicate audio echo of what that life sounded like —
  B2 a phone ringing far off, B3 a screen door, B4 a kettle, B5 a held silence
  (no sound at all is its own choice), B6 his own breath, only his own breath.
- **Score:** one held piano note or low string, swelling almost imperceptibly
  under B4 and B5, gone by B6. ElevenLabs (per
  [[feedback_elevenlabs_consolidation]]).
- **No voice anywhere.** No narration. No dialogue. The mirrors don't speak.

## Production Notes

- **Character lock is everything.** Per [[feedback_face_visible_in_ref]] and
  [[feedback_veo_input_image_rai]] — the same man, recognizably, in: aged-up
  corporate version (B2), present-day in a specific T-shirt (B3), as a child
  (B4), at peace in a casket (B5), and present-day looking back (B6). Each
  reflection is a fresh nano-banana composition off the base char lock, varying
  only state. Per [[feedback_nano_banana_canonical_refs]] — name what to preserve
  (face structure, eye color, jaw, ears), describe only what changes (age,
  wardrobe, expression).
- **Mirror-frame plate:** a single painted gilt mirror frame on a stand, shot
  once as the master plate, reused across all five mirrors with reflection
  content composited in via nano. Locks the carnival space.
- **Reflection motion:** Veo Fast given only subtle in-frame motion (a breath,
  a blink, lips parting). Book-ended off nano A/B pairs that already lock the
  reflection — Veo just has to animate breath and micro-shift. See
  [[feedback_book_end_frame_hygiene]].
- **B4 (the child) risk:** Per [[feedback_veo_child_prompt_words]] — describing a
  child plus body-part words trips RAI. Keep the prompt strictly motion-only
  ("the reflection looks up; the reflection's eyes move toward the viewer") and
  let the nano poster frame carry the figure entirely.
- **B5 (the casket) risk:** Per [[feedback_morbid_content_stills_first]] —
  morbid content clusters RAI hangs even with restrained prose. **Pre-bake B5
  as a held still + breath-cycle particle motion in ffmpeg**; do not ask Veo
  to render motion in that frame at all.
- **Stillness vs Veo.** Per [[feedback_stills_motion_narrative]] — narrative
  pieces should be Veo on every shot. This is borderline narrative; treat the
  five mirror beats as Veo, treat B5 as the one exception (per the risk above).

## Cost Estimate (planned)

- Veo: 5 shots × ~7s + 1 Standard hold ~10s + reroll budget → ~50s →
  **~$5–6 Veo.**
- Nano: heavy — base char lock + 5 reflection variants (each costly to get
  right) + mirror master plate + per-shot A/B = **~20–28 images, ~$3–4.2.**
- ElevenLabs score + ambient SFX (~6 cues) — **~$1.**
- QA Anthropic — **~$1–2.**

**Rough total: $10–14.** Slightly higher nano spend than typical because
the character variant composites are the load-bearing element.

## Open Questions (resolve before build)

1. **B4 — the child.** Does it work, or is it the one mirror that breaks the
   set? Alternative: him as his mother saw him at the age he is *now* —
   the look she gave him at his wedding, his graduation, the last visit. Same
   face, different gaze.
2. **B5 — the casket.** Is it too much? Alternative: an empty mirror. He
   approaches and sees nothing.
3. **B6 hold length.** 10s might be too long for a vertical scroll-context
   piece. Test at 10s; if it drags, trim to 8s.
4. **End card or no?** A title might over-explain. Try both in edit.

## Working Doctrine

When greenlit: per [[feedback_autonomous_build_doctrine]] — Fast-default,
one generation per shot, keep / edit-rescue / flag-skip. The B6 Standard
gets **one** attempt and the call to reroll is the user's, not autonomous.
