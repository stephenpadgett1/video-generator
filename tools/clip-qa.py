#!/usr/bin/env python3
"""
clip-qa.py — scan a video clip for visual anomalies via Claude vision.

Use after any Veo generation (or before splicing) to catch object-continuity
glitches, physics violations, morphing, flicker — the kind of failures that
don't show up in ffmpeg's scene/freeze/black-frame detectors.

Strategy: extract N frames evenly spaced across the clip, composite them into
a labeled grid image, send to Claude with a vision prompt asking for anomaly
identification + clean-range recommendations. Returns structured JSON.

Usage
  python3 tools/clip-qa.py <video> [flags]

Flags
  --frames=N           Number of frames to extract (default: dur/0.3, 8–24).
  --model=opus|sonnet  Shortcut for Claude model (default: opus).
  --model-id=NAME      Full Claude model ID (overrides --model).
  --save-strip=PATH    Save the frame composite (default: adjacent to video as <name>.qa-strip.png).
  --no-save-strip      Don't save the composite at all.
  --json               Emit JSON to stdout; suppress human summary.
  --config=PATH        data/config.json override (for claudeKey).
  --context=TEXT       Intent context (usually the generation prompt).
  --context-file=PATH  Read intent context from a file.
  --fail-on=LEVEL      Exit non-zero if any anomaly at or above severity LEVEL (high | medium | any).
  --retries=N          API retries on transient errors (default: 3).

Exit codes
  0 — no anomalies at or above --fail-on
  1 — internal/API failure
  2 — usage error
  3 — anomalies detected meeting --fail-on threshold (only if --fail-on used)
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print(json.dumps({"error": "Missing Pillow: pip install Pillow"}))
    sys.exit(1)


# Claude model shortcuts — update as newer versions ship.
MODEL_SHORTCUTS = {
    "opus": "claude-opus-4-5-20251101",
    "sonnet": "claude-sonnet-4-5-20250929",
    "haiku": "claude-haiku-4-5-20251001",
}


CONTEXT_PREFIX = """INTENT CONTEXT — what this clip is supposed to show:
{context}

Use the above intent to distinguish DELIBERATE state changes (intended by the prompt) from GENUINE glitches. A mop going from a hand to leaning on a wall is deliberate if the prompt describes placing the mop. A tool materializing in an empty hand mid-reaction is a glitch.

"""


ANOMALY_PROMPT_TEMPLATE = """{context_block}You are looking at a grid of frames extracted from a single continuous video clip. The frames are shown in chronological order, left-to-right, top-to-bottom. Each frame is labeled with its timestamp (e.g., "t=1.50s").

## Sampling context
- Frames are sampled every {interval:.2f} seconds. Significant motion happens BETWEEN samples that you cannot see.
- People can walk, bend, turn, reach, rotate, crouch — or finish an action and start another — in the gap between two consecutive frames. This is NORMAL continuous motion, not a glitch.
- A person facing the wall in one frame and bent over a bucket in the next is fine. A bucket being held in one frame and resting on the floor in the next is fine. A hand in one position shifting to another is fine.
- Focus on OBJECT IDENTITY and CONTINUITY, not pose or position changes.

## Flag ONLY these AI video generation glitches

1. **Objects materializing from nothing** — an item visible in a frame with NO plausible source. It didn't enter from off-screen, wasn't held, wasn't on a nearby surface. It just appears.
2. **Objects vanishing into nothing** — an item present, then simply gone with no exit from frame, no hand-off, no falling.
3. **Partial or ghost objects** — partially rendered, transparent, half-formed, flickering in and out.
4. **Impossible trajectories** — an object traveling without a thrower or destination, or snapping between positions without a continuous path.
5. **Object count inconsistency** — an object that multiplies, splits, or fuses between frames without a narrative reason.
6. **Anatomical anomalies** — extra or missing limbs/fingers, limbs fusing together, body parts clipping through solid objects.
7. **Identity swaps** — a character or object transforming into a visibly different character or object.

## Do NOT flag

- Normal motion (walking, turning, bending, reaching, crouching, standing up).
- Object position changes caused by normal interaction (picking up, setting down, adjusting).
- Lighting / shadow shifts, flickering practical lights.
- Camera motion, if present.
- Minor texture or detail variation between frames (re-encoding artifacts).
- Anatomy fluctuations within normal human variation (a slightly different posture, shoulder tension, head angle).
- **Background props that become visible in later frames due to the character or camera moving**. If the object plausibly could have been there the whole time but was occluded by the character / obscured by shadow / outside the visible focal area — assume it was. Only flag "materialization" when you can clearly confirm the space where the object would have been was empty in earlier frames. If uncertain, DO NOT flag.

## Severity rubric

