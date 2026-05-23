# FLOORS — Production Lessons

**Built:** 2026-05-22 — fully autonomous build. 6 shots, ~36s, 9:16.
**Final:** `data/workspace/floors/final/floors_v1_4k.mp4`
**Brief:** `briefs/floors_brief.md`

## What worked

- **The conceit pivot.** Original plan was a camera bolted *inside* the elevator
  looking at the doors. nano-banana refused it twice — it kept defaulting to the
  iconic camera-*outside* doorway shot. That default was the signal: pivoted to
  "camera in the world, looking at a freestanding elevator standing in each world."
  Cleaner, funnier (a steel elevator incongruously in a jungle is its own gag), and
  far more Veo-reliable — a locked exterior on a static object is the easiest thing
  Veo renders. **Lesson: when nano keeps overriding your framing with its own
  default, the default is often the better shot. Stop fighting it.**
- **Book-end with a shared master frame.** `s1_A_lobby_open` (man in the lit car)
  became the reference for every world Frame B. Car interior + man stayed locked
  across all 6 worlds with zero drift.
- **One generation per shot, all 6 usable.** No rerolls, no RAI trips. Fast for
  4 shots, Standard for reef + tundra (water caustics, particle snow).

## What to watch

- **frame-qa false `reroll`.** S6 came back `reroll` — but both flagged issues (the
  leaf, the briefcase) were *intended* details my `--change` string didn't mention.
  Re-ran with a complete intent description → `accept_with_caveat`. **Lesson: put
  every intended prop/detail into frame-qa `--change`, or it reads them as drift.**
- **clip-qa `trim_to_clean` is narratively naive.** S6's "clean range" ended at 4.6s
  — which would have cut the entire walk-to-desk-and-sit payoff. The flagged issue
  was only low-severity briefcase shimmer. **Lesson: clip-qa clean-ranges optimize
  for artifact avoidance, not story. Weigh severity against what the trim destroys.**
  S4's trim (medium-severity briefcase hand-switch) *was* worth taking — the deadpan
  beat reads fine at 4.4s.
- **Veo + handheld props drift.** Both 8s shots (tundra, office) had briefcase
  continuity glitches in their back halves — the briefcase switched hands / shifted.
  Longer Veo clips give the prop more time to wander. Shorter beats are safer for
  held objects; trim aggressively or keep clips ≤6s when a prop is in hand.
- **Wide LRA is fine when it's the design.** mix-health flagged 8.0 LU loudness
  range as "wide for narration." It is wide — on purpose: the gag is each world's
  sound bursting in (loud disco vs muffled reef). Don't compress that flat.

## Revision round (user review notes)

User flagged two continuity breaks on the v1 cut — both real, both fixed by
regenerating one shot each on Veo Fast:

- **Veo's "entrance movement" reasserts itself even with a book-end last-frame.**
  S5 disco: Frame B clearly showed the man standing *inside* the car, yet Veo still
  walked him out onto the dancefloor. The doors-open reveal invites Veo to animate the
  character "arriving." Fix that worked: regenerate Frame B with the man set *deep*
  inside the car AND a prompt that explicitly says "does not step out, feet planted,
  stays fully inside the car the whole time." v2 held him at the doorway threshold.
- **clip-qa misreads a threshold position as "stepped out."** clip-qa flagged S5 v2
  `regenerate` — "man stands on dance floor." Dense-sampling (9 frames across the clip)
  showed he stayed in the car doorway the whole time. The checkered floor visible at
  his feet fooled the model. **Always dense-sample a flagged spatial claim before
  acting on it** — same discipline as the motion-blur false positives.
- **A callback prop must persist on every intermediate beat or not return.** The
  jungle leaf landed on his shoulder in S2 (good gag), vanished for reef/tundra/disco,
  then reappeared in the final office shot — which read as an error, not a callback.
  Removed it from S6. Lesson: if a prop can't survive every shot between its
  introduction and its callback, drop the callback.
- **Longer Veo clips = more prop drift.** Both 8s shots kept producing briefcase
  glitches (hand-switch, apparent duplication) and S6 v2 added chair morph. The
  walk-and-sit genuinely needs 8s, so this is a cost of the shot; dense-sample to
  separate real duplication from motion blur before re-rolling.

## Delivery to a remote user

User was reviewing via Remote Control from their day job — no way to see local files.
Built `tools/gcp/share.cjs`: uploads a file to the infra GCS bucket and mints a V4
signed GET URL (7-day expiry, RSA-signed with the infra SA key, zero npm deps). A
compressed 720p copy (~7MB, `scale=720:1280 crf=25`) is the right review artifact —
small, plays in any browser. The Gmail MCP connector needs interactive `/mcp` auth,
which is awkward over Remote Control; the signed-URL path is fully autonomous.

## Cost (rough)

~54 Veo-seconds billed (40 Fast incl. the S5+S6 re-renders + 14 Standard), ~18 nano
images, 6 TTS + 1 music track, 14 QA Anthropic calls (6 frame-qa + 8 clip-qa).
Est. ~$13–17 + Claude tokens.
