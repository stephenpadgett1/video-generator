#!/usr/bin/env python3
"""
Process all video clips for face detection and character clustering.
Saves results to docs/clip-metadata/clips.json and characters.json.
"""

import sys
import os
import json
import subprocess
import shutil
from pathlib import Path
from datetime import datetime

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent))

from detect_faces import detect_faces_in_image
from cluster_characters import cluster_faces

PROJECT_ROOT = Path(__file__).parent.parent.parent
VIDEO_DIR = PROJECT_ROOT / "data" / "video"
TEMP_DIR = PROJECT_ROOT / "data" / "temp" / "face_batch"
CLIPS_JSON = PROJECT_ROOT / "docs" / "clip-metadata" / "clips.json"
CHARACTERS_JSON = PROJECT_ROOT / "docs" / "clip-metadata" / "characters.json"
CENTROIDS_JSON = PROJECT_ROOT / "docs" / "clip-metadata" / "character_centroids.json"


def get_video_duration(video_path: str) -> float:
    """Get video duration using ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
        "-of", "csv=p=0", video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(result.stdout.strip())
    except:
        return 8.0


def extract_frames(video_path: str, clip_id: str) -> list[tuple[str, float]]:
    """Extract 3 frames from a video at start, middle, end."""
    duration = get_video_duration(video_path)
    timestamps = [0.5, duration / 2, max(duration - 0.5, duration * 0.9)]

    clip_dir = TEMP_DIR / clip_id
    clip_dir.mkdir(parents=True, exist_ok=True)

    frame_paths = []
    for ts in timestamps:
        frame_path = clip_dir / f"frame_{ts:.2f}s.png"
        cmd = [
            "ffmpeg", "-y", "-ss", str(ts), "-i", video_path,
            "-frames:v", "1", "-q:v", "2", str(frame_path)
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if frame_path.exists():
            frame_paths.append((str(frame_path), ts))

    return frame_paths


def main():
    print("=" * 60)
    print("FACE DETECTION - FULL BATCH PROCESSING")
    print("=" * 60)

    # Load existing clips.json
    if not CLIPS_JSON.exists():
        print(f"ERROR: {CLIPS_JSON} not found")
        sys.exit(1)

    with open(CLIPS_JSON) as f:
        clips_db = json.load(f)

    # Get all video files
    video_files = sorted(VIDEO_DIR.glob("*.mp4"))
    print(f"\nFound {len(video_files)} video files")

    # Ensure temp dir
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    # Track all faces for clustering
    all_faces = []
    clips_with_faces = 0
    clips_processed = 0
    clips_skipped = 0

    print("\nProcessing clips...")
    print("-" * 60)

    for i, video_path in enumerate(video_files):
        clip_id = video_path.stem

        # Progress indicator
        if (i + 1) % 20 == 0 or i == 0:
            print(f"  [{i+1}/{len(video_files)}] Processing {clip_id}...")

        # Skip if not in clips.json (shouldn't happen)
        if clip_id not in clips_db["clips"]:
            clips_skipped += 1
            continue

        clip_data = clips_db["clips"][clip_id]

        # Extract frames
        frame_data = extract_frames(str(video_path), clip_id)
        if not frame_data:
            clips_skipped += 1
            continue

        # Detect faces
        clip_faces = []
        for frame_path, timestamp in frame_data:
            detection = detect_faces_in_image(frame_path)
            if detection["error"]:
                continue

            for j, face in enumerate(detection["faces"]):
                face_id = f"face_{clip_id}_{timestamp:.2f}_{j}"
                face_entry = {
                    "face_id": face_id,
                    "frame_timestamp": timestamp,
                    "location": face["location"],
                    "embedding": face["embedding"],
                    "character_id": None
                }
                clip_faces.append(face_entry)
                all_faces.append({
                    "face_id": face_id,
                    "clip_id": clip_id,
                    "embedding": face["embedding"]
                })

        # Update clip metadata with faces
        clip_data["faces"] = {
            "detected_at": datetime.now().isoformat(),
            "faces": clip_faces,
            "total_faces": len(clip_faces),
            "unique_characters": []
        }

        clips_processed += 1
        if len(clip_faces) > 0:
            clips_with_faces += 1

        # Clean up frames for this clip
        clip_temp = TEMP_DIR / clip_id
        if clip_temp.exists():
            shutil.rmtree(clip_temp)

    print("-" * 60)
    print(f"\nFace Detection Complete:")
    print(f"  Clips processed: {clips_processed}")
    print(f"  Clips with faces: {clips_with_faces}")
    print(f"  Total faces detected: {len(all_faces)}")

    # Save updated clips.json
    clips_db["updated_at"] = datetime.now().isoformat()
    with open(CLIPS_JSON, "w") as f:
        json.dump(clips_db, f, indent=2)
    print(f"\nSaved face data to {CLIPS_JSON}")

    # Cluster faces
    print("\n" + "=" * 60)
    print("CLUSTERING FACES INTO CHARACTERS")
    print("=" * 60)

    if len(all_faces) > 0:
        cluster_input = [{"face_id": f["face_id"], "embedding": f["embedding"]} for f in all_faces]
        cluster_result = cluster_faces(cluster_input, eps=0.5, min_samples=2)

        print(f"\nClustering Results:")
        print(f"  Characters found: {cluster_result['stats']['characters_found']}")
        print(f"  Faces assigned: {cluster_result['stats']['faces_assigned']}")
        print(f"  Faces unassigned: {cluster_result['stats']['faces_unassigned']}")

        # Build face_id -> clip_id mapping
        face_to_clip = {f["face_id"]: f["clip_id"] for f in all_faces}

        # Build character database (metadata only) and centroids database (stored separately)
        now = datetime.now().isoformat()
        characters_db = {
            "version": "1.0.0",
            "updated_at": now,
            "characters": {}
        }
        centroids_db = {
            "version": "1.0.0",
            "description": "Character face embedding centroids (128-dim vectors). Used for face matching.",
            "centroids": {}
        }

        for char in cluster_result["characters"]:
            clip_ids = list(set(face_to_clip[fid] for fid in char["face_ids"]))
            # Store centroid separately
            centroids_db["centroids"][char["character_id"]] = char["centroid"]
            # Store metadata without centroid
            characters_db["characters"][char["character_id"]] = {
                "character_id": char["character_id"],
                # centroid stored separately in character_centroids.json
                "face_ids": char["face_ids"],
                "clip_ids": clip_ids,
                "occurrence_count": char["occurrence_count"],
                "representative_frame": None,
                "metadata": {
                    "first_seen": now,
                    "last_clustered": now
                }
            }

        # Update clips.json with character assignments
        face_to_char = {}
        for char in cluster_result["characters"]:
            for fid in char["face_ids"]:
                face_to_char[fid] = char["character_id"]

        for clip_id, clip_data in clips_db["clips"].items():
            if "faces" in clip_data and clip_data["faces"]:
                unique_chars = set()
                for face in clip_data["faces"]["faces"]:
                    char_id = face_to_char.get(face["face_id"])
                    if char_id:
                        face["character_id"] = char_id
                        unique_chars.add(char_id)
                clip_data["faces"]["unique_characters"] = sorted(list(unique_chars))

        # Save all files
        with open(CLIPS_JSON, "w") as f:
            json.dump(clips_db, f, indent=2)

        with open(CHARACTERS_JSON, "w") as f:
            json.dump(characters_db, f, indent=2)

        with open(CENTROIDS_JSON, "w") as f:
            json.dump(centroids_db, f, indent=2)

        print(f"\nSaved character metadata to {CHARACTERS_JSON}")
        print(f"Saved centroids to {CENTROIDS_JSON}")

        # Print character summary
        print("\n" + "=" * 60)
        print("CHARACTER SUMMARY")
        print("=" * 60)
        chars_sorted = sorted(
            characters_db["characters"].values(),
            key=lambda c: c["occurrence_count"],
            reverse=True
        )
        for char in chars_sorted[:15]:  # Top 15
            print(f"  {char['character_id']}: {char['occurrence_count']} faces in {len(char['clip_ids'])} clips")
        if len(chars_sorted) > 15:
            print(f"  ... and {len(chars_sorted) - 15} more characters")

    else:
        print("\nNo faces detected, skipping clustering.")

    # Clean up temp directory
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR)

    print("\n" + "=" * 60)
    print("COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
