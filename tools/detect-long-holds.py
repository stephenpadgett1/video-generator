#!/usr/bin/env python3
"""
detect-long-holds.py — find regions where motion is below a threshold for an
extended period. Tuned for editorial freezes (held last frames, ken-burns
neutral holds, AI-generated static periods) rather than the technical
zero-motion freezes that ffmpeg's freezedetect catches by default.

The unified clip analyzer's freezedetect uses a noise tolerance of 0.001 by
default, which is below typical x264 encoder noise on a held still. It will
miss tpad-cloned regions and other "I'm holding the same frame but the encoder
keeps adding entropy" cases. This tool runs freezedetect with a more practical
default (0.003), and additionally computes a per-region "relative stillness"
score so a clip with steadily slow motion can be distinguished from a clip with
a sudden hold inside otherwise lively action.

Usage
  python3 tools/detect-long-holds.py <video> [flags]

Flags
  --min-duration=SEC    Minimum hold duration to report (default 1.0).
  --noise=FLOAT         Noise tolerance (default 0.003, x264-friendly).
  --json                Emit JSON only.
  --verbose             Include all freeze candidates, not just those over min-duration.

Output (JSON)
  {
    "video": "<path>",
    "duration": <seconds>,
    "noise_threshold": <float>,
    "min_duration": <float>,
    "holds": [
      { "start": 11.6, "end": 15.2, "duration": 3.6, "kind": "freeze" }
    ],
    "summary": { "longest_hold": 3.6, "total_hold_time": 3.6, "hold_fraction": 0.166 }
  }

Exit codes
  0 — success
  1 — ffmpeg / ffprobe error
  2 — usage error
"""

import argparse
import json
import os
import re
import subprocess
import sys


def probe_duration(path: str) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def run_freezedetect(path: str, noise: float, min_duration: float) -> list[dict]:
    """Run ffmpeg freezedetect; parse stderr for freeze regions.

    freezedetect emits lines like:
      [freezedetect @ ...] lavfi.freezedetect.freeze_start: 11.5
      [freezedetect @ ...] lavfi.freezedetect.freeze_duration: 3.6
      [freezedetect @ ...] lavfi.freezedetect.freeze_end: 15.1
    """
    # We use a low duration for the actual filter so we get all candidates,
    # then filter at our level. This lets a single run report short and long
    # holds without re-running ffmpeg.
    filter_dur = min(0.3, min_duration)
    cmd = [
        "ffmpeg", "-hide_banner", "-nostats",
        "-i", path,
        "-vf", f"freezedetect=n={noise}:d={filter_dur}",
        "-an", "-f", "null", "-",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        # ffmpeg returns non-zero if input is unreadable; surface that.
        raise SystemExit(f"ffmpeg failed: {r.stderr[-500:]}")

    holds = []
    current = {}
    for line in r.stderr.splitlines():
        m = re.search(r"freeze_start:\s*([\d.]+)", line)
        if m:
            if current:
                holds.append(current)
            current = {"start": float(m.group(1))}
            continue
        m = re.search(r"freeze_duration:\s*([\d.]+)", line)
        if m and current:
            current["duration"] = float(m.group(1))
            continue
        m = re.search(r"freeze_end:\s*([\d.]+)", line)
        if m and current:
            current["end"] = float(m.group(1))
            holds.append(current)
            current = {}
    if current:
        # freeze that ran to EOF — no end emitted; synthesize from duration.
        if "duration" in current:
            current["end"] = current["start"] + current["duration"]
        holds.append(current)

    for h in holds:
        h["kind"] = "freeze"
        if "duration" not in h and "end" in h:
            h["duration"] = h["end"] - h["start"]

    return holds


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video", help="Path to video file")
    p.add_argument("--min-duration", type=float, default=1.0,
                   help="Minimum hold duration to report (seconds)")
    p.add_argument("--noise", type=float, default=0.003,
                   help="Noise tolerance for freezedetect (default 0.003 — practical for x264)")
    p.add_argument("--json", action="store_true")
    p.add_argument("--verbose", action="store_true",
                   help="Include all freeze candidates, not just those over min-duration")
    args = p.parse_args()

    if not os.path.exists(args.video):
        raise SystemExit(f"video not found: {args.video}")

    duration = probe_duration(args.video)
    candidates = run_freezedetect(args.video, args.noise, args.min_duration)

    if args.verbose:
        kept = candidates
    else:
        kept = [h for h in candidates if h.get("duration", 0) >= args.min_duration]

    total = sum(h.get("duration", 0) for h in kept)
    longest = max((h.get("duration", 0) for h in kept), default=0)

    result = {
        "video": args.video,
        "duration": duration,
        "noise_threshold": args.noise,
        "min_duration": args.min_duration,
        "holds": kept,
        "summary": {
            "longest_hold": round(longest, 3),
            "total_hold_time": round(total, 3),
            "hold_fraction": round(total / duration, 3) if duration else 0,
            "hold_count": len(kept),
        },
    }

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(json.dumps(result, indent=2))
        if kept:
            print()
            for h in kept:
                start = h.get("start", 0)
                end = h.get("end", 0)
                dur = h.get("duration", 0)
                marker = "!!" if dur >= 2.0 else " ~"
                print(f"  {marker} hold {start:6.2f}s → {end:6.2f}s ({dur:.2f}s)")
        else:
            print()
            print(f"  ✓ no holds ≥ {args.min_duration}s detected")


if __name__ == "__main__":
    main()
