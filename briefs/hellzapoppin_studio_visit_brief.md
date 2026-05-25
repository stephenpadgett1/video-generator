# Hellzapoppin' Live!: [VENUE NAME TBD]
## Shooting Script & Production Brief

A Hellzapoppin' installment in dialogue with Carroll Dunham's *Studio Visit* series (2023-2024). Two figures unsure whether they can be looked at, held inside a painted frame that has no such doubts.

Target runtime: 35-55s. Aim ~45s.

---

## Conceptual Frame

The piece operates on two layers with different pictorial codes:

- **Outer layer (the Frame).** A painted Dunham-style container — flat color fields, decisive black outlines, diagrammatic register. The venue. Stable. Confident in its own existence. The Hellzapoppin' banner is integrated into this frame's pictorial language, not floating above it.

- **Inner layer (the Scene).** Two figures inside the frame, rendered in a different pictorial register — looser line, more saturated, more painterly, more prone to drift. They are asymmetric to each other (one natural-colored, one purple/artificial) in the same way the inner scene is asymmetric to the outer frame.

The piece's subject is the figures' uncertainty about their own legibility. They are unsure whether they can be looked at. The frame is not unsure about anything.

---

## Production Principles

These are working rules. They apply to every prompt.

1. **Describe behaviors, not relationships.** Never write "the purple figure recoils because the natural figure looks at her." Write "the natural figure looks toward the purple figure; the purple figure becomes less resolved." Let Veo decide whether the events are causally linked. The relationship that emerges from the generation IS the piece's answer.

2. **Substrate proposes; we respond.** Each shot's prompt is informed by the previous shot's actual output, not the planned output. If Veo's interpretation of an earlier shot is strong in a particular direction, follow it. Adapt downstream prompts to honor what was actually generated. The "Notes" sections below flag where this matters most.

3. **The asymmetry of certainty between layers is the subject.** Anything that reinforces the gap between stable frame and drifting scene is good. Anything that closes the gap is bad. If a shot starts feeling too unified, push the inner scene looser.

4. **The outer frame stays stable across cuts.** It is generated once (or once per state, if it shifts). The inner scene is where time happens. In post, the frame is treated as a near-fixed compositing layer; the inner scene clips slot into it.

5. **Veo audio is unusable for dialogue.** All audio is replaced in post. Include audio notes in Veo prompts anyway (ambient texture, room tone) but assume the final track is ElevenLabs VO + Suno or ElevenLabs Music score.

---

## Layer Architecture & Composite Plan

**Outer Frame:** generated as a Nano Banana Pro plate. One stable painted image (possibly two if the final frame post-VO needs slight variation — see Shot 7 notes). Treated as a fixed composite layer in post. Claude Code handles compositing via ffmpeg.

**Inner Scene:** multiple Veo clips, deliberately looser anchoring than the TOUCH pipeline used. We *want* drift here. NBP anchors for character reference but not for every state — leave room for Veo to propose.

**Banner:** part of the outer frame plate. Painted into it in the frame's hand. The venue name is rendered as if a sign-painter executed it on the painted wall/sky/whatever the frame turns out to be.

**Composite approach:** the inner scene video sits within a designated inner region of the outer frame plate. The frame plate is the "wall" or "container"; the inner scene is the "scene being looked at." If the frame design has a clear inner region (like a literal painting-on-a-wall, a window, a proscenium), this is straightforward. If the frame is more landscape-like with figures occupying it directly, the composite is more about masking and layer-blending.

---

## Reference Assets (Nano Banana Pro)

Generate before any Veo work begins. These are the anchors.

### NBP-01: Outer Frame Plate

