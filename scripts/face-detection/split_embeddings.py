#!/usr/bin/env python3
"""
Split characters.json into lightweight metadata and separate centroids file.
"""

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
CHARS_JSON = PROJECT_ROOT / "docs" / "clip-metadata" / "characters.json"
CENTROIDS_JSON = PROJECT_ROOT / "docs" / "clip-metadata" / "character_centroids.json"

def main():
    # Load current characters
    with open(CHARS_JSON) as f:
        data = json.load(f)

    # Extract centroids into separate structure
    centroids = {
        "version": "1.0.0",
        "description": "Character face embedding centroids (128-dim vectors). Used for face matching.",
        "centroids": {}
    }

    # Process each character - remove centroid, store separately
    for char_id, char_data in data["characters"].items():
        if "centroid" in char_data:
            centroids["centroids"][char_id] = char_data.pop("centroid")

    # Save lightweight characters.json
    with open(CHARS_JSON, "w") as f:
        json.dump(data, f, indent=2)

    # Save centroids to separate file
    with open(CENTROIDS_JSON, "w") as f:
        json.dump(centroids, f, indent=2)

    # Report sizes
    chars_size = CHARS_JSON.stat().st_size
    centroids_size = CENTROIDS_JSON.stat().st_size

    print(f"Split complete!")
    print(f"  characters.json: {chars_size:,} bytes ({chars_size/1024:.1f} KB)")
    print(f"  character_centroids.json: {centroids_size:,} bytes ({centroids_size/1024:.1f} KB)")
    print(f"  Total characters: {len(data['characters'])}")
    print(f"  Centroids extracted: {len(centroids['centroids'])}")

if __name__ == "__main__":
    main()
