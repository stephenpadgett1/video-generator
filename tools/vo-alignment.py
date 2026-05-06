#!/usr/bin/env python3
"""
vo-alignment.py — verify that designed VO landings actually fire on time in
the rendered mix.

When you design an edit, you have intent: "the word 'Erin' should land on the
cut to the dream image at 15.6s." After rendering, the actual position of that
word might drift by a few hundred milliseconds because of TTS pacing, music
swell timing, or the fact that the ffmpeg adelay you used didn't account for
the VO's leading silence. This tool catches that drift before you ship.

It takes:
  1. The rendered video (with audio)
  2. An intent file (JSON) listing { word, target_time_s, tolerance_ms } records
     OR a project_id and shot_id whose VO design includes landing intents

It runs Whisper transcription, finds each intent's word, and reports actual vs
target with a pass/fail per landing.

Usage
  python3 tools/vo-alignment.py <video> --intent=intents.json [--json]
  python3 tools/vo-alignment.py <video> --landing="Erin@15.6:200" [--landing=...]

Intent file format (JSON)
  {
    "landings": [
      { "word": "Erin", "target": 15.6, "tolerance_ms": 200, "occurrence": 1 },
      { "word": "bull", "target": 6.5,  "tolerance_ms": 300 }
    ]
  }

Inline landing format
  WORD@TARGET[:TOLERANCE_MS][:OCCURRENCE]
  - WORD: case-insensitive match against the transcript
  - TARGET: target time in seconds
  - TOLERANCE_MS: optional, default 250ms
  - OCCURRENCE: 1-indexed; if the word appears multiple times, which one to pin

Output (JSON)
  {
    "video": "...",
    "transcript_word_count": 57,
    "landings": [
      {
        "word": "Erin", "target": 15.6, "actual": 15.76, "drift_ms": 160,
        "tolerance_ms": 200, "status": "pass", "occurrence": 1,
        "matched_text": "king of Erin"
      }
    ],
    "summary": { "total": 1, "pass": 1, "fail": 0, "missing": 0, "max_drift_ms": 160 }
  }

Exit codes
  0 — all landings within tolerance (or no landings checked)
  1 — analysis error
  2 — usage error
  3 — at least one landing failed or its word was missing
"""

import argparse
import json
import os
import re
import subprocess
import sys


def load_openai_key(config_path: str = "data/config.json") -> str:
    if not os.path.exists(config_path):
        raise SystemExit(f"config not found: {config_path}")
    with open(config_path) as f:
        cfg = json.load(f)
    key = cfg.get("openaiKey")
    if not key:
        raise SystemExit("openaiKey not set in config")
    return key


def transcribe_words(path: str, config_path: str = "data/config.json") -> list[dict]:
    """Call OpenAI Whisper API directly to get word-level timestamps. Returns
    a list of {word, start, end}. The MCP server uses the same primitive.
    """
    # Caller can pre-load a transcript by writing a sidecar .whisper.json next
    # to the video — useful for debugging without re-spending API calls.
    sidecar = path + ".whisper.json"
    if os.path.exists(sidecar):
        with open(sidecar) as f:
            data = json.load(f)
        return data.get("words", []) or []

    api_key = load_openai_key(config_path)

    # Whisper accepts MP4 directly. Build a multipart/form-data request manually
    # to avoid a `requests` dependency.
    import urllib.request
    import urllib.error
    import uuid

    boundary = f"----vg{uuid.uuid4().hex}"
    sep = f"--{boundary}\r\n".encode()
    end = f"--{boundary}--\r\n".encode()

    def field(name, value):
        return (
            sep
            + f'Content-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
        )

    def file_field(name, filename, content, mime="application/octet-stream"):
        return (
            sep
            + f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
            + f"Content-Type: {mime}\r\n\r\n".encode()
            + content
            + b"\r\n"
        )

    with open(path, "rb") as f:
        file_bytes = f.read()

    body = b"".join([
        file_field("file", os.path.basename(path), file_bytes, "video/mp4"),
        field("model", "whisper-1"),
        field("response_format", "verbose_json"),
        field("timestamp_granularities[]", "word"),
        field("timestamp_granularities[]", "segment"),
    ]) + end

    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Whisper API error {e.code}: {e.read().decode()[:300]}")

    words = []
    for w in data.get("words", []) or []:
        words.append({"word": w.get("word", "").strip(), "start": w.get("start"), "end": w.get("end")})

    # Cache to sidecar so subsequent runs are free.
    try:
        with open(sidecar, "w") as f:
            json.dump({"words": words, "text": data.get("text", "")}, f, indent=2)
    except OSError:
        pass

    return words


