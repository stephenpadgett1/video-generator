# INSTAR — Production Lessons

**Built:** 2026-05-22. 7 beats, ~39s, 9:16. Stylized surrealist metamorphosis.
**Final:** `data/workspace-archive/instar/final/instar_v1_4k.mp4`
**Brief:** `briefs/instar_brief.md`

## What worked

- **The metamorphosing form.** The piece's whole idea — the *film* molts as the
  thread does — was carried by the nano poster frames: each beat's palette
  (B&W → red bleed → sick green → organic → naturalistic → mundane street) was
  baked into the frames; Veo only animated within each. The book-end skill made the
  per-beat aesthetic jumps deliberate and controllable.
- **`generateAudio: false` + a fully designed soundscape.** For a piece whose sound
  must metamorphose, suppressing Veo audio was the right call. Built a 3-section
  score (silent-film piano → Lynchian drone → organic resolution) crossfaded, plus
  7 placed SFX. Total control, no fighting Veo's literal diegetic.
- **A jarring book-end jump can be the aesthetic.** B6's A→B (the becoming-image →
  the photoreal twig insect) produced a hard mid-clip jump, not a morph. On a piece
  about "the jarring nature of change," that jump *is* the point. Don't always
  reroll Veo's failure to interpolate smoothly — sometimes it's on-brief.

## What to watch

- **"Silent film" in a nano prompt invites baked-in intertitles.** The loom frames
  came back with a German title card ("DAS GEWEBTE SCHICKSAL") rendered into the
  image — nano read "silent film" as license to add a card. Fix: every frame prompt
  for a silent-film/vintage aesthetic must explicitly forbid it — "absolutely no
  text, no lettering, no title cards, no captions." [[feedback_no_photograph_descriptor]]
  is the sibling lesson.
- **Veo snaps duration to 4/6/8.** Requested 5s and 7s clips came back 4s and 6s.
  Plan beat durations on the 4/6/8 grid from the start.
- **Sparse reads as intentional; busy reads as AI-clutter.** First pass at the
  dancer beat was full German-expressionist Caligari clutter — painted shadows, a
  white mask, a raked stage. User note: "make it more sparse." Stripping to a bare
  empty stage + one figure + the giant scissors + a single rope was far stronger.
  For stylized/art-house work, negative space and one or two symbols beat a busy
  frame — the restraint is what reads as authored rather than generated.

## Cost (rough)

~14 nano poster frames (+ a few text-removal and revision re-rolls), 7 Veo clips
(2 Standard) + 2 re-renders for the sparser B2/B3 = 9 Veo billed, 3 music sections
+ 7 SFX. Est. ~$14–20 + Claude tokens.
