#!/usr/bin/env python3
"""
Song Analysis - Onset Detection

Detects audio onsets (when sounds/notes start) and computes energy curves
using librosa. Accepts JSON via stdin, outputs JSON via stdout.

Input:
{
    "audio_path": "/path/to/song.mp3",
    "options": {
        "onset_threshold": 0.5,    // Sensitivity 0-1 (default 0.5)
        "energy_threshold": 0.3,   // Section detection threshold (default 0.3)
        "hop_length": 512          // Analysis hop length (default 512)
    }
}

Output:
{
    "onsets": [{"time": 0.5, "strength": 0.85}, ...],
    "energy_curve": [{"time": 0.0, "rms": 0.12}, ...],
    "sections": [{"start": 0.0, "end": 15.2, "type": "quiet"}, ...],
    "duration": 180.5
}
"""

import json
import sys
import numpy as np

try:
    import librosa
except ImportError:
    print(json.dumps({
        "error": "librosa not installed. Run: pip install librosa numpy soundfile"
    }))
    sys.exit(1)


def detect_onsets(y, sr, hop_length=512, threshold=0.5):
    """
    Detect audio onsets using librosa.

    Returns list of {time, strength} dicts.
    """
    # Get onset strength envelope
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)

    # Normalize to 0-1
    onset_env_norm = onset_env / (onset_env.max() + 1e-10)

    # Detect onset frames
    onset_frames = librosa.onset.onset_detect(
        y=y,
        sr=sr,
        hop_length=hop_length,
        backtrack=True,
        units='frames'
    )

    # Convert to times and get strengths
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop_length)

    onsets = []
    for i, frame in enumerate(onset_frames):
        if frame < len(onset_env_norm):
            strength = float(onset_env_norm[frame])
            # Only include onsets with strength >= 0.2 (filter weak detections)
            if strength >= 0.2:
                onsets.append({
                    "time": round(float(onset_times[i]), 3),
                    "strength": round(strength, 3)
                })

    return onsets


def compute_energy_curve(y, sr, hop_length=512):
    """
    Compute RMS energy curve.

    Returns list of {time, rms} dicts.
    """
    # Compute RMS energy
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]

    # Get times for each frame
    times = librosa.frames_to_time(range(len(rms)), sr=sr, hop_length=hop_length)

    # Normalize RMS to 0-1
    rms_norm = rms / (rms.max() + 1e-10)

    # Sample every 0.1s to reduce output size
    sample_interval = max(1, int(0.1 * sr / hop_length))

    energy_curve = []
    for i in range(0, len(rms), sample_interval):
        energy_curve.append({
            "time": round(float(times[i]), 2),
            "rms": round(float(rms_norm[i]), 3)
        })

    return energy_curve


def detect_sections(y, sr, hop_length=512, threshold=0.3):
    """
    Detect loud/quiet sections based on RMS energy threshold.

    Returns list of {start, end, type} dicts.
    """
    # Compute RMS energy
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]

    # Normalize to 0-1
    rms_norm = rms / (rms.max() + 1e-10)

    # Get times
    times = librosa.frames_to_time(range(len(rms)), sr=sr, hop_length=hop_length)

    # Classify each frame as loud or quiet
    is_loud = rms_norm >= threshold

    # Find section boundaries
    sections = []
    current_type = "loud" if is_loud[0] else "quiet"
    section_start = 0.0

    for i in range(1, len(is_loud)):
        new_type = "loud" if is_loud[i] else "quiet"
        if new_type != current_type:
            # End current section
            sections.append({
                "start": round(section_start, 2),
                "end": round(float(times[i]), 2),
                "type": current_type
            })
            # Start new section
            section_start = float(times[i])
            current_type = new_type

    # Add final section
    if len(times) > 0:
        sections.append({
            "start": round(section_start, 2),
            "end": round(float(times[-1]), 2),
            "type": current_type
        })

    # Merge adjacent sections of same type (cleanup tiny fluctuations)
    merged = []
    for section in sections:
        if merged and merged[-1]["type"] == section["type"]:
            merged[-1]["end"] = section["end"]
        else:
            # Only add sections longer than 0.5s
            if not merged or (section["end"] - section["start"]) >= 0.5:
                merged.append(section)
            elif merged:
                # Extend previous section
                merged[-1]["end"] = section["end"]

    return merged


def analyze_audio(audio_path, options=None):
    """
    Main analysis function.
    """
    options = options or {}
    onset_threshold = options.get("onset_threshold", 0.5)
    energy_threshold = options.get("energy_threshold", 0.3)
    hop_length = options.get("hop_length", 512)

    # Load audio
    try:
        y, sr = librosa.load(audio_path, sr=None)
    except Exception as e:
        return {"error": f"Failed to load audio: {str(e)}"}

    # Get duration
    duration = librosa.get_duration(y=y, sr=sr)

    # Detect onsets
    onsets = detect_onsets(y, sr, hop_length, onset_threshold)

    # Compute energy curve
    energy_curve = compute_energy_curve(y, sr, hop_length)

    # Detect sections
    sections = detect_sections(y, sr, hop_length, energy_threshold)

    return {
        "onsets": onsets,
        "energy_curve": energy_curve,
        "sections": sections,
        "duration": round(duration, 2)
    }


def main():
    # Read JSON input from stdin
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {str(e)}"}))
        sys.exit(1)

    audio_path = input_data.get("audio_path")
    if not audio_path:
        print(json.dumps({"error": "audio_path is required"}))
        sys.exit(1)

    options = input_data.get("options", {})

    # Run analysis
    result = analyze_audio(audio_path, options)

    # Output JSON
    print(json.dumps(result))


if __name__ == "__main__":
    main()
