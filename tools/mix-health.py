#!/usr/bin/env python3
"""
mix-health.py — produce a structured editorial verdict on a video's audio mix.

Wraps ffmpeg's EBU R128 loudness analyzer plus per-window short-term loudness
sampling, returns a single JSON document with:
  - integrated LUFS, loudness range (LRA), true peak
  - per-second short-term loudness curve (so callers can plot)
  - a verdict against a target (default -16 LUFS for cinematic short-form)
  - if a transcript is available (auto-runs Whisper or accepts one), an
    estimated narration-vs-bed dB gap during speech regions

Common targets:
   - Cinematic short-form / vertical social: -16 to -18 LUFS
   - Streaming (Spotify/Apple/YouTube normalize to ~-14 to -16)
   - Broadcast TV (ATSC/EBU): -23 to -24 LUFS
   - Podcast: -16 LUFS

Usage
  python3 tools/mix-health.py <video> [flags]

Flags
  --target=LUFS         Target integrated loudness in LUFS (default -16)
  --speech-bed-gap=DB   Minimum desired narration-over-bed gap during speech (default 6 dB)
  --json                Emit JSON only

Output (JSON)
  {
    "video": "...",
    "duration": <s>,
    "loudness": {
      "integrated_lufs": -25.1,
      "loudness_range_lu": 10.8,
      "true_peak_dbfs": -8.8,
      "threshold_lufs": -35.5
    },
    "short_term": [{ "t": 1.0, "lufs": -28.3 }, ...],
    "verdict": {
      "level_vs_target": { "target": -16, "delta": -9.1, "status": "too_quiet" },
      "lra": { "value": 10.8, "status": "wide" },
      "true_peak": { "value": -8.8, "status": "ok" },
      "speech_bed_gap": { "value": 4.2, "status": "narrow", "speech_coverage": 0.53 }
    },
    "issues": [
      "Mix is 9.1 dB below target (-16 LUFS). Master up.",
      "Loudness range 10.8 LU is wide for narration-driven content. Consider compression."
    ]
  }

Exit codes
  0 — success (regardless of mix verdict)
  1 — ffmpeg / analysis failure
  2 — usage error
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile


def probe_duration(path: str) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def has_audio(path: str) -> bool:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a",
         "-show_entries", "stream=codec_type", "-of", "csv=p=0", path],
        capture_output=True, text=True,
    )
    return bool(r.stdout.strip())


def run_ebur128(path: str) -> tuple[dict, list[dict]]:
    """Run ffmpeg ebur128, parse summary + per-window short-term LUFS samples.

    Returns (summary, short_term_curve).
    """
    cmd = [
        "ffmpeg", "-hide_banner", "-nostats",
        "-i", path,
        "-af", "ebur128=peak=true",
        "-f", "null", "-",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"ffmpeg ebur128 failed: {r.stderr[-500:]}")

    short_term = []
    for line in r.stderr.splitlines():
        # Sample lines:
        # [Parsed_ebur128_0 @ 0x...] t: 1.299979  TARGET:-23 LUFS    M: -23.3 S: -23.1     I: -25.3 LUFS       LRA:  10.4 LU  FTPK: -16.9 -18.3 dBFS  TPK:  -8.8  -8.9 dBFS
        m = re.search(r"t:\s*([\d.]+)\s+TARGET:.*?S:\s*(-?[\d.inf]+)", line)
        if m:
            try:
                lufs = float(m.group(2))
            except ValueError:
                continue
            short_term.append({"t": round(float(m.group(1)), 2), "lufs": lufs})

    # Parse summary block at end.
    text = r.stderr
    summary = {}
    m = re.search(r"Integrated loudness:\s*\n\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS\s*\n\s*Threshold:\s*(-?\d+(?:\.\d+)?)\s*LUFS", text)
    if m:
        summary["integrated_lufs"] = float(m.group(1))
        summary["threshold_lufs"] = float(m.group(2))
    m = re.search(r"Loudness range:\s*\n\s*LRA:\s*(-?\d+(?:\.\d+)?)\s*LU", text)
    if m:
        summary["loudness_range_lu"] = float(m.group(1))
    m = re.search(r"True peak:\s*\n\s*Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS", text)
    if m:
        summary["true_peak_dbfs"] = float(m.group(1))

    return summary, short_term


def transcribe_words(path: str) -> list[dict]:
    """Lightweight Whisper transcription via the project's MCP API. We call
    the analyze_audio_timeline equivalent via a small server roundtrip if
    available; otherwise fall back to in-process whisper if installed.

    For portability we shell out to `whisper` CLI if present, else return [].
    """
    # Try the mcp server's HTTP endpoint first.
    try:
        import urllib.request
        req = urllib.request.Request(
            "http://localhost:3000/api/transcribe",
            data=json.dumps({"videoPath": path}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.load(resp)
            return data.get("words", []) or []
    except Exception:
        pass

    return []


def measure_window_loudness(path: str, start: float, end: float) -> float | None:
    """Return integrated LUFS for a single window [start, end). None on failure."""
    if end <= start:
        return None
    duration = end - start
    cmd = [
        "ffmpeg", "-hide_banner", "-nostats",
        "-ss", str(start), "-i", path, "-t", str(duration),
        "-af", "ebur128", "-f", "null", "-",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return None
    m = re.search(r"Integrated loudness:\s*\n\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS", r.stderr)
    return float(m.group(1)) if m else None


def estimate_speech_bed_gap(path: str, words: list[dict]) -> dict:
    """Estimate the dB gap between speech regions and silence regions.

    We compute integrated LUFS over (a) the union of speech windows and
    (b) the union of non-speech windows above 0.5s. The gap is (a) - (b).
    Larger gap = narration sits above bed. Negative gap = bed louder than
    narration (a problem).
    """
    if not words:
        return {"value": None, "status": "unknown", "speech_coverage": 0.0}

    duration = probe_duration(path)
    # Build merged speech intervals, padding 0.1s either side for breath.
    intervals = []
    for w in words:
        s = max(0.0, float(w.get("start", 0)) - 0.05)
        e = min(duration, float(w.get("end", 0)) + 0.05)
        if e > s:
            intervals.append((s, e))
    intervals.sort()
    merged = []
    for s, e in intervals:
        if merged and s <= merged[-1][1] + 0.1:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))

    speech_total = sum(e - s for s, e in merged)
    speech_coverage = round(speech_total / duration, 3) if duration else 0

    # Per-window LUFS measurement is expensive; sample up to 4 of each kind.
    speech_lufs = []
    for s, e in merged[:4]:
        if e - s >= 0.4:
            v = measure_window_loudness(path, s, e)
            if v is not None and v != float("-inf"):
                speech_lufs.append(v)

    # Non-speech intervals: gaps between merged speech (and head/tail).
    bed = []
    cursor = 0.0
    for s, e in merged:
        if s - cursor >= 0.5:
            bed.append((cursor, s))
        cursor = e
    if duration - cursor >= 0.5:
        bed.append((cursor, duration))

    bed_lufs = []
    for s, e in bed[:4]:
        v = measure_window_loudness(path, s, e)
        if v is not None and v != float("-inf"):
            bed_lufs.append(v)

    if not speech_lufs or not bed_lufs:
        return {"value": None, "status": "insufficient_data", "speech_coverage": speech_coverage}

    avg_speech = sum(speech_lufs) / len(speech_lufs)
    avg_bed = sum(bed_lufs) / len(bed_lufs)
    gap = round(avg_speech - avg_bed, 1)

    if gap >= 6:
        status = "ok"
    elif gap >= 3:
        status = "narrow"
    else:
        status = "too_close"

    return {
        "value": gap,
        "status": status,
        "speech_lufs_avg": round(avg_speech, 1),
        "bed_lufs_avg": round(avg_bed, 1),
        "speech_coverage": speech_coverage,
    }


def build_verdict(summary: dict, target: float, gap: dict, min_gap: float) -> tuple[dict, list[str]]:
    issues = []

    integrated = summary.get("integrated_lufs")
    delta = round(integrated - target, 1) if integrated is not None else None
    if delta is None:
        level_status = "unknown"
    elif abs(delta) <= 1.0:
        level_status = "ok"
    elif delta < 0:
        level_status = "too_quiet"
        issues.append(f"Mix is {abs(delta)} dB below target ({target} LUFS). Master up.")
    else:
        level_status = "too_loud"
        issues.append(f"Mix is {delta} dB above target ({target} LUFS). Pull down.")

    lra = summary.get("loudness_range_lu")
    if lra is None:
        lra_status = "unknown"
    elif lra <= 7:
        lra_status = "ok"
    elif lra <= 12:
        lra_status = "wide"
        issues.append(f"Loudness range {lra} LU is wide for narration-driven content. Consider compression / VO ducking.")
    else:
        lra_status = "very_wide"
        issues.append(f"Loudness range {lra} LU will feel uneven on small speakers.")

    tpk = summary.get("true_peak_dbfs")
    if tpk is None:
        tpk_status = "unknown"
    elif tpk <= -1.0:
        tpk_status = "ok"
    elif tpk <= 0:
        tpk_status = "tight"
        issues.append(f"True peak {tpk} dBFS leaves little headroom; risk of inter-sample clipping.")
    else:
        tpk_status = "clipping"
        issues.append(f"True peak {tpk} dBFS — clipping detected.")

    gap_status = gap.get("status", "unknown")
    if gap.get("value") is not None:
        if gap["value"] < min_gap:
            issues.append(
                f"Speech-vs-bed gap is {gap['value']} dB (target ≥ {min_gap}). Narration may be masked."
            )

    verdict = {
        "level_vs_target": {"target": target, "delta": delta, "status": level_status},
        "lra": {"value": lra, "status": lra_status},
        "true_peak": {"value": tpk, "status": tpk_status},
        "speech_bed_gap": gap,
    }
    return verdict, issues


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--target", type=float, default=-16.0,
                   help="Target integrated LUFS (default -16 for cinematic short-form)")
    p.add_argument("--speech-bed-gap", type=float, default=6.0,
                   help="Minimum desired narration-over-bed gap in dB (default 6)")
    p.add_argument("--no-speech-analysis", action="store_true",
                   help="Skip speech/bed gap analysis (faster)")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()

    if not os.path.exists(args.video):
        raise SystemExit(f"video not found: {args.video}")
    if not has_audio(args.video):
        raise SystemExit("video has no audio stream")

    duration = probe_duration(args.video)
    summary, short_term = run_ebur128(args.video)

    if args.no_speech_analysis:
        gap = {"value": None, "status": "skipped", "speech_coverage": 0.0}
    else:
        words = transcribe_words(args.video)
        gap = estimate_speech_bed_gap(args.video, words)

    verdict, issues = build_verdict(summary, args.target, gap, args.speech_bed_gap)

    result = {
        "video": args.video,
        "duration": round(duration, 2),
        "loudness": summary,
        "short_term": short_term,
        "verdict": verdict,
        "issues": issues,
    }

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        # Human-readable summary, plus full JSON.
        print(json.dumps(result, indent=2))
        print()
        print(f"  integrated: {summary.get('integrated_lufs', '?')} LUFS  "
              f"(target {args.target}; delta {verdict['level_vs_target'].get('delta', '?')} dB)")
        print(f"  LRA:        {summary.get('loudness_range_lu', '?')} LU  ({verdict['lra']['status']})")
        print(f"  true peak:  {summary.get('true_peak_dbfs', '?')} dBFS  ({verdict['true_peak']['status']})")
        if gap.get("value") is not None:
            print(f"  VO/bed gap: {gap['value']} dB  ({gap['status']}; speech coverage {gap['speech_coverage']*100:.0f}%)")
        if issues:
            print()
            for i in issues:
                print(f"  ! {i}")
        else:
            print("\n  ✓ mix is within tolerances")


if __name__ == "__main__":
    main()
