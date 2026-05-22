# The Lodger — Shooting Brief

*An expressive short. Not an explainer.*

## Overview

A ~47s vertical (9:16) tone poem about a houseplant — the most undemanding tenant a
home ever had. It pays no rent. It asks for one thing: the window.

The film follows the plant from a dim shop shelf to a sill in someone's apartment, then
simply watches it *want light* — the whole plant leaning, over days, toward the glass.
The turn: a hand rotates the pot 180°, the way you're "supposed to," so it grows even.
Next morning — it has already turned back. It will always turn back.

- **Duration:** ~45–48s
- **Aspect ratio:** 9:16 vertical
- **Generation:** Veo 3.1 **Fast**, book-ended (every clip bracketed by nano-banana
  poster frames so the plant, pot, and window stay locked)
- **Register:** tender, contemplative, a thread of quiet wit. Nearly wordless — one
  closing line. Music + naturalistic ambience carry the rest.
- **Spine:** the plant + its window. Established in Shot 3, recurs through Shot 7. The
  pot-and-leaves are the continuity anchor — the "character."

## The heart

Not stubbornness. The plant simply knows one thing completely, and votes for it with
its entire body, every day. The agency is real and shown straight — phototropism
observed with enough attention that it reads as will. A person waters it and means
well; the relationship is one-sided and gentle. You can turn it away. It turns back.

## The plant

A modest, anonymous houseplant: a single soft green stem rising from a small weathered
terracotta pot, topped with a loose head of oval leaves. A little leggy — as if it has
spent its whole short life reaching. Humble, unremarkable, the kind of plant nobody
photographs. That is the point.

No faces in this film. The only human presence is one hand — watering once, turning the
pot once. The plant is the protagonist; the hand is weather.

## Look

Warm, naturalistic, softly filmic. Domestic interior. Raking natural light is the
co-protagonist — cool window-light against the warm of the room. Shallow depth, gentle
grain, unhurried. Palette: terracotta, leaf-green, warm whites, the blue of glass-light.
Vertical compositions that emphasize the upward reach — the stem as a line of yearning.
Camera mostly still or a slow, small drift; let the light and the leaning do the moving.

---

## Shot-by-shot

Each shot is generated with a **first-frame (A)** and **last-frame (B)** nano-banana
poster, anchored to `REF-PLANT` and (Shots 3–7) `REF-WINDOW`. Veo Fast animates A→B.
Run `frame-qa` on each poster pair before submitting.

### Shot 1 — The shop (~6s)
**A:** The plant low on a crowded shop shelf among other plants, flat cool fluorescent
light, slightly forgotten. Small in frame.
**B:** Same, a half-beat later — leaves micro-settle, a fluorescent flicker.
**Motion:** near-still; ambient life only. Establishes a humble, overlooked origin.
**Ambience:** low shop hum, distant fridge buzz, faint footsteps.

### Shot 2 — Carried home (~7s)
**A:** The pot held in two hands / against a coat, interior shop light, just turning
toward a bright doorway.
**B:** Out in daylight — the plant lit fully for the first time, street softly blurred
behind, leaves bright.
**Motion:** the carry; the light *changes* on the plant — that is the event.
**Ambience:** door, street air, a breath of traffic and birds.

### Shot 3 — Placed (~6s)  ·  *spine shot — locks pot + window position*
**A:** A hand lowers the pot toward a plain windowsill, soft morning light.
**B:** The pot set, the hand withdrawing; the plant standing fairly upright, the tall
window framing it. Its new home.
**Motion:** the set-down, a settling.
**Ambience:** the small knock of terracotta on sill, room tone, morning birds.

### Shot 4 — The day passes (~8s)
**A:** The plant on the sill in cool early light, long shadow.
**B:** The plant in full warm low afternoon light — glowing, dust adrift in the beam.
**Motion:** light sweeps and warms across the plant through the clip; the plant basks.
A held, gorgeous beat. No human.
**Ambience:** quiet room tone, a clock, faint outside life.

### Shot 5 — The lean (~7s)  ·  *emotional center*
**A:** Days later. The plant has visibly leaned — the whole stem tilts toward the glass.
**B:** Closer on the bend of the stem, every leaf oriented one way, toward the light.
**Motion:** a slow push toward the curve of the stem. Wordless yearning, made visible.
**Ambience:** near silence, room tone, a thread of music entering.

### Shot 6 — The turn (~6s)
**A:** The plant leaning windowward; a hand enters and closes gently around the pot.
**B:** The hand has rotated the pot 180° and is withdrawing — the plant now leans *away*
from the window, into the room. A small, well-meaning correction.
**Motion:** the deliberate rotation of the pot; the hand's care is evident.
**Ambience:** the soft grind of terracotta turning on the sill.

### Shot 7 — Turned back (~8s)
**A:** Next morning, soft new light — the plant already leaning toward the window again.
It has turned back overnight. (The gag lands on the cut from Shot 6.)
**B:** Same, holding — steady in the light. Optionally the smallest new detail: an
unfurling leaf at the tip.
**Motion:** near-still; a gentle settle, light strengthening.
**Closing line (soft VO):** *"It doesn't know it's being helped. It only knows where
the light is."* — may compress to just the second sentence, or render as a final title.
**Ambience:** morning, room tone, music resolving warm.

---

## Audio

- **Veo audio:** generate ON. Each shot prompt carries explicit ambient cues (shop hum,
  street, terracotta knock, room tone, birds) so the generated track is usable bed.
- **Music:** one ElevenLabs track, ~47s. Warm and minimal — felt piano, a soft sustained
  string. Near-silent at the shop; enters quietly around Shot 4–5; a small lift at the
  turn-back in Shot 7; resolves warm. Never sentimental-saccharine; restrained.
- **VO:** at most the one closing line, warm and intimate, low and unhurried. Picked at
  production. If it competes with the image, cut it and use a final title instead.
- **SFX:** light naturalistic accents only — water pour (if a watering beat is added),
  the terracotta turn. Nothing that announces itself.

## Title

Open on a quiet title card — *The Lodger* — over the dim shop, or hold the title to the
end. Decide in edit; lean toward an unobtrusive open and a clean final card.

## Continuity & production notes

- `REF-PLANT` is the spine — lock it first: pot shape and wear, stem thickness, leaf
  count and arrangement. Every poster frame is anchored to it.
- `REF-WINDOW` locks the sill, window, and light geography from Shot 3 on.
- The lean develops across Shots 3 → 5 → 7: upright-ish → clearly leaning → turned back.
  Each poster states the lean explicitly; don't rely on Veo to "remember" it.
- The pot-turn (Shot 6 → 7) is an object-continuity gag — book-end it precisely: Shot 6
  ends leaning *away*; Shot 7 opens leaning *toward*. The turn-back happens off-screen,
  overnight; the viewer does the arithmetic on the cut.
- Veo Fast throughout; escalate a shot only if Fast genuinely fails the read. Accept
  small imperfections that don't break the tenderness — rescue downstream before
  re-rolling.
- Workspace: `data/workspace/the-lodger/`.

## Why it works under the constraints

Every shot sits inside Veo Fast's strengths — interiors, raking light, weather-of-the-
day, a single hand, a plant. No faces to keep consistent, no VFX, no complex physics,
no transformations. The vertical frame is the plant's frame: a tall window, a stem, a
reach. It is expression, not explanation — mood, light, time, and one quiet turn.
