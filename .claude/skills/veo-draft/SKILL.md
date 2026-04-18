---
name: veo-draft
description: Cost-aware iteration workflow for Veo shot generation. Draft on the Fast model at low resolution to validate prompt, blocking, and continuity, then commit the approved shot to Quality. Use for any shot that is prompt-sensitive or unfamiliar — gags, physical comedy, character interactions, complex actions, new environments. Not every shot needs this workflow, but when iteration is likely, it saves money and tightens the feedback loop.
allowed-tools: Read, Bash, mcp__video-generator__submit_veo_generation, mcp__video-generator__check_veo_status, mcp__video-generator__extract_frame
---

# Veo draft-then-quality workflow

Veo generations vary — same prompt, different seeds, different frames. Landing a prompt-sensitive shot usually takes 3–6 iterations. Running all of those at Quality is wasteful. Drafting on Fast first lets you burn through prompt variations cheaply, then commit to Quality only once the blocking is approved.

## Pricing (from the MCP)

| Model | Cost per second (audio on) |
|---|---|
| `veo-3.1` / `veo-3.1-prod` | **$0.40** |
| `veo-3.1-fast` / `veo-3.1-fast-prod` | **$0.15** (62% cheaper) |

Disabling audio (`generateAudio: false`) saves additional cost on drafts. Exact discount isn't published; estimate 15–25%.

## Duration: 4 / 6 / 8 only

Veo 3.1 supports **4, 6, or 8 second** clips. **Other values silently snap to the nearest supported duration** — pass 5s and you get 4s, pass 7s and you get 6s or 8s depending on how it rounds. Always pass 4, 6, or 8 explicitly.

**Default to the shortest duration that fits the action.** A gag beat often lands cleanly in 4s. Medium actions (a turn + reaction + small gesture) fit 6s. Reserve 8s for shots where Veo genuinely needs time to develop motion.

Cost per clip at each duration:

| Duration | Fast | Quality |
|---|---|---|
| 4s | $0.60 | $1.60 |
| 6s | $0.90 | $2.40 |
| 8s | $1.20 | $3.20 |

**On entrance artifacts:** Veo tends to add ~0.5–1s of unwanted "entrance" motion at the start of a clip (character stepping into frame, door opening). At 4s this eats ~20% of the clip. Pass a reference image as `referenceImagePath` to pin the first frame — that largely prevents the entrance invention.

## The workflow

### 1. Plan the shot

Before drafting, decide:

- **Action description** (what happens, in what order)
- **Duration** (4 / 6 / 8)
- **Reference image** (environment plate, handoff frame from prior shot, character ref) — almost always needed for continuity
- **End state** (if tight: pass `lastFramePath`; if flexible: omit)
- **Target resolution for final** (720p / 1080p / 4k) — drives the Quality call, not the draft

Write the prompt. Keep it tight — shorter clips benefit from tighter prompts.

### 2. Draft on Fast

```json
{
  "prompt": "<prompt>",
  "referenceImagePath": "<plate or handoff frame>",
  "model": "veo-3.1-fast",
  "resolution": "720p",
  "generateAudio": false,
  "durationSeconds": 4
}
```

Submit via `submit_veo_generation`, poll with `check_veo_status`. Review the result.

### 3. Scan for glitches (clip-qa)

Before doing anything else with the draft, run `clip-qa` on it. Pass the generation prompt as context so Claude knows what was supposed to happen:

```bash
python3 tools/clip-qa.py data/workspace/draft.mp4 \
  --context-file=/tmp/shot_prompt.txt \
  --fail-on=high
```

If high-severity anomalies are flagged (e.g., objects materializing, ghost limbs, impossible trajectories), **iterate the prompt before committing to Quality** — don't spend Quality money on a draft that's already broken. Frequently the glitch will reproduce on Quality with the same prompt. Refine the description (especially negatives — "no mop visible", "hands empty") and re-draft.

If the anomalies are localized to a prefix/suffix (`clean_ranges` covers the middle), the draft may still be usable after a trim — but verify the clean region reads as intended before committing.

### 4. Iterate on prompt (if needed)

If blocking is off (wrong motion, wrong staging, wrong pacing) — or if clip-qa flagged anomalies that look prompt-driven — **rephrase the prompt** and re-draft. Common fixes:

- **Wrong entrance/exit direction:** specify "already in frame" / "does not leave frame"
- **Too much movement:** "static camera, character performs X in place"
- **Too little movement:** break down the action into explicit beats
- **Wrong object state:** include it in the prompt even if it's in the reference ("empty wall", "three buckets lined up")
- **Wrong pacing:** "slowly", "briskly", "with a beat of hesitation"
- **Recurring object glitches** (e.g., tools materializing): add an explicit negative — "no tools appear in the janitor's hands" — and specify exactly what IS in the hands

