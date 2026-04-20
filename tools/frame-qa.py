#!/usr/bin/env python3
"""
frame-qa.py — evaluate a generated reference frame against canonical refs via Claude vision.

Use after any nano-banana (or other image-generation) call that produces a poster
frame destined for Veo. Catches the failure modes that show up later as visible
glitches in the video: prop-position drift between supposedly-matching frames,
wardrobe / character drift, tight clusters that will be miscounted, invented
scene elements that aren't in the plate.

Strategy: send the generated frame + 1..N labeled reference images to Claude
with an explicit preserve-list and change-list, get structured pass/fail per
check plus issue descriptions. Returns JSON.

Usage
  python3 tools/frame-qa.py <frame> --ref=path[:label] [--ref=...] \\
    --preserve="TEXT" --change="TEXT" [flags]

Examples
  python3 tools/frame-qa.py data/workspace/.../frameA1_v1.png \\
    --ref=data/workspace/.../refs/banner_janitor_intro_4s.png:character \\
    --ref=data/workspace/.../refs/scene3_plate_v1.png:plate \\
    --preserve="wardrobe (flat cap, suspenders over rolled-sleeve shirt, work trousers); environment (plain wooden slat wall, red velvet curtain screen-right, wooden door, Edison bulb, plank floor)" \\
    --change="janitor is now placed in the scene holding nothing, with a single galvanized bucket at his feet" \\
    --fail-on=high

  python3 tools/frame-qa.py frameA2_v4.png \\
    --ref=frameA1_v1.png:prior \\
    --preserve="everything in the prior frame — wardrobe, environment, lighting, AND the bucket's exact position on the floor" \\
    --change="janitor has rotated ~90 degrees to his left, now in full left-side profile"

Flags
  --ref=PATH[:LABEL]   Reference image. Repeat for multiple. Label optional (default: ref1, ref2, ...).
  --preserve=TEXT      What must remain consistent between the frame and the refs.
  --change=TEXT        What is supposed to be different in the frame vs refs.
  --model=opus|sonnet|haiku  Claude model shortcut (default: opus — most reliable for visual checks).
  --model-id=NAME      Full Claude model ID (overrides --model).
  --json               Emit JSON only; suppress human summary.
  --config=PATH        data/config.json override (for claudeKey).
  --fail-on=LEVEL      Exit code 3 if any issue at or above LEVEL (high | medium | any).
  --retries=N          API retries on transient errors (default: 3).

Exit codes
  0 — frame passes (no issues at or above --fail-on)
  1 — internal / API failure
  2 — usage error
  3 — issues meet --fail-on threshold
"""

import argparse
import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

try:
    from PIL import Image
except ImportError:
    print(json.dumps({"error": "Missing Pillow: pip install Pillow"}))
    sys.exit(1)


MODEL_SHORTCUTS = {
    "opus": "claude-opus-4-7",
    "sonnet": "claude-sonnet-4-6",
    "haiku": "claude-haiku-4-5-20251001",
}


