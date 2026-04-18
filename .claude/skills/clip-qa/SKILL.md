---
name: clip-qa
description: Scan a generated video clip for visual anomalies (object materialization, ghost limbs, morphing, impossible trajectories, flicker) using Claude vision. Use after any Veo generation and before splicing — catches the kind of glitch that ffmpeg's scene/freeze/black-frame detectors miss.
allowed-tools: Read, Bash
---

# Clip QA

Veo and similar generators occasionally produce glitches that look smooth in motion but fall apart when you examine frames — a mop that flies into a hand without a thrower, fingers that merge, objects that flicker in and out. These can't be caught with ffmpeg metrics; they require actually looking at the clip.

This skill extracts frames at a consistent cadence, composites them into a labeled grid, and has Claude vision describe what's wrong (if anything). Output is structured JSON — anomaly timestamps + recommended clean ranges — which plugs directly into the splice workflow.

## When to use

- **After every Fast draft**, before deciding whether to commit to Quality. High-severity glitches in the draft → iterate the prompt, don't spend on Quality yet.
- **After every Quality render**, before splicing. Catches whatever Veo varied between the draft and the quality version.
- **Before splicing** any set of clips. Ensures bar-normalized + anomaly-scanned clips before they go into the edit.
- **When the user says "something looks weird"** — the tool localizes "weird" to a timestamp range.

## Quick start

```bash
# Basic scan (Opus is default; worth it for correctness)
python3 tools/clip-qa.py data/workspace/shotB.mp4

# Always pass context if you have the generation prompt — it cuts false positives dramatically
python3 tools/clip-qa.py data/workspace/shotB.mp4 \
  --context="Wide shot of the janitor reacting to an empty wall. No mop visible."

# Or pass the prompt as a file
python3 tools/clip-qa.py data/workspace/shotB.mp4 --context-file=/tmp/shotB_prompt.txt

# CI / automation: fail the process if any high-severity anomaly detected
python3 tools/clip-qa.py data/workspace/shotB.mp4 --context-file=... --fail-on=high --json
# exit 3 → block downstream, regenerate
# exit 0 → proceed to Quality / splice

# Cheap first-pass scan (Sonnet is ~4× cheaper but misses some glitches with context — see below)
python3 tools/clip-qa.py clip.mp4 --model=sonnet --context-file=...
```

## Flags

| Flag | Default | Purpose |
|---|---|---|
| `--frames=N` | `dur/0.3` (8–24 cap) | Frame count. Denser = more precise, but larger composites cost more tokens. |
| `--model=opus\|sonnet\|haiku` | `opus` | Claude model shortcut. Opus is the correctness default. |
| `--model-id=ID` | — | Override with a full model ID (e.g., `claude-opus-4-6-20260115`). |
| `--context=TEXT` | — | Intent context. Normally the generation prompt. Strongly recommended. |
| `--context-file=PATH` | — | Same as `--context`, read from a file. |
| `--save-strip=PATH` | `<video>.qa-strip.png` adjacent | Save the frame composite. Inspect this when a flag is ambiguous. |
| `--no-save-strip` | — | Don't save the strip. |
| `--json` | false | Emit JSON only, suppress human summary. |
| `--fail-on=LEVEL` | — | Exit 3 if any anomaly at severity LEVEL or above is detected. Values: `high`, `medium`, `any`. |
| `--retries=N` | 3 | API retries on transient errors (429, 5xx, 529). |
| `--config=PATH` | `data/config.json` | Override config (for `claudeKey`). |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. No anomalies at or above `--fail-on` threshold, or `--fail-on` not set. |
| 1 | Internal failure (API error after retries, file not found, etc.). |
| 2 | Usage error (bad flags). |
| 3 | Anomalies detected meeting `--fail-on` threshold. |

## Output format

