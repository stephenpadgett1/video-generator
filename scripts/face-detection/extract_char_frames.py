#!/usr/bin/env python3
"""
Extract representative frames for each character.
"""

import json
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
VIDEO_DIR = PROJECT_ROOT / "data" / "video"
CHARS_JSON = PROJECT_ROOT / "docs" / "clip-metadata" / "characters.json"
CLIPS_JSON = PROJECT_ROOT / "docs" / "clip-metadata" / "clips.json"
OUTPUT_DIR = PROJECT_ROOT / "data" / "temp" / "char_frames"

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(CHARS_JSON) as f:
        chars_db = json.load(f)

    with open(CLIPS_JSON) as f:
        clips_db = json.load(f)

    results = []

    for char_id, char in sorted(chars_db["characters"].items(), key=lambda x: -x[1]["occurrence_count"]):
        # Get first clip and face info
        if not char["clip_ids"]:
            continue

        clip_id = char["clip_ids"][0]
        video_path = VIDEO_DIR / f"{clip_id}.mp4"

        if not video_path.exists():
            continue

        # Find a face timestamp from this clip
        clip_data = clips_db["clips"].get(clip_id, {})
        faces = clip_data.get("faces", {}).get("faces", [])

        # Find a face belonging to this character
        timestamp = 2.0  # default
        for face in faces:
            if face.get("character_id") == char_id:
                timestamp = face.get("frame_timestamp", 2.0)
                break

        # Extract frame
        frame_path = OUTPUT_DIR / f"{char_id}.png"
        cmd = [
            "ffmpeg", "-y", "-ss", str(timestamp), "-i", str(video_path),
            "-frames:v", "1", "-q:v", "2", str(frame_path)
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        if frame_path.exists():
            results.append({
                "char_id": char_id,
                "faces": char["occurrence_count"],
                "clips": len(char["clip_ids"]),
                "frame_path": str(frame_path),
                "source_clip": clip_id
            })

    print(f"Extracted {len(results)} character frames to {OUTPUT_DIR}")
    print("\nCharacters (by occurrence):")
    for r in results:
        print(f"  {r['char_id']}: {r['faces']} faces, {r['clips']} clips - {r['frame_path']}")

if __name__ == "__main__":
    main()
