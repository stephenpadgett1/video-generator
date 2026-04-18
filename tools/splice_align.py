#!/usr/bin/env python3
"""
splice_align.py — detect the scale + translation that maps clip B's boundary frame onto clip A's
boundary frame. Used by splice.cjs to eliminate the geometric jump at a seamless splice.

Search strategy: coarse-then-fine on scale, then coarse-then-fine on translation. Uses PIL + numpy
(no ffmpeg per iteration — a few dozen image ops in-process, typically <3s).

Output: JSON on stdout.
  { "scale": 1.05, "dx": 0, "dy": 0, "psnr": 26.10, "method": "pil-brute-force" }

Usage
  python3 tools/splice_align.py detect-frames <a.png> <b.png>
  python3 tools/splice_align.py detect-clips  <A.mp4> <B.mp4> [--a-time=-0.05] [--b-time=0.0]
  python3 tools/splice_align.py sweep <b.png> <a1.png> <a2.png> ...
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

try:
    from PIL import Image
    import numpy as np
except ImportError as e:
    print(json.dumps({"error": f"missing dependency: {e}. Install with: pip install Pillow numpy"}))
    sys.exit(1)


def extract_frame(video, t, out_path):
    if t < 0:
        args = ["ffmpeg", "-v", "error", "-sseof", str(t), "-i", video, "-frames:v", "1", out_path, "-y"]
    else:
        args = ["ffmpeg", "-v", "error", "-ss", str(t), "-i", video, "-frames:v", "1", out_path, "-y"]
    subprocess.run(args, check=True)


def warp(img, scale, dx, dy, w, h):
    sw = max(1, int(round(w * scale)))
    sh = max(1, int(round(h * scale)))
    resized = img.resize((sw, sh), Image.LANCZOS)
    cx = (sw - w) // 2 + dx
    cy = (sh - h) // 2 + dy
    # Clamp so the crop stays within the resized image — detection is a search, we don't want exceptions.
    cx = max(0, min(cx, sw - w))
    cy = max(0, min(cy, sh - h))
    return resized.crop((cx, cy, cx + w, cy + h))


def psnr(a_arr, b_arr):
    mse = float(np.mean((a_arr - b_arr) ** 2))
    if mse <= 1e-6:
        return 100.0
    return 20.0 * np.log10(255.0) - 10.0 * np.log10(mse)


def detect_core(a_arr, b_img, w, h):
    """Given a pre-loaded A array and B image, return best alignment."""
    def score(scale, dx, dy):
        warped = warp(b_img, scale, dx, dy, w, h)
        return psnr(a_arr, np.asarray(warped, np.float32))

    # Phase 1: coarse scale, no translation
    best = {"scale": 1.0, "dx": 0, "dy": 0, "psnr": score(1.0, 0, 0)}
    for s in [0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20, 1.25, 1.30, 1.40]:
        p = score(s, 0, 0)
        if p > best["psnr"]:
            best = {"scale": s, "dx": 0, "dy": 0, "psnr": p}

    # Phase 2: fine scale around best
    s0 = best["scale"]
    for d in range(-5, 6):
        s = round(s0 + d * 0.01, 4)
        if s < 0.5:
            continue
        p = score(s, 0, 0)
        if p > best["psnr"]:
            best = {"scale": s, "dx": 0, "dy": 0, "psnr": p}

    # Phase 3: coarse translation at best scale
    s_final = best["scale"]
    for dx in [-40, -20, -10, -5, 0, 5, 10, 20, 40]:
        for dy in [-40, -20, -10, -5, 0, 5, 10, 20, 40]:
            p = score(s_final, dx, dy)
            if p > best["psnr"]:
                best = {"scale": s_final, "dx": dx, "dy": dy, "psnr": p}

    # Phase 4: fine translation around best
    dx0, dy0 = best["dx"], best["dy"]
    for ddx in range(-4, 5):
        for ddy in range(-4, 5):
            dx = dx0 + ddx
            dy = dy0 + ddy
            p = score(s_final, dx, dy)
            if p > best["psnr"]:
                best = {"scale": s_final, "dx": dx, "dy": dy, "psnr": p}

    best["psnr"] = round(best["psnr"], 2)
    best["scale"] = round(best["scale"], 4)
    best["method"] = "pil-brute-force"
    return best


def detect(a_path, b_path):
    a_img = Image.open(a_path).convert("RGB")
    b_img = Image.open(b_path).convert("RGB")
    w, h = a_img.size
    if b_img.size != (w, h):
        b_img = b_img.resize((w, h), Image.LANCZOS)
    return detect_core(np.asarray(a_img, np.float32), b_img, w, h)


def sweep(b_path, a_paths):
    """Run alignment detection for one B frame against multiple A frames, amortizing Python startup."""
    b_img = Image.open(b_path).convert("RGB")
    w, h = b_img.size
    results = []
    for a_path in a_paths:
        a_img = Image.open(a_path).convert("RGB")
        if a_img.size != (w, h):
            a_img = a_img.resize((w, h), Image.LANCZOS)
        a_arr = np.asarray(a_img, np.float32)
        r = detect_core(a_arr, b_img, w, h)
        r["a"] = a_path
        results.append(r)
    return results


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "sweep":
        # sweep <b.png> <a1.png> <a2.png> ...
        if len(sys.argv) < 4:
            print(json.dumps({"error": "sweep requires <b.png> and at least one <a.png>"}))
            sys.exit(2)
        b_path = sys.argv[2]
        a_paths = sys.argv[3:]
        print(json.dumps(sweep(b_path, a_paths), indent=2))
        return

    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["detect-frames", "detect-clips"])
    parser.add_argument("a")
    parser.add_argument("b")
    parser.add_argument("--a-time", type=float, default=None, help="Seconds into A (negative = from end). Default: last frame.")
    parser.add_argument("--b-time", type=float, default=0.0, help="Seconds into B. Default: 0.")
    args = parser.parse_args()

    if args.mode == "detect-frames":
        result = detect(args.a, args.b)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            a_frame = os.path.join(tmp, "a.png")
            b_frame = os.path.join(tmp, "b.png")
            a_t = args.a_time if args.a_time is not None else -0.05
            extract_frame(args.a, a_t, a_frame)
            extract_frame(args.b, args.b_time, b_frame)
            result = detect(a_frame, b_frame)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