PROMPT_TEMPLATE = """You are evaluating a generated reference image against the canonical source images it was supposed to be built from. The first image below is the GENERATED frame. The remaining images are REFERENCE images (each labeled with its role — e.g. "character", "plate", "prior").

The purpose of this check is to catch problems in the generated frame BEFORE it gets used as an anchor for video generation. Small issues here compound into visible glitches downstream.

## Intent

**Must be preserved from the refs** (should be consistent across the generated frame and the referenced images):
{preserve}

**Should be different in the generated frame** (the intended change vs the refs):
{change}

## What to check

Evaluate the generated frame against each preserve item and each change item. Specifically look for the following common failure modes:

1. **Wardrobe drift** — the character's clothing changed (e.g. suspenders became overalls, shirt became t-shirt, accessories appeared/disappeared) when it was supposed to stay locked.
2. **Environment drift** — scene elements that were supposed to stay locked are missing, moved, or invented (e.g. the curtain dropped out, hanging tools appeared on a previously bare wall, a door moved).
3. **Prop position drift** — an object present in both the frame and a ref has moved to a meaningfully different position, when only the character or only some other element was supposed to change. Flag this even if the object is still in frame. Example: "the bucket was at his feet in the ref; in the generated frame it is behind his heels — a ~2ft lateral shift that wasn't part of the intended change."
4. **Cluster / count ambiguity** — multiple instances of an object are clustered so tightly that the count is ambiguous, or clearly differs from what was intended.
5. **Intended change not present or weak** — the change described in the intent did not happen, or happened too subtly to be useful as an animation endpoint.
6. **Pose / framing inconsistency** — if the intent was "same framing, same pose, different detail" but the pose or framing shifted, flag it. If the intent was "new pose," flag whether the new pose actually landed.
7. **Anything else in the generated frame that would surprise someone who read only the preserve/change intent.**

## Severity rubric

- **high** — the frame is not usable as-is. The failure will produce visible glitches, miscounts, or character drift downstream. Regenerate.
- **medium** — the frame has a real issue but might be acceptable if the downstream use is tolerant. Mention it and let a human decide.
- **low** — minor cosmetic / texture variance that will not affect downstream use. For completeness only.

When in doubt, **prefer flagging over silence**. A false flag costs a cheap re-roll; a missed issue costs a Veo generation + a retry loop. If the frame looks clean against the intent, return an empty issues list.

## Output

Return ONLY a JSON object, no commentary, no prose, no markdown fences.

{{
  "summary": "<one sentence overall read on the generated frame vs intent>",
  "preservation_findings": [
    {{"aspect": "<which preserve item, quoted from intent>", "status": "pass|fail|partial", "note": "<what you see>"}}
  ],
  "change_findings": [
    {{"aspect": "<which change item, quoted from intent>", "status": "pass|fail|partial|weak", "note": "<what you see>"}}
  ],
  "issues": [
    {{"category": "wardrobe|environment|prop_position|cluster|weak_change|pose|other", "severity": "low|medium|high", "description": "<specific observation, citing what is where>"}}
  ],
  "verdict": "accept|accept_with_caveat|reroll"
}}"""


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


# Anthropic messages API caps at 5MB per image. Leave headroom for base64 inflation (~1.33x).
MAX_IMAGE_BYTES = 3_500_000
MAX_DIMENSION = 2048


def encode_image_for_api(path: str) -> tuple[str, str]:
    """Return (base64_data, media_type). Downscale if needed to fit API limits."""
    raw = open(path, "rb").read()
    ext = os.path.splitext(path)[1].lower()
    media_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "image/png")

    # Fast path: small enough to send as-is.
    if len(raw) <= MAX_IMAGE_BYTES:
        img = Image.open(io.BytesIO(raw))
        if max(img.size) <= MAX_DIMENSION:
            return base64.b64encode(raw).decode(), media_type

    img = Image.open(io.BytesIO(raw))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")

    w, h = img.size
    if max(w, h) > MAX_DIMENSION:
        scale = MAX_DIMENSION / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    buf = io.BytesIO()
    # Re-encode as JPEG for aggressive size; fall back to PNG if alpha matters (we stripped alpha above).
    img.convert("RGB").save(buf, format="JPEG", quality=90)
    data = buf.getvalue()
    if len(data) > MAX_IMAGE_BYTES:
        # Progressively reduce quality if still too large.
        for q in (80, 70, 60, 50):
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=q)
            data = buf.getvalue()
            if len(data) <= MAX_IMAGE_BYTES:
                break

    sys.stderr.write(f"[frame-qa] downscaled {path}: {len(raw)}B {w}x{h} → {len(data)}B {img.size[0]}x{img.size[1]} jpeg\n")
    return base64.b64encode(data).decode(), "image/jpeg"


def image_block(path: str):
    data, media_type = encode_image_for_api(path)
    return {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}}