- **high** — the glitch is obvious on casual viewing and would ruin the shot. Example: a tool materializes in an empty hand.
- **medium** — the glitch is visible if a viewer pays attention and may break immersion. Example: an object briefly flickers, a finger count is off for a fraction of a second.
- **low** — the glitch is technically present but would likely go unnoticed. Example: a subtle fluctuation in a background detail.

When in doubt, **prefer no flag over a false flag**. A false positive costs a regeneration; a missed minor glitch is acceptable. If the clip looks clean, return an empty anomalies list with full confidence.

## Also identify

- **clean_ranges** — continuous timestamp spans with no anomalies, usable for splicing / export.
- **subject_action** — one sentence describing what's happening overall.

## Recommendation mapping

- `use_as_is` — no anomalies, or only low-severity ones that don't affect usability.
- `trim_to_clean` — anomalies are localized to a prefix or suffix; the rest is usable.
- `regenerate` — anomalies span most of the clip, or include high-severity issues that can't be trimmed around.

## Output

Return ONLY a JSON object, no commentary, no prose, no markdown fences.

{{
  "subject_action": "<one sentence>",
  "anomalies": [
    {{"timestamp_range": [<start_t>, <end_t>], "severity": "low|medium|high", "description": "<what's wrong, citing the specific object or anatomy>"}}
  ],
  "clean_ranges": [{{"start": <t>, "end": <t>}}],
  "recommendation": "use_as_is|trim_to_clean|regenerate"
}}"""


# ---------- ffmpeg / frame extraction ----------

def probe_duration(path: str) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path]
    )
    return float(out.decode().strip())


def extract_frames(video: str, count: int, tmpdir: str):
    dur = probe_duration(video)
    frames = []
    for i in range(count):
        t = round((i + 0.5) * dur / count, 3)
        out = os.path.join(tmpdir, f"f_{i:02d}.png")
        subprocess.run(
            ["ffmpeg", "-v", "error", "-ss", str(t), "-i", video,
             "-frames:v", "1", out, "-y"],
            check=True,
        )
        frames.append({"t": t, "path": out, "index": i})
    return frames, dur


def make_strip(frames, out_path: str, cols: int = 4):
    imgs = [Image.open(f["path"]) for f in frames]
    src_w, src_h = imgs[0].size
    scale = 240 / src_w
    thumb_w = int(src_w * scale)
    thumb_h = int(src_h * scale)
    label_h = 22
    rows = (len(imgs) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), (18, 18, 18))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 13)
    except Exception:
        font = ImageFont.load_default()
    for i, (img, f) in enumerate(zip(imgs, frames)):
        r, c = divmod(i, cols)
        x = c * thumb_w
        y = r * (thumb_h + label_h)
        canvas.paste(img.resize((thumb_w, thumb_h), Image.LANCZOS), (x, y))
        draw.text((x + 4, y + thumb_h + 3), f"t={f['t']}s", fill=(255, 255, 255), font=font)
    canvas.save(out_path)
    return canvas.size


# ---------- config / auth ----------

def load_api_key(config_path: str):
    if not os.path.exists(config_path):
        raise SystemExit(f"config not found: {config_path}")
    with open(config_path) as f:
        cfg = json.load(f)
    key = cfg.get("claudeKey") or cfg.get("anthropicKey")
    if not key:
        raise SystemExit("claudeKey / anthropicKey not set in config")
    return key


# ---------- Claude API with retries ----------

RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504, 529}


def call_claude(strip_path: str, api_key: str, model: str, interval: float,
                context: str | None, retries: int = 3) -> str:
    with open(strip_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    context_block = CONTEXT_PREFIX.format(context=context.strip()) if context else ""
    prompt = ANOMALY_PROMPT_TEMPLATE.format(interval=interval, context_block=context_block)
    payload = {
        "model": model,
        "max_tokens": 2000,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                {"type": "text", "text": prompt},
            ],
        }],
    }
    body = json.dumps(payload).encode()

    for attempt in range(retries + 1):
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.load(resp)
            break
        except urllib.error.HTTPError as e:
            if e.code in RETRYABLE_STATUS and attempt < retries:
                delay = min(30, 2 ** attempt)
                err = e.read().decode()[:200]
                sys.stderr.write(f"[clip-qa] HTTP {e.code} (attempt {attempt+1}/{retries+1}); retrying in {delay}s: {err}\n")
                time.sleep(delay)
                continue
            raise SystemExit(f"Claude API error {e.code}: {e.read().decode()}")
        except urllib.error.URLError as e:
            if attempt < retries:
                delay = min(30, 2 ** attempt)
                sys.stderr.write(f"[clip-qa] network error (attempt {attempt+1}/{retries+1}); retrying in {delay}s: {e}\n")
                time.sleep(delay)
                continue
            raise SystemExit(f"Network error contacting Claude: {e}")

    parts = data.get("content", [])
    text = next((p.get("text") for p in parts if p.get("type") == "text"), None)
    if not text:
        raise SystemExit(f"No text in Claude response: {json.dumps(data)[:500]}")
    return text


def extract_json(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1]
        if t.startswith("json"):
            t = t[4:]
        t = t.strip()
        if t.endswith("```"):
            t = t[:-3].strip()
    start = t.find("{")
    end = t.rfind("}")
    if start < 0 or end < 0:
        raise SystemExit(f"Could not locate JSON in Claude response:\n{text[:1000]}")
    return json.loads(t[start : end + 1])


# ---------- exit-code logic ----------

SEVERITY_ORDER = {"low": 1, "medium": 2, "high": 3}


def meets_fail_threshold(anomalies, level: str) -> bool:
    if level == "any":
        return bool(anomalies)
    threshold = SEVERITY_ORDER.get(level)
    if threshold is None:
        return False
    return any(SEVERITY_ORDER.get(a.get("severity", "low"), 1) >= threshold for a in anomalies)


# ---------- main ----------

def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--frames", type=int, default=None)
    p.add_argument("--model", default="opus", choices=list(MODEL_SHORTCUTS.keys()))
    p.add_argument("--model-id", default=None, help="Override with a full Claude model ID.")
    p.add_argument("--save-strip", default=None)
    p.add_argument("--no-save-strip", action="store_true")
    p.add_argument("--json", action="store_true")
    p.add_argument("--config", default="data/config.json")
    p.add_argument("--context", default=None,
                   help="Intent context (often the generation prompt). Helps distinguish deliberate state changes from glitches.")
    p.add_argument("--context-file", default=None,
                   help="Read intent context from a file (useful for long prompts).")
    p.add_argument("--fail-on", default=None, choices=["high", "medium", "any"],
                   help="Exit with code 3 if any anomaly meets this severity threshold.")
    p.add_argument("--retries", type=int, default=3)
    args = p.parse_args()

    context = args.context
    if args.context_file:
        with open(args.context_file) as f:
            context = f.read()

    if not os.path.exists(args.video):
        raise SystemExit(f"video not found: {args.video}")

    api_key = load_api_key(args.config)
    dur = probe_duration(args.video)
    count = args.frames or max(8, min(24, int(round(dur / 0.3))))
    interval = dur / count
    model = args.model_id or MODEL_SHORTCUTS[args.model]

    # Default strip path: adjacent to video unless --no-save-strip
    if args.no_save_strip:
        strip_path_pref = None
    elif args.save_strip:
        strip_path_pref = args.save_strip
    else:
        base = os.path.splitext(args.video)[0]
        strip_path_pref = f"{base}.qa-strip.png"

    sys.stderr.write(f"[clip-qa] {args.video} ({dur:.2f}s): {count} frames every {interval:.2f}s, model={model}\n")

    with tempfile.TemporaryDirectory() as tmp:
        frames, _ = extract_frames(args.video, count, tmp)
        strip_path = strip_path_pref or os.path.join(tmp, "strip.png")
        w, h = make_strip(frames, strip_path)
        sys.stderr.write(f"[clip-qa] strip {w}x{h} → {strip_path}\n")
        response = call_claude(strip_path, api_key, model, interval, context, retries=args.retries)

    parsed = extract_json(response)
    parsed["_meta"] = {
        "video": args.video,
        "duration": round(dur, 2),
        "frames_analyzed": count,
        "interval_seconds": round(interval, 3),
        "model": model,
        "strip": strip_path_pref,
        "context_provided": bool(context),
    }

    anomalies = parsed.get("anomalies") or []

    if args.json:
        print(json.dumps(parsed, indent=2))
    else:
        # Human-readable: summary first, then JSON, so eyeballs get the headline.
        print(json.dumps(parsed, indent=2))
        print()
        if anomalies:
            by_sev = {"high": 0, "medium": 0, "low": 0}
            for a in anomalies:
                by_sev[a.get("severity", "low")] = by_sev.get(a.get("severity", "low"), 0) + 1
            sev_summary = ", ".join(f"{k}={v}" for k, v in by_sev.items() if v)
            print(f"⚠ {len(anomalies)} anomaly(s) detected — {sev_summary}")
        else:
            print("✓ No anomalies detected")
        if parsed.get("clean_ranges"):
            ranges = ", ".join(f"[{r['start']:.2f}, {r['end']:.2f}]" for r in parsed["clean_ranges"])
            print(f"  clean: {ranges}")
        print(f"  recommendation: {parsed.get('recommendation', '?')}")
        if strip_path_pref:
            print(f"  strip: {strip_path_pref}")

    if args.fail_on and meets_fail_threshold(anomalies, args.fail_on):
        sys.exit(3)


if __name__ == "__main__":
    main()