```json
{
  "subject_action": "one-sentence summary of what happens",
  "anomalies": [
    {
      "timestamp_range": [0.15, 0.75],
      "severity": "high",
      "description": "A mop handle materializes in the janitor's hand at t=0.15s then vanishes by t=0.75s."
    }
  ],
  "clean_ranges": [{"start": 2.86, "end": 5.87}],
  "recommendation": "use_as_is | trim_to_clean | regenerate",
  "_meta": { "video": "...", "duration": 6.02, "frames_analyzed": 20, "interval_seconds": 0.301, "model": "...", "strip": "..." }
}
```

`clean_ranges` maps directly to a trim operation:

```bash
start=2.86; end=5.87
ffmpeg -ss $start -i shotB.mp4 -t $(python3 -c "print($end - $start)") \
  -c:v libx264 -crf 16 -c:a aac shotB_trimmed.mp4
```

## Model selection

- **`opus`** (default) — highest accuracy on subtle glitches, correctly distinguishes intentional state changes from materialization when given context. ~$0.04–0.08 per clip at typical frame counts.
- **`sonnet`** — ~4× cheaper and faster, but in my testing **missed a real Veo mop-materialization glitch when context was provided**. Treat Sonnet results as advisory; escalate to Opus for any clip that needs to be trusted.
- **`haiku`** — untested for this task; too aggressive compression of visual detail likely makes it unreliable.

**Heuristic for budget-conscious batches:** run Sonnet with `--fail-on=any`. For any clip it flags, re-run with Opus to confirm. Clips Sonnet considers clean may still have subtle glitches — if stakes are high, run Opus on everything.

## Always pass `--context` when possible

Context dramatically reduces false positives by telling Claude what the clip is *supposed* to show. The simplest useful context is the generation prompt verbatim:

```bash
python3 tools/clip-qa.py clip.mp4 --context-file=/tmp/shot_prompt.txt
```

Without context, Claude may flag deliberate state changes (a mop going from hand to wall during a placement action) as glitches. With context, it reliably distinguishes those from real anomalies.

**Make the context specific about what should / shouldn't be present.** If the shot is a reaction to an absence ("wall is empty — no mop"), say so. Claude uses the negative as strongly as the positive.

## What it catches reliably

- **Object materialization / vanishing** without a plausible source or exit (the canonical Veo glitch).
- **Ghost / partial objects** — things flickering, half-rendered, transparent.
- **Impossible trajectories** — objects flying between positions without continuous motion.
- **Object count changes** — items that split, fuse, or multiply unexpectedly.
- **Anatomical anomalies** — extra/missing limbs, merged fingers, limbs clipping through solids.

## Known limitations

- **Background props becoming visible by character motion may be flagged as "materializing."** If the plate has a crate or lamp that's initially behind the character and becomes visible when they move, Claude sometimes reads that as an anomaly. Mitigation: include persistent background details in the context string ("a crate with a reading lamp sits near the back door throughout the shot"), or ignore low-severity anomalies in the output.
- **Severity is somewhat variable** — the same glitch may be rated "high" on one run and "medium" on another. Trust *presence* of anomaly more than the specific label. For automation, `--fail-on=any` is more reliable than `--fail-on=high`.
- **Single-clip only** — doesn't compare across shots. Continuity breaks *between* shots are the splice tool's job.
- **Cadence tradeoff** — very brief glitches (<0.1s) between samples may be missed. Increase `--frames` if you suspect sub-100ms artifacts.
- **Semantic fuzziness** — Claude may call a mop a "broom" or "cleaning tool." Use the timestamps, not the object names, for downstream automation.

## Integration with other skills

- **`veo-draft`** — scan every Fast draft before committing to Quality. If `--fail-on=high` triggers, iterate the prompt rather than spending on Quality.
- **`splice`** — scan both inputs before splicing. Normalize bars first (`normalize-clip`) so geometry is already consistent when you scan. Use `clean_ranges` to drive `--cut-b` trims.
- **`frame-edit`** — after generating a Veo continuation from an edited handoff frame, scan it. A mis-interpreted reference can produce glitches at the start of the clip.
