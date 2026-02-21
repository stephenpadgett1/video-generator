#!/bin/bash
set -e

WORKSPACE="/Users/stephenpadgett/Projects/video-generator/data/workspace"
EXPORTS="/Users/stephenpadgett/Projects/video-generator/data/exports"
TEMP="$EXPORTS/temp_v5"

echo "=== Building Sagittarius v5 ==="

# Create temp directory
mkdir -p "$TEMP"

# Clip 1: sagittarius_1.mp4 (full)
echo "Processing clip 1..."
ffmpeg -y -i "$WORKSPACE/sagittarius_1.mp4" -c:v libx264 -preset fast -crf 23 -r 24 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 "$TEMP/01.mp4" 2>/dev/null

# Clip 2: sagittarius_2.mp4 (full)
echo "Processing clip 2..."
ffmpeg -y -i "$WORKSPACE/sagittarius_2.mp4" -c:v libx264 -preset fast -crf 23 -r 24 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 "$TEMP/02.mp4" 2>/dev/null

# Clip 3: sagittarius_multiple_firing.mp4 (trim start at 6.624s)
echo "Processing clip 3 (trimmed)..."
ffmpeg -y -ss 6.624 -i "$WORKSPACE/sagittarius_multiple_firing.mp4" -c:v libx264 -preset fast -crf 23 -r 24 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 "$TEMP/03.mp4" 2>/dev/null

# Clip 4: sagittarius_multiple_targets.mp4 (full)
echo "Processing clip 4..."
ffmpeg -y -i "$WORKSPACE/sagittarius_multiple_targets.mp4" -c:v libx264 -preset fast -crf 23 -r 24 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 "$TEMP/04.mp4" 2>/dev/null

# Clip 5: sagittarius_why_choose.mp4 (REPLACED - full)
echo "Processing clip 5 (replaced with why_choose)..."
ffmpeg -y -i "$WORKSPACE/sagittarius_why_choose.mp4" -c:v libx264 -preset fast -crf 23 -r 24 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 "$TEMP/05.mp4" 2>/dev/null

# Clip 6: sagittarius_end.mp4 (trim to 5.7s)
echo "Processing clip 6 (trimmed)..."
ffmpeg -y -t 5.7 -i "$WORKSPACE/sagittarius_end.mp4" -c:v libx264 -preset fast -crf 23 -r 24 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 "$TEMP/06.mp4" 2>/dev/null

# Get durations for debug overlay
echo ""
echo "=== Clip durations ==="
for i in 01 02 03 04 05 06; do
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TEMP/$i.mp4")
  echo "Clip $i: ${DUR}s"
done

# Create concat list
cat > "$TEMP/concat.txt" << 'EOF'
file '01.mp4'
file '02.mp4'
file '03.mp4'
file '04.mp4'
file '05.mp4'
file '06.mp4'
EOF

# Concatenate
echo ""
echo "Concatenating..."
cd "$TEMP" && ffmpeg -y -f concat -safe 0 -i concat.txt -c copy "$EXPORTS/sagittarius_v5_raw.mp4" 2>/dev/null

# Re-encode to fix timestamps
echo "Re-encoding..."
ffmpeg -y -i "$EXPORTS/sagittarius_v5_raw.mp4" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 "$EXPORTS/sagittarius_v5.mp4" 2>/dev/null

# Get final duration
FINAL_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$EXPORTS/sagittarius_v5.mp4")
echo ""
echo "=== Final video ==="
echo "Duration: ${FINAL_DUR}s"
echo "Output: $EXPORTS/sagittarius_v5.mp4"

# Cleanup
rm -rf "$TEMP"
rm "$EXPORTS/sagittarius_v5_raw.mp4"

echo ""
echo "Done! Run: open $EXPORTS/sagittarius_v5.mp4"
