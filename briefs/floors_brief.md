# FLOORS — Shooting Script v1

**Date:** 2026-05-22
**Slug:** `floors` — workspace `data/workspace/floors/`
**Format:** 9:16 vertical, 4K final (Real-ESRGAN ×2 from 1080)
**Runtime target:** ~42s (6 shots + end card)
**Pipeline:** Veo 3.1 (Fast default; up to 2 Standard) book-ended off nano-banana poster frames

---

## Logline

A deadpan office worker rides an elevator to work. Every floor the doors open onto
an absurd world — rainforest, coral reef, polar tundra, a disco. He never reacts.
The doors finally open on his actual destination: a beige cubicle farm. *"Floor six.
Accounting."* He steps out, relieved. The mundane is the surreal one.

## Tone

Bone-dry absurdist comedy. The humor is in the **non-reaction** and the building's
bureaucratic calm — the announcer names these as ordinary floors. No winks. No mugging.
Escalation of spectacle against a flat, unchanging man.

---

## The Formal Conceit — A FREESTANDING ELEVATOR IN EACH WORLD

The camera is locked, eye-level, looking at a **freestanding elevator** — a steel
doorway with a warm-lit interior car — that stands incongruously in the middle of each
world. The same elevator. The same locked framing. Every shot:

- **The elevator** sits center-frame: a brushed-steel door-pair and frame, the lit car
  interior visible behind it when open. It belongs nowhere yet stands everywhere.
- **The world** surrounds it and fills the rest of the frame — jungle, reef, tundra,
  disco. The camera lives *in* the world.
- **The man** stands inside the lit car, framed in the open doorway, facing out, briefcase
  at his side — clearly lit, face always readable.

The man and his car are the constant object; the impossible place around them is the
only variable. The recurring image of this mundane steel box standing in a jungle is
itself the running gag. Do not break the locked framing.

## Cutting Rhythm

Each floor is a self-contained hard-cut clip:

```
[elevator in world, doors closed] → DING → doors slide open → man revealed +
   world's motion intrudes (snow / leaf / confetti / fish) + man's (non-)reaction → hold
```

Hard cut to the next shot, already on a new world with closed doors. We never watch the
doors close — the cut does that. Snappy. Each clip ~6–7s.

---

## Character

**The Commuter** (`man`) — a tired man, late 40s. Charcoal-gray suit, slightly rumpled,
no tie or loose tie. Holds a worn leather briefcase in one hand. Thinning hair, gray at
the temples, heavy-lidded eyes, the settled blankness of a long-tenured employee. Posture
slightly slumped. **He does not speak.** His whole performance is micro: a slow blink, a
sleeve-brush, a watch-check, a single weary sigh.

## Audio Bed

- **Music (constant):** bland, tinny elevator muzak loop — ElevenLabs, ~45s, low volume.
  It NEVER reacts to the worlds. Plays under everything, unbroken. The deadpan through-line.
- **Veo diegetic per shot (`generateAudio: true`):** elevator hum + a clean DING at each
  floor; the world's sound *bursts in* the instant the doors open, then is cut dead by the
  hard cut to the next shot. Jungle birdsong / underwater muffle + bubbles / howling
  blizzard wind / disco music + crowd.
- **Announcer:** a flat synthetic elevator voice (TTS, River — flat/measured). One short
  line per floor, corporate-calm:
  - S1: *"Going up."*
  - S2: *"Floor two."*  S3: *"Floor three."*  S4: *"Floor four."*  S5: *"Floor five."*
  - S6: *"Floor six. Accounting."* ← the payoff line.

---

## Shot List

| # | Floor | Beat | Veo | Dur |
|---|-------|------|-----|-----|
| S1 | Lobby | Elevator stands in a drab beige office lobby, doors open, man inside. He reaches and presses a button; doors slide closed. Establishes the normal elevator + the man. | Fast | ~6s |
| S2 | 2 — Jungle | Same elevator now stands in dense rainforest. DING, doors slide open: vines, mist, a toucan crossing behind. A broad green leaf drifts in and lands on his shoulder. He does not look. | Fast | ~6s |
| S3 | 3 — Reef | Elevator on a sunlit coral reef, submerged. DING, doors open: blue caustics, slow bubbles, a fish drifting across the doorway. He watches it pass with mild, dead eyes. | **Standard** | ~6s |
| S4 | 4 — Tundra | Elevator in a polar white-out. DING, doors open: howling wind, snow blows *into* the lit car. He brushes one snowflake off his sleeve, checks his watch. | **Standard** | ~7s |
| S5 | 5 — Disco | Elevator on a disco dancefloor. DING, doors open: mirror-ball, warm colored light, confetti raining, muffled dance music. Confetti settles on him. He exhales one tired sigh. | Fast | ~7s |
| S6 | 6 — Accounting | Elevator stands at the edge of a beige cubicle farm under flat fluorescent light. DING, doors open: he steps OUT, walks to a cubicle, sits. As we hold, one green jungle leaf is still on his shoulder. | Fast | ~8s |

**End card:** black, white serif "FLOORS", ~1.5s.
**Total:** ~42s + 1.5s ≈ 43–44s. Within 30–60s.

### Standard allocation
S3 Reef (water caustics + drifting fish — motion/light complexity) and S4 Tundra
(particle snow physically entering the car). These two carry the hardest physics/light;
the rest are fine on Fast. Disco (S5) deliberately uses *warm colored light + confetti +
mirror-ball*, NOT hard neon strobe — avoids the known Veo VFX-failure mode.

---

## Poster Frames (book-end)

Camera angle identical in every frame: locked, eye-level, on the freestanding elevator.

- **Char ref** — the Commuter, face clearly visible (face appears in every shot).
- **Master open-car** — the elevator with doors open, man inside the lit car facing out.
  Used as the reference for every world Frame B so the car interior + man stay locked.
- Per shot: **Frame A** (elevator in world, doors closed) + **Frame B** (doors open, man
  revealed, world alive).
  - S1: Frame A = lobby, doors open, man inside; Frame B = lobby, doors closed.
  - S2–S5: Frame A = world, doors closed; Frame B = world, doors open, man + end-pose.
  - S6: Frame A = cubicle farm, doors closed; Frame B = man stepped out, seated at a cubicle.

Run `tools/frame-qa.py` on every A/B pair before submitting to Veo.

## Cost Estimate

~40–46 Veo-seconds (count every submission incl. rerolls/RAI) → ~$6–10 Veo;
~10–12 nano images → ~$1.5–2; TTS + music + SFX small; QA Anthropic calls ~$1–2.
**Rough total: $11–16.**

## Working Doctrine

Fast-default, one generation per shot. Keep / edit-rescue / flag-skip — no autonomous
rerolls, no Standard beyond the 2 allocated. Imperfect clips get shown, not silently
re-rolled. Decisions queued for review.