def normalize(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9']", "", s).lower()


def parse_inline(spec: str) -> dict:
    """Parse "WORD@TARGET[:TOLERANCE_MS][:OCCURRENCE]"."""
    if "@" not in spec:
        raise SystemExit(f"--landing must be WORD@TARGET[:TOL_MS][:OCCURRENCE], got {spec!r}")
    word, rest = spec.split("@", 1)
    parts = rest.split(":")
    target = float(parts[0])
    tol = int(parts[1]) if len(parts) > 1 else 250
    occ = int(parts[2]) if len(parts) > 2 else 1
    return {"word": word, "target": target, "tolerance_ms": tol, "occurrence": occ}


def find_word(words: list[dict], target_word: str, occurrence: int = 1) -> dict | None:
    target = normalize(target_word)
    seen = 0
    for w in words:
        if normalize(w.get("word", "")) == target:
            seen += 1
            if seen == occurrence:
                return w
    return None


def context_around(words: list[dict], idx: int, before: int = 1, after: int = 1) -> str:
    parts = []
    for w in words[max(0, idx - before): idx + after + 1]:
        parts.append(w.get("word", "").strip())
    return " ".join(parts)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--intent", help="Path to JSON file with {landings: [...]}")
    p.add_argument("--landing", action="append", default=[],
                   help="Inline landing spec: WORD@TARGET[:TOLERANCE_MS][:OCCURRENCE]; repeatable")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    if not os.path.exists(args.video):
        raise SystemExit(f"video not found: {args.video}")

    landings = []
    if args.intent:
        if not os.path.exists(args.intent):
            raise SystemExit(f"intent file not found: {args.intent}")
        with open(args.intent) as f:
            data = json.load(f)
        for l in data.get("landings", []) or []:
            landings.append({
                "word": l["word"],
                "target": float(l["target"]),
                "tolerance_ms": int(l.get("tolerance_ms", 250)),
                "occurrence": int(l.get("occurrence", 1)),
            })
    for spec in args.landing:
        landings.append(parse_inline(spec))

    if not landings:
        raise SystemExit("No landings provided. Use --intent=path.json or --landing=WORD@T[:TOL][:OCC]")

    words = transcribe_words(args.video)
    if not words:
        raise SystemExit("Transcription returned no words. Is the MCP server running?")

    # Build an indexed list so we can give context.
    indexed = list(enumerate(words))

    results = []
    pass_count = 0
    miss_count = 0
    max_drift = 0

    for landing in landings:
        # Find the Nth occurrence and capture index for context.
        target = normalize(landing["word"])
        seen = 0
        match_idx = None
        for i, w in indexed:
            if normalize(w.get("word", "")) == target:
                seen += 1
                if seen == landing["occurrence"]:
                    match_idx = i
                    break

        if match_idx is None:
            miss_count += 1
            results.append({
                **landing,
                "actual": None,
                "drift_ms": None,
                "status": "missing",
                "matched_text": None,
            })
            continue

        actual = float(words[match_idx].get("start", 0))
        drift_ms = round((actual - landing["target"]) * 1000)
        status = "pass" if abs(drift_ms) <= landing["tolerance_ms"] else "fail"
        if status == "pass":
            pass_count += 1
        max_drift = max(max_drift, abs(drift_ms))
        results.append({
            **landing,
            "actual": round(actual, 3),
            "drift_ms": drift_ms,
            "status": status,
            "matched_text": context_around(words, match_idx, 2, 2),
        })

    fail_count = sum(1 for r in results if r["status"] == "fail")

    out = {
        "video": args.video,
        "transcript_word_count": len(words),
        "landings": results,
        "summary": {
            "total": len(results),
            "pass": pass_count,
            "fail": fail_count,
            "missing": miss_count,
            "max_drift_ms": max_drift,
        },
    }

    if args.json:
        print(json.dumps(out, indent=2))
    else:
        print(json.dumps(out, indent=2))
        print()
        for r in results:
            sym = {"pass": "✓", "fail": "✗", "missing": "?"}[r["status"]]
            if r["status"] == "missing":
                print(f"  {sym} '{r['word']}' (#{r['occurrence']}): not found in transcript")
            else:
                print(f"  {sym} '{r['word']}' target {r['target']:.2f}s, actual {r['actual']:.2f}s, "
                      f"drift {r['drift_ms']:+d}ms (tol ±{r['tolerance_ms']}ms) — \"{r['matched_text']}\"")

    if fail_count or miss_count:
        sys.exit(3)


if __name__ == "__main__":
    main()
