---
name: book-end
description: Generate a Veo clip as an animation between two nano-banana poster frames. Every clip is bracketed by a first-frame and a last-frame so character, wardrobe, environment, and prop state stay locked across the clip. Use for any shot where drift would be visible — object continuity gags, multi-shot sequences, multi-take dialogue, and anything the viewer will watch carefully. Pair each poster frame with a frame-qa check before submitting to Veo.
allowed-tools: Read, Bash, Glob
---

# Book-end

Every Veo clip in this workflow is an animation between two poster frames: a first-frame (`firstFramePath`) and a last-frame (`lastFramePath`), both generated via nano-banana from the canonical plate + character lock. Veo interpolates the motion between them from the prompt.

Why this works:
- Character wardrobe, environment, lighting, and prop state are locked by the poster frames. Veo can't drift within a clip.
- Cuts between shots land on identical boundary frames (or near-identical) so splices look mechanical, not negotiated.
- Each shot's motion is bounded and testable — you can see the endpoints before spending a Veo generation.

This skill codifies the pattern. When to use it, how to generate frames that behave, how to check them, how to submit the Veo call, and the failure modes to watch for. Book-ending has been validated twice (2026-04-19): a simple bucket-lift mechanics test, and a three-shot bucket-gag sequence.

## When to use

Use book-end when:
- **Multi-shot sequences** — any time a gag or scene spans more than one Veo clip. The alternative (single-anchor, no last-frame) produces uncontrolled drift at cuts.
- **Object continuity matters** — the viewer will notice if a prop moves, multiplies, or disappears.
- **Multi-take dialogue** — long dialogue split into takes; each take animates between a start and end pose.
- **Repeatable reference** — when the same shot might be regenerated later and should land in the same place.

Skip book-ending when:
- The clip is a one-off establishing shot with no continuity neighbors.
- The motion is so extreme that two distinct endpoints don't describe it (e.g. a fast camera move that orbits 360°).
- You're iterating cheaply on a single-beat draft where drift doesn't matter yet.

## The three principles (hard-won)

### 1. Nano-banana chaining locks pose; it doesn't evolve it

When you generate a new frame and pass a prior frame as the reference, nano-banana preserves the prior pose almost pathologically. Great for "same pose, different detail" (adding/removing a prop, tweaking expression). **Bad for "new pose, same everything else"** — the character will refuse to move even with an explicit 90° rotation prompt.

**How to choose:**
- **Chain** (ref = prior frame) when: adding or removing an object in the scene, tweaking an expression, changing a held object, making any edit that does NOT change the character's stance or body angle.
- **Regenerate fresh** (refs = original plate + character lock) when: the character needs a meaningfully different pose, body angle, or position in the frame. Describe the new pose from scratch.

**Symptom that you should have regenerated instead of chained**: after 2 tries, the character pose looks nearly identical to the reference despite explicit prompting for change.

### 2. Prop positions must be pixel-precise across endpoint frames

Veo can't extrapolate "the same bucket" from two endpoints — it only interpolates pixels. If a prop is at position X in the first frame and position Y in the last frame (even when the intent was for it to stay put), Veo will animate the prop sliding from X to Y, regardless of whether that makes physical sense. The classic failure: bucket at feet in frame A, bucket slightly behind heels in frame A'; Veo animates the bucket floating backward while the character turns.

**How to apply:** when a prop is supposed to stay locked across the book-end, verify its position in the generated frames is effectively identical. Frame-qa catches this. If frame-qa flags `prop_position` drift, regenerate the frame.

### 3. Endpoint distinctness scales linearly to motion visibility

If your two endpoint frames look nearly identical, the resulting Veo clip will be nearly static no matter what the prompt asks for. If you want a visible gesture (a double-take, a reach, a head-turn), the endpoint frames must differ on that specific gesture in a way the eye catches. A hand-to-chin gesture in the last frame, for example, produces a visible reaction arc; a subtle eyebrow shift produces a near-still clip.

**How to apply:** when generating the last frame, lean into pose extremity. Better to overshoot the gesture and let Veo produce a clean movement than undershoot and get a static clip.

## Two supporting rules

- **Avoid tight clusters of identical objects** in either frame. Veo re-reads the cluster during interpolation and frequently produces a different count. Space objects with clear gaps. (Observed: 3 tightly-clustered buckets in a first-frame → 4 buckets in the Veo output.)
- **Plate hygiene**: when generating a frame from the plate, name canonical elements to *preserve* explicitly in the prompt (e.g. "plain wooden slat wall — no tools hanging", "red velvet curtain screen-right"). Prose without this easily invents props that aren't in the plate. See `feedback_nano_banana_canonical_refs.md`.

## The workflow

For each shot in a sequence:

### 1. Describe the shot in plain terms

Before generating anything, write down:

- **Beat**: what happens in the shot, in one sentence.
- **Duration**: 4, 6, or 8s (Veo-legal).
- **Start pose**: where the character is, how they're angled, what they're doing, what's in the scene.
- **End pose**: where the character has moved to, what has changed in the scene (bucket count, lit object, etc).
- **What is locked** across start and end: wardrobe, environment, prop positions that should NOT change.
- **What is changed** between start and end: the intended motion / state change.

### 2. Generate the first frame

Use `tools/nano-banana.cjs` with the canonical refs (character + plate) and a prompt that:
- Names what to preserve from each ref explicitly.
- Describes the start pose from scratch.
- Explicitly rejects known drift modes (e.g. "no overalls, no t-shirt, no apron — suspenders over shirt only").