Painted Dunham-style interior or landscape, depending on venue choice. Flat color fields, thick black outlines, diagrammatic register. Should feel like a Dunham painting that has been emptied of its figures — a place waiting. Includes the banner with [VENUE NAME] integrated into the painted surface. A clearly delineated inner region where the scene will play out (this might be a defined area of the painted landscape, a painting-on-a-wall, a window-like cutout, or a stage-like proscenium — whichever the frame's design proposes).

Two variants:
- NBP-01a: empty inner region (for Shots 1, 7)
- NBP-01b: same composition with subtle inner-region indication that figures could be there (used if needed for transition smoothing)

### NBP-02: Natural Figure Character Sheet

Dunham-style cartoon figure, thick black outline, flat warm skin-tone color (beige/pink/ochre), simple schematic features, rounded head, neutral painted clothing in a single flat color. Front-facing and three-quarter views. This is the more resolved, more solid figure.

Reference: think Studio Visit's "natural" register figure — clearly painted, clearly cartoon, but feels like a body.

### NBP-03: Purple Figure Character Sheet

Same Dunham-style construction as NBP-02, but rendered entirely in saturated purple — skin and clothing both in the purple register, no separation. Same simple schematic features. Front and three-quarter views.

Reference: think Studio Visit's artificially-colored figure. The purple is total, not local. This figure looks like it was *imagined* by the painter rather than painted from anything.

### NBP-04: Inner Scene Anchor — Both Figures Resolved

Both figures present in the inner region of the outer frame, three-quarter turn toward each other, classical encounter blocking. Natural figure on one side, purple on the other. Both as clean as they will get. This is the anchor for "maximum resolution" — the state from which un-resolution will be measured.

### NBP-05: Inner Scene Anchor — Both Figures Un-resolved (Final State)

Same composition as NBP-04, but with significant transparency/breakdown in both figures. Purple figure further along than natural figure — barely a contour. Natural figure still readable but soft at edges. This is the end-state anchor.

**Note on figure character sheets:** keep them simple. The figures aren't meant to be character-development depth. They are painted figures that have stepped into the inner scene of a painting. Reference utility, not personality.

---

## Shot List

### SHOT 1 — Frame Establishment

**Runtime:** 4-5s
**Layer:** Outer frame only. Inner region empty.
**Source:** NBP-01a held as still, OR brief Veo pass to add minimal life.

**Action:** A held image of the painted venue. The banner reads [VENUE NAME]. Nothing else moves, or barely moves — a gradient breath, a line that thickens by a hair. The viewer registers this as a *place* before anything occupies it.

**If using Veo pass:**

> Painted interior in Dunham style: flat color fields, thick black outlines, [describe specific frame elements]. The painted banner across the top reads "[VENUE NAME]". The image holds nearly still — only the faintest breath of color shift across the painted surface. No figures. No camera movement. Ambient room tone.

**Notes:**
- The instinct will be to skip this and get to the figures. Resist. The held empty frame is what makes the later figure resolution legible as *appearing*.
- Avoid "static camera angle" language unless we genuinely want zero motion (per established Veo notes — that phrase tends to flatten things too much). "Holds nearly still" works better.
- If credit budget is tight, this can be NBP still with motion added in post.

---

### SHOT 2 — Figure Resolution

**Runtime:** 6-7s
**Layer:** Inner scene begins.
**Anchors:** Start frame = NBP-01a (empty inner region). End frame = NBP-04 (both figures resolved, natural more solid than purple).

**Action:** Two figures resolve into the empty inner region. They don't walk in — they assemble. Natural figure first and more completely. Purple figure later and less completely, edges still partially open.

**Veo prompt:**

> Inside a painted Dunham-style scene: an empty painted space. Two cartoon figures with thick black outlines gradually appear — first a figure in warm skin-tone color who comes into focus body-first, then a figure in saturated purple who appears more slowly and remains slightly translucent at the edges. Both figures end facing each other in three-quarter turn. Painted texture throughout. No camera movement. Ambient room tone.

**Notes:**
- This is the only shot where the outer frame is *narratively* doing something — being the empty space the figures arrive into. From here, the frame holds and the inner scene takes over.
- "Translucent at the edges" is doing important work. Watch the output for this. If Veo renders the purple figure as fully solid by the end, the asymmetry is gone and Shot 3 has to work harder. If Veo renders both figures as too translucent, the resolution wasn't strong enough to set up the un-resolution arc — push the next prompt toward more solidity.
- Trigger word check: "appears" should be fine. "Translucent" Veo handles reasonably well in painted styles.

---

### SHOT 3 — The First Look

**Runtime:** 6-7s
**Layer:** Inner scene.
**Anchors:** Start frame = end of Shot 2's output (the resolved state Veo actually produced). End frame = optional, let Veo decide.

**Action:** The figures are present. The natural figure turns its head toward camera. Eyes find the viewer. A brief stillness. Then the head turns away again, toward the purple figure. The purple figure, during this, holds its position but its edges fluctuate.

**Veo prompt:**

> Two painted Dunham-style cartoon figures in a painted scene. The natural-toned figure slowly turns its head toward the camera, eyes finding the viewer, holds for a moment, then turns its head back toward the purple figure. The purple figure stays in place during this, but its outline shimmers and partially dissolves at the edges. Thick black outlines, flat painted color. Static camera. Ambient texture, no dialogue.

**Notes:**
- **Critical adaptation point.** If Shot 2's output shows clear asymmetry between the figures (natural more solid, purple more open), this prompt is correct as written. If Shot 2 collapsed the asymmetry, rewrite to push it back: make the purple figure's edge-fluctuation more pronounced in language, and consider letting the natural figure's look be more direct/longer to compensate.
- **Relational ambiguity test.** Watch how Veo renders the purple figure's edge-shimmer relative to the look. If it reads as a *response* to being seen-near, we're in couple territory. If it reads as an independent event, we're in strangers territory. Note which. Adapt Shot 4 accordingly (see Shot 4 notes).
- "Eyes find the viewer" is a deliberately mild way to phrase looking at camera. "Looks directly at camera" tends to produce more aggressive head-snaps. We want this small.

---

### SHOT 4 — The Reach

**Runtime:** 6-7s
**Layer:** Inner scene.
**Anchors:** Start frame = end of Shot 3's output. End frame = let Veo decide.

**Action:** The natural figure begins to reach toward the purple figure. The arm extends. The hand at the end of the arm doesn't quite form correctly — the fingers are smudged, the contour incomplete. The gesture stops mid-way. The arm doesn't retract; it just stops.

**Veo prompt (relational-ambiguity-preserving version):**

> Two painted Dunham-style cartoon figures. The natural-toned figure slowly extends one arm toward the purple figure. As the arm reaches, the hand at its end loses definition — fingers smudge, the outline becomes incomplete, the form doesn't fully render. The arm stops in mid-air. The purple figure remains in place, edges still unstable. Painted texture. Static camera. Ambient room tone.

**Notes:**
- **Adapt based on Shot 3's relational reading.**
  - If Shot 3 read as *couple* (the purple figure's edge-shimmer felt caused by the look), this prompt can lean into causation: "the natural figure reaches toward the purple figure in a tentative gesture" — but DO NOT specify intent (comfort? confrontation? confirmation?). The gesture is just a reach.
  - If Shot 3 read as *strangers* (independent events), keep the prompt as written above, with the reach as a parallel event to the purple figure's instability rather than a response to it.
- The "hand fails to form" is the key Veo property in this shot. Veo's literal-mindedness about hands is well-documented (model is famously inconsistent with hands). We are RECRUITING that failure. If Veo renders the hand cleanly, the shot has worked against itself — regenerate.
- Audio note: prompt mentions "ambient room tone" but the final track will be silent or scored. The Veo audio is for output stability, not use.

---

### SHOT 5 — Mutual Reaction

**Runtime:** 6-7s
**Layer:** Inner scene.
**Anchors:** Start frame = end of Shot 4. End frame = let Veo decide.

**Action:** The natural figure registers the reach has failed. The arm doesn't retract — it dissolves slowly back into the body. The purple figure, in the same moment, pulls further into its un-resolution. Less of it is visible. The two figures are now responding to the same situation in some way, but the prompt doesn't specify whether they're responding to *each other* or to a shared awareness of being looked at.

**Veo prompt:**

> Two painted Dunham-style cartoon figures. The natural-toned figure's extended arm slowly dissolves back into the figure's body. Simultaneously, the purple figure becomes less defined — more transparent, edges further open, parts of the body barely visible. Both figures grow softer at the same pace. Painted texture, thick black outlines where the figures remain solid. Static camera. Ambient room tone.

**Notes:**
- This is the shot where the piece's emotional center lands or doesn't. If the figures' un-resolution feels like a *shared event* — like they are responding to the same condition — the piece works. If they look like they're randomly decohering, regenerate.
- Watch for the natural figure's face during dissolution. If Veo renders the face clearly while dissolving other parts, the figure starts reading as a portrait subject, which shifts the piece. We want the dissolution to be roughly even.
- "Both figures grow softer at the same pace" is doing important work. Without that, Veo tends to favor one figure's stability over the other.

---

### SHOT 6 — Un-Resolution

**Runtime:** 5-6s
**Layer:** Inner scene.
**Anchors:** Start frame = end of Shot 5. End frame = NBP-05 (both figures barely there).

**Action:** The figures complete their un-resolution. The purple figure becomes almost entirely transparent — a ghost of a contour. The natural figure remains slightly more present, but soft, indefinite, no longer holding a clear shape. They don't leave the frame. They just become harder to see.

**Veo prompt:**

> Two painted Dunham-style cartoon figures in a painted scene. The purple figure fades to a faint outline, barely visible, almost gone but still in position. The natural-toned figure remains more present but softens significantly — outlines blur, color flattens and pales, the figure becomes indefinite. Neither figure moves from their position. The painted background stays the same. Static camera. Ambient room tone.

**Notes:**
- This is the "resolution that isn't one." They haven't left. They just are not quite visible. Watch that Veo doesn't move them out of frame — "neither figure moves from their position" is critical language.
- If the purple figure has been read as the "more present" figure in any prior shot due to a Veo interpretation, swap which figure does what here. The piece needs ONE figure pulling further into invisibility and ONE figure remaining barely visible. Which one is which can flex based on what Veo has actually produced.

---

### SHOT 7 — Final Frame Hold + Optional VO

**Runtime:** 4-6s
**Layer:** Mostly outer frame. Inner scene almost empty.
**Source:** End of Shot 6 held, OR composite of NBP-01a (empty frame) with very faint ghost-traces of where the figures were.

**Action:** The frame remains. The figures are barely there or gone entirely. The venue still exists. The painted banner still reads [VENUE NAME]. Optional VO line spoken near the end, against the held image.

**VO direction (placeholder line — final choice TBD):**

Candidate lines, all read flat and declarative, no warmth, no inflection:

- *"We were here. We think."*
- *"You can stop looking now."*
- *"[VENUE NAME]."* — just the venue name read aloud, as a label.
- *"There's nothing to see."*

Pick one. The line should pass the relational-ambiguity test: it could be said by a couple, by two strangers, or by the frame *about* its occupants. If a line forces a relational reading, it's wrong.

ElevenLabs voice: flat, neutral, no character. Use whatever house voice the series has settled into (or whichever voice was used in earlier installments — check repo).

**Notes:**
- The line, if used, lands in the last 2-3 seconds. The first 2-3 seconds of this shot should be silent except for any score/ambient bed.
- This shot can be the longest if the held image is doing work; can also be the shortest if the piece wants to end abruptly after the line.

---

## Audio & Score

- **Dialogue:** none, except possibly the single VO line at the end (Shot 7). All Veo audio discarded.
- **Score:** the piece wants a score that holds steady the way the frame does. A drone, a slow-moving harmonic bed, something that has the same confidence-about-existence the frame has. Suno or ElevenLabs Music. The score does NOT respond to the inner scene's drift — it stays where the frame stays. The mismatch between the score's stability and the figures' instability reinforces the layer asymmetry.
- **Ambient:** a faint room tone or painted-air ambience can run under the score throughout. Helps the painted world feel like a *place*.
- **VO mix:** if the final line is used, it sits clearly above the score. Brief duck on the score under the line.

---

## Post-Production Notes (Claude Code)

- **Compositing:** outer frame plate (NBP-01a) as base layer, inner scene Veo clips composited into the inner region. Inner region needs a mask. If the frame design defines the inner region clearly (literal painting-within-painting, window cutout), the mask is geometric and easy. If the frame is more landscape, the mask is feathered.
- **Transitions:** straight cuts between inner scene clips. NO dissolves between Veo clips — the figures' un-resolution within shots is doing the dissolve work; adding dissolves between shots would muddy that. The cuts can be on action (mid-gesture) to keep continuity feeling earned despite Veo drift.
- **Stabilization:** if any Veo clip has unwanted camera drift, stabilize it. The frame is the only stable thing; we don't want the inner scene's camera competing with the frame's stillness.
- **Color:** match the inner scene's painted color register to the frame's, but don't over-correct. Some color drift between Veo generations is acceptable and even desirable — it reinforces that the inner scene is a less-stable kind of painted.
- **Banner:** if any clip drifted the banner text, re-composite the original NBP plate's banner on top.

---

## Credits Block (for video description)

Honest, specific. Following series convention. Final wording at delivery:

- Concept and direction: Stephen / a][ productions
- Production tools: Google Veo (via Flow), Nano Banana Pro, ElevenLabs, [Suno or ElevenLabs Music], Claude Code with ffmpeg
- Reference: Carroll Dunham, *Studio Visit* series (2023-2024), and the painted figures and worlds of his broader practice
- Creative collaboration: Claude Opus 4.7 (concept development, brief, shot prompts)

---

## Open Questions / Hold For Decision

1. **Venue name.** Punted per direction. Should be chosen before NBP-01 generation (the banner is part of that plate).
2. **Frame design specifics.** Interior (painted room, wood floor — calling back to wood veneer)? Landscape (horizontal bands, sky/ground)? Painting-on-a-wall (literal frame-within-frame)? Each implies a different inner-region mask shape for compositing. Decision affects NBP-01 generation.
3. **VO line.** Four candidates above. Or none.
4. **Final cut runtime target.** 35s, 45s, 55s — affects how long Shots 1 and 7 hold.