def call_claude(frame_path: str, refs: list, preserve: str, change: str,
                api_key: str, model: str, retries: int = 3) -> str:
    prompt = PROMPT_TEMPLATE.format(preserve=preserve.strip(), change=change.strip())

    content = [{"type": "text", "text": "GENERATED FRAME:"}, image_block(frame_path)]
    for ref in refs:
        content.append({"type": "text", "text": f"REFERENCE ({ref['label']}):"})
        content.append(image_block(ref["path"]))
    content.append({"type": "text", "text": prompt})

    payload = {
        "model": model,
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": content}],
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
                sys.stderr.write(f"[frame-qa] HTTP {e.code} (attempt {attempt+1}/{retries+1}); retrying in {delay}s: {err}\n")
                time.sleep(delay)
                continue
            raise SystemExit(f"Claude API error {e.code}: {e.read().decode()}")
        except urllib.error.URLError as e:
            if attempt < retries:
                delay = min(30, 2 ** attempt)
                sys.stderr.write(f"[frame-qa] network error (attempt {attempt+1}/{retries+1}); retrying in {delay}s: {e}\n")
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


def meets_fail_threshold(issues, level: str) -> bool:
    if level == "any":
        return bool(issues)
    threshold = SEVERITY_ORDER.get(level)
    if threshold is None:
        return False
    return any(SEVERITY_ORDER.get(i.get("severity", "low"), 1) >= threshold for i in issues)


# ---------- main ----------

def parse_ref(s: str) -> dict:
    if ":" in s:
        path, label = s.rsplit(":", 1)
    else:
        path, label = s, None
    return {"path": path, "label": label}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("frame", help="Path to the generated frame to evaluate (PNG/JPEG).")
    p.add_argument("--ref", action="append", default=[], required=True,
                   help="Reference image path, optionally suffixed with :label (e.g. path/to/plate.png:plate). Repeat for multiple.")
    p.add_argument("--preserve", required=True,
                   help="What must be consistent between the frame and the refs (wardrobe, environment, prop positions, lighting, etc).")
    p.add_argument("--change", required=True,
                   help="What is supposed to be different in the frame vs refs (the intended change).")
    p.add_argument("--model", default="opus", choices=list(MODEL_SHORTCUTS.keys()))
    p.add_argument("--model-id", default=None, help="Override with a full Claude model ID.")
    p.add_argument("--json", action="store_true")
    p.add_argument("--config", default="data/config.json")
    p.add_argument("--fail-on", default=None, choices=["high", "medium", "any"],
                   help="Exit with code 3 if any issue meets this severity threshold.")
    p.add_argument("--retries", type=int, default=3)
    args = p.parse_args()

    if not os.path.exists(args.frame):
        raise SystemExit(f"frame not found: {args.frame}")

    refs = [parse_ref(r) for r in args.ref]
    for i, r in enumerate(refs):
        if not os.path.exists(r["path"]):
            raise SystemExit(f"ref not found: {r['path']}")
        if not r["label"]:
            r["label"] = f"ref{i+1}"

    api_key = load_api_key(args.config)
    model = args.model_id or MODEL_SHORTCUTS[args.model]

    sys.stderr.write(f"[frame-qa] {args.frame} against {len(refs)} ref(s), model={model}\n")

    response = call_claude(args.frame, refs, args.preserve, args.change, api_key, model, retries=args.retries)
    parsed = extract_json(response)
    parsed["_meta"] = {
        "frame": args.frame,
        "refs": [{"path": r["path"], "label": r["label"]} for r in refs],
        "model": model,
    }

    issues = parsed.get("issues") or []

    if args.json:
        print(json.dumps(parsed, indent=2))
    else:
        print(json.dumps(parsed, indent=2))
        print()
        verdict = parsed.get("verdict", "?")
        symbol = {"accept": "✓", "accept_with_caveat": "~", "reroll": "✗"}.get(verdict, "?")
        if issues:
            by_sev = {"high": 0, "medium": 0, "low": 0}
            for i in issues:
                sev = i.get("severity", "low")
                by_sev[sev] = by_sev.get(sev, 0) + 1
            sev_summary = ", ".join(f"{k}={v}" for k, v in by_sev.items() if v)
            print(f"{symbol} verdict: {verdict} — {len(issues)} issue(s): {sev_summary}")
        else:
            print(f"{symbol} verdict: {verdict} — no issues")

    if args.fail_on and meets_fail_threshold(issues, args.fail_on):
        sys.exit(3)


if __name__ == "__main__":
    main()
