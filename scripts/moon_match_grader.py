#!/usr/bin/env python3
"""
Moon Match Grader - Scores edit point continuity based on moon position.

Usage:
    python moon_match_grader.py frame_a.png frame_b.png
    python moon_match_grader.py --test-dir <directory>  # grade all pairs
"""

import cv2
import numpy as np
import sys
from pathlib import Path


def find_moon_centroid(image_path, roi_bounds=(0.05, 0.55, 0.15, 0.55), debug=False):
    """
    Find the centroid of the moon (brightest blob) in the upper-left ROI.

    roi_bounds: (x_start%, x_end%, y_start%, y_end%) as fractions of image size

    Returns: (x, y) centroid in ROI coordinates, or None if not found
    """
    img = cv2.imread(str(image_path))
    if img is None:
        print(f"Error: Could not read {image_path}")
        return None

    h, w = img.shape[:2]

    # Extract ROI (upper-left region where moon should be)
    x1 = int(w * roi_bounds[0])
    x2 = int(w * roi_bounds[1])
    y1 = int(h * roi_bounds[2])
    y2 = int(h * roi_bounds[3])

    roi = img[y1:y2, x1:x2]

    # Convert to grayscale
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

    # Threshold to find bright regions (moon should be brightest)
    # Use adaptive threshold based on max brightness
    max_val = gray.max()
    threshold = max_val * 0.7  # 70% of max brightness
    _, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)

    # Find contours
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        # Try lower threshold
        threshold = max_val * 0.5
        _, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        print(f"Warning: No bright regions found in {image_path}")
        return None

    # Find the most circular contour (moon should be round)
    best_contour = None
    best_circularity = 0

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 500:  # Skip small noise (moon should be substantial)
            continue
        perimeter = cv2.arcLength(contour, True)
        if perimeter == 0:
            continue
        circularity = 4 * np.pi * area / (perimeter * perimeter)

        # Score combines circularity and size (prefer larger, rounder objects)
        size_score = min(area / 5000, 1.0)  # Normalize size contribution
        combined_score = circularity * 0.7 + size_score * 0.3

        if combined_score > best_circularity:
            best_circularity = combined_score
            best_contour = contour

    if best_contour is None:
        # Fallback: use largest contour
        best_contour = max(contours, key=cv2.contourArea)

    # Get centroid
    M = cv2.moments(best_contour)
    if M["m00"] == 0:
        return None

    cx = int(M["m10"] / M["m00"])
    cy = int(M["m01"] / M["m00"])

    # Normalize to ROI size (0-1 range)
    roi_h, roi_w = roi.shape[:2]
    cx_norm = cx / roi_w
    cy_norm = cy / roi_h

    if debug:
        # Draw debug visualization
        debug_img = roi.copy()
        cv2.drawContours(debug_img, [best_contour], -1, (0, 255, 0), 2)
        cv2.circle(debug_img, (cx, cy), 5, (0, 0, 255), -1)
        debug_path = Path(image_path).stem + "_moon_debug.png"
        cv2.imwrite(debug_path, debug_img)
        print(f"Debug image saved: {debug_path}")

    return (cx_norm, cy_norm, best_circularity)


def grade_moon_match(frame_a_path, frame_b_path, debug=False):
    """
    Grade the moon position match between two frames.

    Returns: dict with score (0-1), distance, and details
    """
    result_a = find_moon_centroid(frame_a_path, debug=debug)
    result_b = find_moon_centroid(frame_b_path, debug=debug)

    if result_a is None or result_b is None:
        return {
            "score": 0,
            "error": "Could not find moon in one or both frames",
            "frame_a": str(frame_a_path),
            "frame_b": str(frame_b_path),
        }

    cx_a, cy_a, circ_a = result_a
    cx_b, cy_b, circ_b = result_b

    # Calculate Euclidean distance (in normalized 0-1 space)
    distance = np.sqrt((cx_a - cx_b)**2 + (cy_a - cy_b)**2)

    # Max possible distance in normalized space is sqrt(2) ≈ 1.414
    # Convert to score (1 = perfect match, 0 = max distance)
    max_distance = np.sqrt(2)
    score = 1 - (distance / max_distance)

    # Boost score if both are highly circular (confident moon detection)
    avg_circularity = (circ_a + circ_b) / 2
    confidence = min(avg_circularity, 1.0)

    return {
        "score": round(score, 3),
        "distance": round(distance, 4),
        "confidence": round(confidence, 3),
        "frame_a": {
            "path": str(frame_a_path),
            "centroid": (round(cx_a, 3), round(cy_a, 3)),
            "circularity": round(circ_a, 3)
        },
        "frame_b": {
            "path": str(frame_b_path),
            "centroid": (round(cx_b, 3), round(cy_b, 3)),
            "circularity": round(circ_b, 3)
        }
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Grade moon position match at edit points")
    parser.add_argument("frame_a", nargs="?", help="First frame (end of clip A)")
    parser.add_argument("frame_b", nargs="?", help="Second frame (start of clip B)")
    parser.add_argument("--debug", action="store_true", help="Save debug visualizations")
    args = parser.parse_args()

    if not args.frame_a or not args.frame_b:
        parser.print_help()
        sys.exit(1)

    result = grade_moon_match(args.frame_a, args.frame_b, debug=args.debug)

    print(f"\n{'='*50}")
    print(f"MOON MATCH GRADE")
    print(f"{'='*50}")
    print(f"Frame A: {result.get('frame_a', {}).get('path', 'N/A')}")
    print(f"Frame B: {result.get('frame_b', {}).get('path', 'N/A')}")
    print(f"{'='*50}")

    if "error" in result:
        print(f"ERROR: {result['error']}")
    else:
        print(f"Score:      {result['score']:.3f} (1.0 = perfect)")
        print(f"Distance:   {result['distance']:.4f} (normalized)")
        print(f"Confidence: {result['confidence']:.3f} (circularity)")
        print(f"")
        print(f"Frame A centroid: {result['frame_a']['centroid']}")
        print(f"Frame B centroid: {result['frame_b']['centroid']}")

    print(f"{'='*50}\n")

    return result


if __name__ == "__main__":
    main()
