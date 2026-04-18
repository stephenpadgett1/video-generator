---
name: upscale
description: AI upscale video to 4K using Real-ESRGAN. Use when upscaling videos, improving resolution, or preparing final exports at higher quality. Requires realesrgan-ncnn-py (pip install realesrgan-ncnn-py).
allowed-tools: Bash, Read, Glob
---

# Upscale Video

AI-powered video upscaling using Real-ESRGAN on Apple Silicon (Metal GPU).

## Tool

`python3 tools/upscale.py <input.mp4> [output.mp4] [--scale 2|3|4] [--model 0|1]`

## Quick Usage

```bash
# Default: 4x upscale (720p -> 4K) with general model
python3 tools/upscale.py data/workspace/my_video.mp4

# Explicit output path
python3 tools/upscale.py data/workspace/my_video.mp4 data/workspace/my_video_4k.mp4

# 2x only (faster, no lanczos pass)
python3 tools/upscale.py data/workspace/my_video.mp4 --scale 2

# Anime/animation model
python3 tools/upscale.py data/workspace/my_video.mp4 --model 1
```

## Models

| Model | Flag | Best For |
|-------|------|----------|
| realesrgan-x4plus | `--model 0` (default) | Live action, photography, general |
| realesr-animevideov3 | `--model 1` | Animation, anime, cartoon |

## How It Works

1. Extracts all frames from video using ffmpeg
2. Upscales each frame 2x using Real-ESRGAN AI model on GPU (Metal)
3. If target scale > 2x, applies lanczos interpolation for remaining upscale
4. Reassembles frames into video with libx264 (crf 18, slow preset)
5. Copies audio from original

## Performance

- ~2.4 fps on M3 Pro (720p source, model 0)
- A 45-second 720p video takes ~7 minutes to upscale to 4K
- Uses temp directory for frames (auto-cleaned)

## Prerequisites

```bash
pip install realesrgan-ncnn-py
```

This package bundles the ncnn-vulkan binary and model weights (~51MB). Works on macOS Apple Silicon via Metal.

## Steps (when invoked as skill)

1. **Identify the video** — Confirm input path and desired output resolution with user.
2. **Check dependency** — Verify `realesrgan-ncnn-py` is installed: `python3 -c "import realesrgan_ncnn_py"`.
   If missing: `pip install realesrgan-ncnn-py`.
3. **Run upscale** — Execute the tool. For long videos, run in background.
4. **Verify output** — Check output file exists, confirm resolution with ffprobe, report file size.
