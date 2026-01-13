#!/usr/bin/env python3
"""
Character clustering script for video-generator.
Takes face embeddings and clusters them into character groups using DBSCAN.

Usage:
    echo '{"faces": [{"face_id": "f1", "embedding": [...]}]}' | python cluster_characters.py

    # With custom parameters:
    echo '{"faces": [...], "eps": 0.5, "min_samples": 2}' | python cluster_characters.py
"""

import sys
import json
from typing import Optional

import numpy as np
from sklearn.cluster import DBSCAN


def cluster_faces(
    faces: list[dict],
    eps: float = 0.5,
    min_samples: int = 2
) -> dict:
    """
    Cluster face embeddings into character groups.

    Args:
        faces: List of {"face_id": str, "embedding": list[float], ...}
        eps: DBSCAN epsilon - max distance between faces in same cluster
             Lower = stricter matching, higher = more lenient
             0.5 is a good default for ~85% accuracy
        min_samples: Minimum faces to form a character cluster

    Returns:
        {
            "characters": [
                {
                    "character_id": "char_001",
                    "face_ids": ["f1", "f3", "f7"],
                    "centroid": [...],  # 128-dim average embedding
                    "occurrence_count": 3
                }
            ],
            "unassigned": ["f2", "f5"],  # faces that didn't cluster (noise)
            "stats": {
                "total_faces": int,
                "characters_found": int,
                "faces_assigned": int,
                "faces_unassigned": int
            }
        }
    """
    if not faces:
        return {
            "characters": [],
            "unassigned": [],
            "stats": {
                "total_faces": 0,
                "characters_found": 0,
                "faces_assigned": 0,
                "faces_unassigned": 0
            }
        }

    # Extract embeddings and face_ids
    face_ids = [f["face_id"] for f in faces]
    embeddings = np.array([f["embedding"] for f in faces])

    # Run DBSCAN clustering
    # DBSCAN labels: -1 = noise (unassigned), 0+ = cluster index
    clustering = DBSCAN(eps=eps, min_samples=min_samples, metric="euclidean")
    labels = clustering.fit_predict(embeddings)

    # Group faces by cluster
    clusters: dict[int, list[int]] = {}  # cluster_id -> list of indices
    unassigned_indices: list[int] = []

    for idx, label in enumerate(labels):
        if label == -1:
            unassigned_indices.append(idx)
        else:
            if label not in clusters:
                clusters[label] = []
            clusters[label].append(idx)

    # Build character objects
    characters = []
    for cluster_id, indices in sorted(clusters.items()):
        cluster_embeddings = embeddings[indices]
        centroid = np.mean(cluster_embeddings, axis=0)

        characters.append({
            "character_id": f"char_{cluster_id + 1:03d}",
            "face_ids": [face_ids[i] for i in indices],
            "centroid": centroid.tolist(),
            "occurrence_count": len(indices)
        })

    unassigned = [face_ids[i] for i in unassigned_indices]

    return {
        "characters": characters,
        "unassigned": unassigned,
        "stats": {
            "total_faces": len(faces),
            "characters_found": len(characters),
            "faces_assigned": len(face_ids) - len(unassigned),
            "faces_unassigned": len(unassigned)
        }
    }


def find_matching_character(
    embedding: list[float],
    characters: list[dict],
    threshold: float = 0.5
) -> Optional[dict]:
    """
    Find which character a face embedding matches.

    Args:
        embedding: 128-dim face embedding
        characters: List of character dicts with "centroid" field
        threshold: Max distance to consider a match

    Returns:
        {"character_id": str, "distance": float} or None if no match
    """
    if not characters:
        return None

    embedding_arr = np.array(embedding)
    best_match = None
    best_distance = float("inf")

    for char in characters:
        centroid = np.array(char["centroid"])
        distance = np.linalg.norm(embedding_arr - centroid)

        if distance < threshold and distance < best_distance:
            best_distance = distance
            best_match = {
                "character_id": char["character_id"],
                "distance": float(distance)
            }

    return best_match


def main():
    # Read JSON from stdin
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}), file=sys.stdout)
        sys.exit(1)

    # Check for required fields
    if "faces" not in input_data:
        print(json.dumps({"error": "Missing 'faces' field in input"}), file=sys.stdout)
        sys.exit(1)

    # Get parameters
    faces = input_data["faces"]
    eps = input_data.get("eps", 0.5)
    min_samples = input_data.get("min_samples", 2)

    # Check for match mode (find character for single embedding)
    if "find_match" in input_data:
        embedding = input_data["find_match"]["embedding"]
        characters = input_data["find_match"]["characters"]
        threshold = input_data["find_match"].get("threshold", 0.5)

        match = find_matching_character(embedding, characters, threshold)
        print(json.dumps({"match": match}))
        return

    # Cluster faces
    output = cluster_faces(faces, eps=eps, min_samples=min_samples)

    # Write JSON to stdout
    print(json.dumps(output))


if __name__ == "__main__":
    main()