Drafts are cheap — 3–5 is normal, and each iteration improves the prompt for the eventual Quality call.

Avoid "seed hopping" as a way to iterate. Changing the seed without changing the prompt just rerolls; it rarely fixes a structural prompt issue.

### 5. Commit to Quality

Once a draft lands (blocking approved, clip-qa clean), regenerate on the Quality model:

```json
{
  "prompt": "<same prompt>",
  "referenceImagePath": "<same reference>",
  "model": "veo-3.1",
  "resolution": "1080p",
  "generateAudio": true,
  "durationSeconds": 4
}
```

**Seed portability is unreliable between Fast and Quality.** They are different model weights — same seed + same prompt gives *similar* but not *identical* output. Expect the Quality render to differ in minor framing, motion pacing, or detail. Budget **1 re-roll at Quality per shot**.

### 6. Verify against draft

When the Quality render lands, compare it to the approved draft. Check:

- Same general blocking (entrance direction, action order, ending state)
- Same framing/composition (within Veo's variance)
- No regressions (an artifact the draft didn't have, a prompt element Veo is now ignoring)

If it deviates meaningfully, re-roll (one more Quality call) or fall back: sometimes the draft was actually the better take, and the Quality render introduces weirdness. If the draft is at 720p and you need 1080p/4k, the `upscale` skill can bridge.

## When to use / when to skip

| Use draft-first when | Skip to Quality directly when |
|---|---|
| Shot is prompt-sensitive (gags, physical action, object interactions) | Routine shot, established prompt pattern |
| First time generating this kind of shot | Minor variation of an already-landed shot |
| Unsure about duration or blocking | You have a known-good seed for the Quality model |
| Multiple iterations expected | Single shot, time-critical |

For a rough heuristic: **if you'd guess ≥3 iterations to land, draft first**. Break-even is around 3 Quality tries vs ~5 Fast drafts + 1 Quality final.

## Shot chaining

When shot B follows shot A:

1. Finish shot A entirely (draft → iterate → Quality → approved).
2. Extract the handoff frame from **the final Quality version of A** (not from a draft).
3. Optionally edit the handoff frame via `frame-edit` if the shot calls for a state change.
4. Pass the (edited) handoff frame as shot B's `referenceImagePath`.
5. Repeat the draft-first workflow for shot B.

This is strictly sequential — don't draft shot B from shot A's draft and then swap in the Quality later. The handoff frame changes subtly between draft and Quality, and shot B's continuity anchors to whichever frame you used.

## Interaction with other skills

- **`nano-banana`** — generate/iterate on the reference image (plate, character, environment) before any Veo drafts.
- **`clip-qa`** — scan every draft and every Quality render for visual glitches. Non-optional step — Veo glitches (materializing objects, anatomy issues) are not visible as metadata problems and will survive to the final edit if not caught here.
- **`frame-edit`** — edit a handoff frame between shots (object removal/addition) for continuity gags.
- **`splice`** — stitch the approved Quality shots together with a seamless cut.
- **`normalize-clip`** — normalize bar widths if combining shots from different generators.
- **`analyze-clip`** — structural QA (freeze frames, black frames, dialogue accuracy). Complements `clip-qa`, which handles semantic/visual glitches.

## Quick reference: the full shot cycle

```
[plan shot]
   ↓
[draft on Fast, 720p, audio off, shortest duration]
   ↓
[clip-qa draft --context=<prompt> --fail-on=high]
   ↓  (clean or only low-severity)
[review blocking — accept / iterate prompt / reference tweak]
   ↓  (accepted)
[Quality on Standard, target resolution, audio on]
   ↓
[clip-qa Quality --context=<prompt>]
   ↓  (clean)
[verify vs draft; 1 re-roll budgeted]
   ↓
[shot locked — move to next, using this shot's final frame as handoff if chaining]
```

Costs for a 4-shot sequence of 4s clips, estimated with 4 drafts + 1–2 Quality renders per shot:

- Drafts: 16 × $0.60 = **$9.60**
- Quality: 5–8 × $1.60 = **$8–13**
- **Sequence total: ~$18–23**

Compare to all-quality at ~4 attempts per shot: 16 × $1.60 = **$25.60** with no feedback-loop benefit.

## Ask for help

This workflow isn't fully autonomous. Ask the user to review drafts directly when:

- The prompt iteration is diverging — you've tried 3+ variations and blocking still isn't landing
- There's ambiguity in the intent (was the action supposed to read as X or Y?)
- Before committing to Quality on an expensive shot (8s, 4k)
- When the draft is "close but off" in a way that's hard to put into words

The user knows the scene's intent better than Veo ever will; escalate early.
