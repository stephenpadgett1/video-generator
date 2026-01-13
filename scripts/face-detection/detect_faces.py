#!/usr/bin/env python3
"""
Face detection script for video-generator.
Accepts JSON input via stdin, detects faces, and outputs embeddings as JSON.

Usage:
    echo '{"frames": ["/path/to/frame.png"]}' | python detect_faces.py

    # Or with a file:
    python detect_faces.py < input.json
"""

import sys
import json
import os
from typing import Optional

import face_recognition
import numpy as np


def detect_faces_in_image(image_path: str) -> dict:
    """
    Detect faces in a single image and return locations + embeddings.

    Returns:
        {
            "frame_path": str,
            "faces": [
                {
                    "location": {"top": int, "right": int, "bottom": int, "left": int},
                    "embedding": list[float]  # 128-dim vector
                }
            ],
            "error": str | None
        }
    """
    result = {
        "frame_path": image_path,
        "faces": [],
        "error": None
    }

    # Check file exists
    if not os.path.exists(image_path):
        result["error"] = f"File not found: {image_path}"
        return result

    try:
        # Load image
        image = face_recognition.load_image_file(image_path)

        # Detect face locations using HOG model (faster than CNN, good enough for ~85% accuracy)
        # Returns list of (top, right, bottom, left) tuples
        face_locations = face_recognition.face_locations(image, model="hog")

        if not face_locations:
            # No faces found - not an error, just empty result
            return result

        # Get face encodings (128-dim embeddings) for each detected face
        face_encodings = face_recognition.face_encodings(image, face_locations)

        for location, encoding in zip(face_locations, face_encodings):
            top, right, bottom, left = location
            result["faces"].append({
                "location": {
                    "top": int(top),
                    "right": int(right),
                    "bottom": int(bottom),
                    "left": int(left)
                },
                "embedding": encoding.tolist()  # Convert numpy array to list
            })

    except Exception as e:
        result["error"] = str(e)

    return result


def process_batch(input_data: dict) -> dict:
    """
    Process a batch of frames.

    Input:
        {"frames": ["/path/to/frame1.png", "/path/to/frame2.png", ...]}

    Output:
        {
            "results": [...],
            "stats": {
                "frames_processed": int,
                "faces_detected": int,
                "errors": int
            }
        }
    """
    frames = input_data.get("frames", [])
    results = []
    total_faces = 0
    error_count = 0

    for frame_path in frames:
        result = detect_faces_in_image(frame_path)
        results.append(result)

        if result["error"]:
            error_count += 1
        else:
            total_faces += len(result["faces"])

    return {
        "results": results,
        "stats": {
            "frames_processed": len(frames),
            "faces_detected": total_faces,
            "errors": error_count
        }
    }


def main():
    # Read JSON from stdin
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}), file=sys.stdout)
        sys.exit(1)

    # Process frames
    output = process_batch(input_data)

    # Write JSON to stdout
    print(json.dumps(output))


if __name__ == "__main__":
    main()
