#!/usr/bin/env python3
"""
Edit Grader - Scores edit point continuity based on multiple criteria.

Analyzes object position, color, and size continuity between two frames.
Originally designed for moon tracking, now generic for any prominent object.

Usage:
    python edit_grader.py frame_a.png frame_b.png
    python edit_grader.py frame_a.png frame_b.png --criteria position color size
    python edit_grader.py frame_a.png frame_b.png --debug
"""

import cv2
import numpy as np
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, List, Dict, Any, Tuple


@dataclass
class ObjectFeatures:
    """Features extracted from a detected object."""
    contour: np.ndarray
    centroid: Tuple[float, float]  # Normalized (0-1) coordinates
    centroid_raw: Tuple[int, int]  # Raw pixel coordinates in ROI
    area: float  # Contour area in pixels
    area_normalized: float  # Area as fraction of ROI
    circularity: float  # How circular (0-1, 1=perfect circle)
    mask: np.ndarray  # Binary mask of the object
    color_histogram: np.ndarray  # HSV histogram
    roi_image: np.ndarray  # The ROI image for visualization


def compute_hsv_histogram(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Compute HSV histogram for the masked region.

    Args:
        image: BGR image (the ROI)
        mask: Binary mask (255 where object is)

    Returns:
        Normalized histogram array
    """
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Histogram bins: H=30 (0-180 in OpenCV), S=32, V=32
    h_bins, s_bins, v_bins = 30, 32, 32

    # Compute histogram for H and S channels (most discriminative)
    hist = cv2.calcHist(
        [hsv],
        [0, 1],  # H and S channels
        mask,
        [h_bins, s_bins],
        [0, 180, 0, 256]
    )

    # Normalize
    cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)

    return hist


def extract_object_features(
    image_path: str,
    roi_bounds: Tuple[float, float, float, float] = (0.05, 0.55, 0.15, 0.55),
    min_area: int = 500
) -> Optional[ObjectFeatures]:
    """
    Extract features from the most prominent object in the ROI.

    Args:
        image_path: Path to the image file
        roi_bounds: (x_start%, x_end%, y_start%, y_end%) as fractions
        min_area: Minimum contour area to consider

    Returns:
        ObjectFeatures or None if no object found
    """
    img = cv2.imread(str(image_path))
    if img is None:
        print(f"Error: Could not read {image_path}")
        return None

    h, w = img.shape[:2]

    # Extract ROI
    x1 = int(w * roi_bounds[0])
    x2 = int(w * roi_bounds[1])
    y1 = int(h * roi_bounds[2])
    y2 = int(h * roi_bounds[3])

    roi = img[y1:y2, x1:x2]
    roi_h, roi_w = roi.shape[:2]

    # Convert to grayscale
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

    # Adaptive threshold based on max brightness
    max_val = gray.max()
    threshold = max_val * 0.7
    _, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)

    # Find contours
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Try lower threshold if needed
    if not contours:
        threshold = max_val * 0.5
        _, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        print(f"Warning: No bright regions found in {image_path}")
        return None

    # Find the best contour (circular + large)
    best_contour = None
    best_score = 0

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue
        perimeter = cv2.arcLength(contour, True)
        if perimeter == 0:
            continue
        circularity = 4 * np.pi * area / (perimeter * perimeter)

        # Combined score: circularity + size
        size_score = min(area / 5000, 1.0)
        combined_score = circularity * 0.7 + size_score * 0.3

        if combined_score > best_score:
            best_score = combined_score
            best_contour = contour

    if best_contour is None:
        # Fallback: largest contour
        best_contour = max(contours, key=cv2.contourArea)

    # Get centroid
    M = cv2.moments(best_contour)
    if M["m00"] == 0:
        return None

    cx = int(M["m10"] / M["m00"])
    cy = int(M["m01"] / M["m00"])

    # Normalized centroid
    cx_norm = cx / roi_w
    cy_norm = cy / roi_h

    # Area
    area = cv2.contourArea(best_contour)
    area_normalized = area / (roi_w * roi_h)

    # Circularity
    perimeter = cv2.arcLength(best_contour, True)
    circularity = 4 * np.pi * area / (perimeter * perimeter) if perimeter > 0 else 0

    # Create mask for the object
    mask = np.zeros((roi_h, roi_w), dtype=np.uint8)
    cv2.drawContours(mask, [best_contour], -1, 255, -1)

    # Compute color histogram
    color_histogram = compute_hsv_histogram(roi, mask)

    return ObjectFeatures(
        contour=best_contour,
        centroid=(cx_norm, cy_norm),
        centroid_raw=(cx, cy),
        area=area,
        area_normalized=area_normalized,
        circularity=circularity,
        mask=mask,
        color_histogram=color_histogram,
        roi_image=roi
    )


def grade_position(features_a: ObjectFeatures, features_b: ObjectFeatures) -> Dict[str, Any]:
    """
    Grade position match based on centroid distance.

    Returns:
        Dict with score (0-1), distance, and details
    """
    cx_a, cy_a = features_a.centroid
    cx_b, cy_b = features_b.centroid

    # Euclidean distance in normalized space
    distance = np.sqrt((cx_a - cx_b)**2 + (cy_a - cy_b)**2)

    # Max distance is sqrt(2) ≈ 1.414
    max_distance = np.sqrt(2)
    score = 1 - (distance / max_distance)

    return {
        "score": round(score, 3),
        "distance": round(distance, 4),
        "centroid_a": (round(cx_a, 3), round(cy_a, 3)),
        "centroid_b": (round(cx_b, 3), round(cy_b, 3)),
    }


def grade_color(features_a: ObjectFeatures, features_b: ObjectFeatures) -> Dict[str, Any]:
    """
    Grade color match using histogram comparison.

    Uses correlation method: 1 = identical, -1 = inverse
    We normalize to 0-1 range.

    Returns:
        Dict with score (0-1) and comparison method
    """
    # Compare histograms using correlation
    correlation = cv2.compareHist(
        features_a.color_histogram,
        features_b.color_histogram,
        cv2.HISTCMP_CORREL
    )

    # Correlation ranges from -1 to 1, map to 0-1
    # -1 -> 0, 0 -> 0.5, 1 -> 1
    score = (correlation + 1) / 2

    return {
        "score": round(score, 3),
        "correlation": round(correlation, 4),
        "method": "HISTCMP_CORREL",
        "histogram_bins": "H=30, S=32"
    }


def grade_size(features_a: ObjectFeatures, features_b: ObjectFeatures) -> Dict[str, Any]:
    """
    Grade size match based on contour area comparison.

    Score = 1 - |area_a - area_b| / max(area_a, area_b)

    Returns:
        Dict with score (0-1) and area details
    """
    area_a = features_a.area_normalized
    area_b = features_b.area_normalized

    max_area = max(area_a, area_b)
    if max_area == 0:
        return {"score": 0, "error": "Zero area detected"}

    diff = abs(area_a - area_b)
    score = 1 - (diff / max_area)

    return {
        "score": round(score, 3),
        "area_a": round(area_a, 5),
        "area_b": round(area_b, 5),
        "ratio": round(min(area_a, area_b) / max_area, 3) if max_area > 0 else 0
    }


def grade_edit_point(
    frame_a_path: str,
    frame_b_path: str,
    criteria: Optional[List[str]] = None,
    weights: Optional[Dict[str, float]] = None,
    debug: bool = False
) -> Dict[str, Any]:
    """
    Grade edit point continuity using multiple criteria.

    Args:
        frame_a_path: Path to first frame (end of clip A)
        frame_b_path: Path to second frame (start of clip B)
        criteria: List of criteria to evaluate ['position', 'color', 'size']
                  If None, all criteria are used
        weights: Custom weights for each criterion
                 Default: {'position': 0.5, 'color': 0.3, 'size': 0.2}
        debug: Save debug visualization

    Returns:
        Dict with composite_score, breakdown, and details
    """
    # Default criteria
    if criteria is None:
        criteria = ['position', 'color', 'size']

    # Default weights
    if weights is None:
        weights = {'position': 0.5, 'color': 0.3, 'size': 0.2}

    # Normalize weights to sum to 1 for active criteria
    active_weights = {k: weights.get(k, 0) for k in criteria}
    weight_sum = sum(active_weights.values())
    if weight_sum > 0:
        active_weights = {k: v / weight_sum for k, v in active_weights.items()}

    # Extract features from both frames
    features_a = extract_object_features(frame_a_path)
    features_b = extract_object_features(frame_b_path)

    if features_a is None or features_b is None:
        return {
            "composite_score": 0,
            "error": "Could not extract object features from one or both frames",
            "frame_a": str(frame_a_path),
            "frame_b": str(frame_b_path),
        }

    # Grade each criterion
    breakdown = {}

    if 'position' in criteria:
        breakdown['position'] = grade_position(features_a, features_b)

    if 'color' in criteria:
        breakdown['color'] = grade_color(features_a, features_b)

    if 'size' in criteria:
        breakdown['size'] = grade_size(features_a, features_b)

    # Compute weighted composite score
    composite = sum(
        breakdown[k]['score'] * active_weights.get(k, 0)
        for k in breakdown
    )

    # Detection confidence (average circularity)
    confidence = (features_a.circularity + features_b.circularity) / 2

    result = {
        "composite_score": round(composite, 3),
        "breakdown": breakdown,
        "weights": active_weights,
        "confidence": round(confidence, 3),
        "frame_a": {
            "path": str(frame_a_path),
            "circularity": round(features_a.circularity, 3),
            "area": round(features_a.area_normalized, 5)
        },
        "frame_b": {
            "path": str(frame_b_path),
            "circularity": round(features_b.circularity, 3),
            "area": round(features_b.area_normalized, 5)
        }
    }

    if debug:
        save_debug_visualization(features_a, features_b, result, frame_a_path, frame_b_path)

    return result


def save_debug_visualization(
    features_a: ObjectFeatures,
    features_b: ObjectFeatures,
    result: Dict[str, Any],
    frame_a_path: str,
    frame_b_path: str
):
    """Save debug visualization with side-by-side comparison."""

    roi_a = features_a.roi_image.copy()
    roi_b = features_b.roi_image.copy()

    # Draw contours and centroids
    cv2.drawContours(roi_a, [features_a.contour], -1, (0, 255, 0), 2)
    cv2.circle(roi_a, features_a.centroid_raw, 5, (0, 0, 255), -1)

    cv2.drawContours(roi_b, [features_b.contour], -1, (0, 255, 0), 2)
    cv2.circle(roi_b, features_b.centroid_raw, 5, (0, 0, 255), -1)

    # Make both ROIs the same height for side-by-side
    h_a, w_a = roi_a.shape[:2]
    h_b, w_b = roi_b.shape[:2]
    max_h = max(h_a, h_b)

    if h_a < max_h:
        roi_a = cv2.copyMakeBorder(roi_a, 0, max_h - h_a, 0, 0, cv2.BORDER_CONSTANT, value=(0, 0, 0))
    if h_b < max_h:
        roi_b = cv2.copyMakeBorder(roi_b, 0, max_h - h_b, 0, 0, cv2.BORDER_CONSTANT, value=(0, 0, 0))

    # Create side-by-side image
    combined = np.hstack([roi_a, roi_b])

    # Add text annotations
    font = cv2.FONT_HERSHEY_SIMPLEX
    y_offset = 20

    # Add labels
    cv2.putText(combined, "Frame A", (10, y_offset), font, 0.5, (255, 255, 255), 1)
    cv2.putText(combined, "Frame B", (w_a + 10, y_offset), font, 0.5, (255, 255, 255), 1)

    # Add composite score
    cv2.putText(
        combined,
        f"Composite: {result['composite_score']:.3f}",
        (10, y_offset + 20),
        font, 0.5, (0, 255, 255), 1
    )

    # Add breakdown scores
    y = y_offset + 40
    for criterion, data in result.get('breakdown', {}).items():
        score = data.get('score', 0)
        color = (0, 255, 0) if score > 0.7 else (0, 255, 255) if score > 0.4 else (0, 0, 255)
        cv2.putText(combined, f"{criterion}: {score:.3f}", (10, y), font, 0.4, color, 1)
        y += 15

    # Save debug image
    debug_path = Path(frame_a_path).stem + "_edit_debug.png"
    cv2.imwrite(debug_path, combined)
    print(f"Debug image saved: {debug_path}")

    # Also save individual debug images with contours
    for frame_path, features, label in [
        (frame_a_path, features_a, "a"),
        (frame_b_path, features_b, "b")
    ]:
        debug_roi = features.roi_image.copy()
        cv2.drawContours(debug_roi, [features.contour], -1, (0, 255, 0), 2)
        cv2.circle(debug_roi, features.centroid_raw, 5, (0, 0, 255), -1)
        individual_path = Path(frame_path).stem + f"_object_debug.png"
        cv2.imwrite(individual_path, debug_roi)


def print_results(result: Dict[str, Any]):
    """Print formatted results to console."""

    print(f"\n{'='*60}")
    print(f"EDIT POINT GRADE")
    print(f"{'='*60}")
    print(f"Frame A: {result.get('frame_a', {}).get('path', 'N/A')}")
    print(f"Frame B: {result.get('frame_b', {}).get('path', 'N/A')}")
    print(f"{'='*60}")

    if "error" in result:
        print(f"ERROR: {result['error']}")
        print(f"{'='*60}\n")
        return

    # Composite score with color indicator
    composite = result['composite_score']
    grade = "EXCELLENT" if composite > 0.8 else "GOOD" if composite > 0.6 else "FAIR" if composite > 0.4 else "POOR"
    print(f"\nCOMPOSITE SCORE: {composite:.3f}  [{grade}]")
    print(f"Confidence: {result['confidence']:.3f} (detection quality)")

    # Breakdown table
    print(f"\n{'CRITERION':<12} {'SCORE':>8} {'WEIGHT':>8} {'CONTRIBUTION':>14}")
    print(f"{'-'*44}")

    breakdown = result.get('breakdown', {})
    weights = result.get('weights', {})

    for criterion, data in breakdown.items():
        score = data.get('score', 0)
        weight = weights.get(criterion, 0)
        contribution = score * weight
        print(f"{criterion:<12} {score:>8.3f} {weight:>8.1%} {contribution:>14.3f}")

    # Details per criterion
    print(f"\n{'DETAILS'}")
    print(f"{'-'*44}")

    if 'position' in breakdown:
        pos = breakdown['position']
        print(f"Position distance: {pos.get('distance', 0):.4f} (normalized)")
        print(f"  Centroid A: {pos.get('centroid_a', 'N/A')}")
        print(f"  Centroid B: {pos.get('centroid_b', 'N/A')}")

    if 'color' in breakdown:
        col = breakdown['color']
        print(f"Color correlation: {col.get('correlation', 0):.4f}")
        print(f"  Method: {col.get('method', 'N/A')} ({col.get('histogram_bins', 'N/A')})")

    if 'size' in breakdown:
        siz = breakdown['size']
        print(f"Size ratio: {siz.get('ratio', 0):.3f}")
        print(f"  Area A: {siz.get('area_a', 0):.5f}, Area B: {siz.get('area_b', 0):.5f}")

    print(f"{'='*60}\n")


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Grade edit point continuity using multiple criteria",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python edit_grader.py frame_a.png frame_b.png
  python edit_grader.py frame_a.png frame_b.png --criteria position color
  python edit_grader.py frame_a.png frame_b.png --debug
        """
    )
    parser.add_argument("frame_a", help="First frame (end of clip A)")
    parser.add_argument("frame_b", help="Second frame (start of clip B)")
    parser.add_argument(
        "--criteria",
        nargs="+",
        choices=["position", "color", "size"],
        help="Criteria to evaluate (default: all)"
    )
    parser.add_argument(
        "--weights",
        type=str,
        help="Custom weights as JSON, e.g., '{\"position\": 0.6, \"color\": 0.4}'"
    )
    parser.add_argument("--debug", action="store_true", help="Save debug visualizations")
    parser.add_argument("--json", action="store_true", help="Output as JSON only")
    args = parser.parse_args()

    # Parse weights if provided
    weights = None
    if args.weights:
        import json
        try:
            weights = json.loads(args.weights)
        except json.JSONDecodeError as e:
            print(f"Error parsing weights JSON: {e}")
            sys.exit(1)

    result = grade_edit_point(
        args.frame_a,
        args.frame_b,
        criteria=args.criteria,
        weights=weights,
        debug=args.debug
    )

    if args.json:
        import json
        print(json.dumps(result, indent=2))
    else:
        print_results(result)

    return result


if __name__ == "__main__":
    main()