Check the frame with `frame-qa` before moving on:

```bash
python3 tools/frame-qa.py <generated_frame.png> \
  --ref=<character_ref.png>:character \
  --ref=<plate.png>:plate \
  --preserve="<what from the refs must match — wardrobe, environment, lighting>" \
  --change="<how the frame differs from the refs — pose, position, props>" \
  --fail-on=high
```

If frame-qa returns `verdict: reroll`, regenerate the frame with a prompt adjusted to address the specific issues.

### 3. Generate the last frame

Two modes, based on principle (1):

- **If only non-pose details change** (object removed, added, minor expression): chain from the first frame. `--ref=<first_frame>`. Describe what changes, preserve the rest.
- **If the pose, body angle, or position changes meaningfully**: regenerate fresh from the same plate + character refs (not chained from the first frame). Describe the new pose from scratch.

Check with `frame-qa`, passing the first frame as the prior reference:

```bash
python3 tools/frame-qa.py <last_frame.png> \
  --ref=<first_frame.png>:prior \
  --preserve="<what should be locked between first and last — wardrobe, environment, prop positions>" \
  --change="<the intended motion / state change between first and last>" \
  --fail-on=high
```

Principle (2) lives here — if the prop was supposed to stay locked, frame-qa will catch position drift. Principle (3) also lives here — flag weak changes under `change_findings.status = weak`.

### 4. Submit the Veo call with both anchors

```
Tool: submit_veo_generation
Args: {
  "prompt": "<motion description, weighted toward what happens mid-clip>",
  "firstFramePath": "<first_frame.png>",
  "lastFramePath":  "<last_frame.png>",
  "aspectRatio": "9:16",
  "durationSeconds": 4 | 6 | 8,
  "model": "veo-3.1-fast-prod",   // or veo-3.1-prod for Quality
  "resolution": "720p",           // or 1080p for Quality
  "generateAudio": false          // disable on drafts unless you need dialogue
}
```

**Veo prompt guidance for book-ended clips:**
- The prompt's job is to describe the *motion* between the two anchors, not re-describe the frames themselves.
- Lead with the transition ("the janitor turns from 3/4 to full profile"), not the static setup.
- State explicitly what does NOT move or change (camera, props that should stay put, the lighting).
- Keep the prompt tight — Veo uses the anchors as strong constraints; flowery prose often dilutes.

Poll with `check_veo_status`, download, and run `clip-qa` on the result. If clip-qa flags anomalies, the first response is usually to inspect: did Veo interpolate a prop drift (meaning the anchors disagreed)? If so, fix the frames, not the prompt.

### 5. Splice the clips

Hard cuts between shots work well because the anchor frames are close to (or identical to) the cut boundaries. Use the `splice` skill if a seam needs geometric alignment; use a plain concat if shots are hard-cut and the framings differ (e.g. wide → CU → wide masks drift through angle change).

Book-end assumes shots are normalized to the same bars/aspect before splicing — run `normalize-clip` if generator output has inconsistent letterbox.

## Common failure modes (and what to do)

| Symptom in final video | Root cause | Fix |
|---|---|---|
| A prop slides across frame unnaturally during a character motion | Prop position drifted between the two anchors | Regenerate the last frame with the prop pinned to the first-frame position |
| The character barely moves despite a motion prompt | Anchors are too visually similar | Regenerate the last frame with a more extreme pose |
| Object count changes (3 buckets become 4) | Tight cluster in an anchor | Regenerate with clear spacing between objects |
| Character wardrobe changes mid-clip | This doesn't happen with book-ending. If it does, the anchors drifted — check frame-qa on both ends | — |
| Clip starts with ~0.5s of "entrance" motion (door opening, character stepping in) | First-frame anchor was probably missing, Veo invented the entrance | Always pass a `firstFramePath` |
| RAI filter trip on submission | First-frame anchor reads as a near-portrait of a specific person | Regenerate the frame with the character embedded in the scene (mid-wide, scene props visible, body angled) — see `feedback_veo_filter_behavior.md` |

## Interaction with other skills

- **nano-banana** generates the frames. Book-end is its primary downstream consumer.
- **frame-qa** validates each generated frame before it becomes an anchor. This is the pre-Veo gate.
- **veo-draft** applies to the Veo submission itself (draft at Fast/720p, commit to Quality). Book-end is the *frame-generation* layer; veo-draft is the *Veo-iteration* layer. They compose.
- **frame-edit** is for localized pixel edits (remove mop, add prop) on an existing frame via Imagen inpaint — use it to produce a modified anchor without regenerating the full frame.
- **clip-qa** validates the resulting Veo clip. Run after download.
- **splice** / **normalize-clip** are for the downstream assembly layer.
- **edit_image** (Imagen inpaint) is the tool for localized frame surgery; nano-banana is the tool for full-frame regeneration from refs. Choose based on the scope of the change.

## Cost accounting

Per shot, book-ending adds:
- ~2 nano-banana calls (Pro at ~$0.13/image @ 1–2K) = ~$0.26 in frame gen
- 1 Veo call (Fast 4s 720p = $0.60; Quality 8s 1080p = $3.20)

Frame-qa calls are Claude API, cheap (~$0.02 per call with Opus + 2 refs).

A 3-shot gag (2 frames × 3 shots + 3 Veos) at Fast = ~$2.60.  At Quality = ~$11. Frame re-rolls are the cheap lever; avoid Veo re-rolls.
