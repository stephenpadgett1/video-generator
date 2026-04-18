#!/usr/bin/env python3
"""AI video upscaler using Real-ESRGAN ncnn (via realesrgan-ncnn-py).

Requires: pip install realesrgan-ncnn-py

Usage:
  python3 tools/upscale.py <input.mp4> [output.mp4] [--scale 2|3|4] [--model 0|1]
  python3 tools/upscale.py data/workspace/video.mp4                     # -> video_4k.mp4
  python3 tools/upscale.py data/workspace/video.mp4 --scale 2           # 2x only (no lanczos)
  python3 tools/upscale.py data/workspace/video.mp4 custom_output.mp4   # explicit output name

Models:
  0 = realesrgan-x4plus (general, default) — best for live action, photography
  1 = realesr-animevideov3 — optimized for animation/anime

Scale logic:
  The AI model always produces 2x output. If --scale is 3 or 4 (default),
  ffmpeg lanczos handles the remaining upscale during reassembly.
  Target resolutions (9:16): 2x=1440x2560, 3x=2160x3840, 4x=2880x5120
  Target resolutions (16:9): 2x=2560x1440, 3x=3840x2160, 4x=5120x2880
"""
import os
import sys
import time
import argparse
import subprocess
import tempfile
from pathlib import Path


def get_video_info(video_path):
    """Get resolution, fps, and duration from video."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries",
         "stream=width,height,r_frame_rate",
         "-show_entries", "format=duration",
         "-of", "csv=p=0", str(video_path)],
        capture_output=True, text=True
    )
    lines = [l.strip() for l in result.stdout.strip().split('\n') if l.strip()]
    # First line: codec,width,height (or width,height,fps)
    # Parse carefully
    width = height = fps_str = duration = None
    for line in lines:
        parts = line.split(',')
        if len(parts) >= 3 and '/' in parts[-1]:
            # stream line: codec,width,height or width,height,fps
            try:
                width = int(parts[-3])
                height = int(parts[-2])
                fps_str = parts[-1]
            except (ValueError, IndexError):
                pass
        elif len(parts) == 1:
            try:
                duration = float(parts[0])
            except ValueError:
                pass
    return width, height, fps_str, duration


def main():
    parser = argparse.ArgumentParser(description="AI video upscaler using Real-ESRGAN")
    parser.add_argument("input", help="Input video path")
    parser.add_argument("output", nargs="?", help="Output video path (default: input_4k.mp4)")
    parser.add_argument("--scale", type=int, default=4, choices=[2, 3, 4],
                        help="Final scale factor (default: 4)")
    parser.add_argument("--model", type=int, default=0, choices=[0, 1],
                        help="Model: 0=realesrgan-x4plus (general), 1=realesr-animevideov3 (anime)")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    if not input_path.exists():
        print(f"Error: {input_path} not found")
        sys.exit(1)

    if args.output:
        output_path = Path(args.output).resolve()
    else:
        suffix = f"_{args.scale}x" if args.scale != 4 else "_4k"
        output_path = input_path.with_stem(input_path.stem + suffix)

    # Get source info
    width, height, fps_str, duration = get_video_info(input_path)
    if not all([width, height, fps_str, duration]):
        print("Error: couldn't read video info")
        sys.exit(1)

    target_w = width * args.scale
    target_h = height * args.scale
    total_frames = int(float(duration) * eval(fps_str))  # fps_str is like "24/1"

    print(f"Input:  {width}x{height}, {fps_str} fps, {duration:.1f}s ({total_frames} frames)")
    print(f"Output: {target_w}x{target_h} ({args.scale}x)")
    print(f"Model:  {'realesrgan-x4plus' if args.model == 0 else 'realesr-animevideov3'}")
    print()

    # Import here so --help works without the dependency
    from realesrgan_ncnn_py import Realesrgan
    from PIL import Image

    with tempfile.TemporaryDirectory() as tmpdir:
        frames_src = Path(tmpdir) / "src"
        frames_up = Path(tmpdir) / "up"
        frames_src.mkdir()
        frames_up.mkdir()

        # Step 1: Extract frames
        print("Extracting frames...")
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(input_path),
             "-qscale:v", "2", str(frames_src / "frame_%05d.png")],
            capture_output=True
        )
        frames = sorted(frames_src.glob("frame_*.png"))
        total = len(frames)
        print(f"Extracted {total} frames")

        # Step 2: AI upscale (2x)
        print(f"AI upscaling ({total} frames)...")
        upscaler = Realesrgan(gpuid=0, model=args.model)

        start = time.time()
        for i, frame_path in enumerate(frames):
            out_path = frames_up / frame_path.name
            img = Image.open(frame_path)
            result = upscaler.process_pil(img)
            result.save(out_path)
            elapsed = time.time() - start
            fps = (i + 1) / elapsed if elapsed > 0 else 0
            eta = (total - i - 1) / fps if fps > 0 else 0
            print(f"\r  [{i+1}/{total}] {fps:.1f} fps, ETA: {eta/60:.1f} min", end="", flush=True)

        print(f"\nUpscale complete in {(time.time()-start)/60:.1f} minutes")

        # Step 3: Reassemble
        # If scale > 2, use lanczos to reach target resolution
        scale_filter = ""
        if args.scale > 2:
            scale_filter = f"-vf scale={target_w}:{target_h}:flags=lanczos"

        print("Reassembling video...")
        temp_video = Path(tmpdir) / "video_noaudio.mp4"
        reassemble_cmd = [
            "ffmpeg", "-y",
            "-framerate", fps_str,
            "-i", str(frames_up / "frame_%05d.png"),
        ]
        if scale_filter:
            reassemble_cmd += ["-vf", f"scale={target_w}:{target_h}:flags=lanczos"]
        reassemble_cmd += [
            "-c:v", "libx264", "-crf", "18", "-preset", "slow",
            "-pix_fmt", "yuv420p",
            str(temp_video)
        ]
        subprocess.run(reassemble_cmd, capture_output=True)

        # Step 4: Add audio from original
        print("Adding audio...")
        subprocess.run([
            "ffmpeg", "-y",
            "-i", str(temp_video),
            "-i", str(input_path),
            "-map", "0:v", "-map", "1:a",
            "-c:v", "copy", "-c:a", "aac",
            str(output_path)
        ], capture_output=True)

    size_mb = output_path.stat().st_size / 1024 / 1024
    print(f"\nDone! {output_path} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
