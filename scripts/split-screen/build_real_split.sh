#!/bin/bash
# Real Split Screen Effect - 3 videos + 5 images → 16 slots
# Videos use different start offsets for variety

cd "$(dirname "$0")/../.."
INPUT_DIR="data/workspace/split-screen-inputs"
OUTPUT="data/exports/split_screen_real.mp4"

# Timing constants (same as reference)
T1=1.0   # End state 1, start trans 1→2
T2=1.4   # End trans 1→2
T3=1.9   # End state 2, start trans 2→4
T4=2.2   # End trans 2→4
T5=2.6   # End state 3, start trans 4→8
T6=2.9   # End trans 4→8
T7=3.2   # End state 4, start trans 8→16
T8=3.5   # End trans 8→16
TEND=4.0

# Input mapping (16 slots):
# Slots 1-8: Videos with different start offsets (most prominent)
# Slots 9-16: Images + some video reuse

INPUTS=""
# Slot 1: v1 @ 0s
INPUTS+="-ss 0 -i $INPUT_DIR/v1.mp4 "
# Slot 2: v2 @ 0s
INPUTS+="-ss 0 -i $INPUT_DIR/v2.mp4 "
# Slot 3: v3 @ 0s
INPUTS+="-ss 0 -i $INPUT_DIR/v3.mp4 "
# Slot 4: v1 @ 2s
INPUTS+="-ss 2 -i $INPUT_DIR/v1.mp4 "
# Slot 5: v2 @ 2s
INPUTS+="-ss 2 -i $INPUT_DIR/v2.mp4 "
# Slot 6: v3 @ 2s
INPUTS+="-ss 2 -i $INPUT_DIR/v3.mp4 "
# Slot 7: v1 @ 4s
INPUTS+="-ss 4 -i $INPUT_DIR/v1.mp4 "
# Slot 8: v2 @ 4s
INPUTS+="-ss 4 -i $INPUT_DIR/v2.mp4 "
# Slot 9-13: Images
INPUTS+="-loop 1 -i $INPUT_DIR/i1.jpeg "
INPUTS+="-loop 1 -i $INPUT_DIR/i2.jpeg "
INPUTS+="-loop 1 -i $INPUT_DIR/i3.jpeg "
INPUTS+="-loop 1 -i $INPUT_DIR/i4.jpeg "
INPUTS+="-loop 1 -i $INPUT_DIR/i5.jpeg "
# Slot 14: v3 @ 4s
INPUTS+="-ss 4 -i $INPUT_DIR/v3.mp4 "
# Slot 15-16: Image reuse
INPUTS+="-loop 1 -i $INPUT_DIR/i1.jpeg "
INPUTS+="-loop 1 -i $INPUT_DIR/i2.jpeg "

# Build filter (same structure as reference, but with 16 separate inputs)
FILTER="color=c=black:s=2160x3840:r=24:d=$TEND,format=yuv420p[bg];"

# Scale all inputs to appropriate sizes with animated expressions
# Clip 1
FILTER+="[0:v]scale=w='if(lt(t,$T3),2160,if(lt(t,$T4),2160-(2160-1080)*(t-$T3)/($T4-$T3),if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))))':h='if(lt(t,$T1),3840,if(lt(t,$T2),3840-(3840-1920)*(t-$T1)/($T2-$T1),if(lt(t,$T5),1920,if(lt(t,$T6),1920-(1920-960)*(t-$T5)/($T6-$T5),960))))':eval=frame,format=yuv420p[v0];"

# Clip 2
FILTER+="[1:v]scale=w='if(lt(t,$T3),2160,if(lt(t,$T4),2160-(2160-1080)*(t-$T3)/($T4-$T3),if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))))':h='if(lt(t,$T5),1920,if(lt(t,$T6),1920-(1920-960)*(t-$T5)/($T6-$T5),960))':eval=frame,format=yuv420p[v1];"

# Clip 3
FILTER+="[2:v]scale=w='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':h='if(lt(t,$T5),1920,if(lt(t,$T6),1920-(1920-960)*(t-$T5)/($T6-$T5),960))':eval=frame,format=yuv420p[v2];"

# Clip 4
FILTER+="[3:v]scale=w='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':h='if(lt(t,$T5),1920,if(lt(t,$T6),1920-(1920-960)*(t-$T5)/($T6-$T5),960))':eval=frame,format=yuv420p[v3];"

# Clips 5-8
FILTER+="[4:v]scale=w='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':h=960:eval=frame,format=yuv420p[v4];"
FILTER+="[5:v]scale=w='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':h=960:eval=frame,format=yuv420p[v5];"
FILTER+="[6:v]scale=w='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':h=960:eval=frame,format=yuv420p[v6];"
FILTER+="[7:v]scale=w='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':h=960:eval=frame,format=yuv420p[v7];"

# Clips 9-16 (final size only)
for i in {8..15}; do
  FILTER+="[$i:v]scale=540:960,format=yuv420p[v$i];"
done

# Overlays
FILTER+="[bg][v0]overlay=x=0:y=0:eval=frame[t1];"
FILTER+="[t1][v1]overlay=x=0:y='if(lt(t,$T1),3840,if(lt(t,$T2),3840-(3840-1920)*(t-$T1)/($T2-$T1),if(lt(t,$T5),1920,if(lt(t,$T6),1920-(1920-960)*(t-$T5)/($T6-$T5),960))))':eval=frame:enable='gte(t,$T1)'[t2];"
FILTER+="[t2][v2]overlay=x='if(lt(t,$T3),2160,if(lt(t,$T4),2160-(2160-1080)*(t-$T3)/($T4-$T3),if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))))':y=0:eval=frame:enable='gte(t,$T3)'[t3];"
FILTER+="[t3][v3]overlay=x='if(lt(t,$T3),2160,if(lt(t,$T4),2160-(2160-1080)*(t-$T3)/($T4-$T3),if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))))':y='if(lt(t,$T5),1920,if(lt(t,$T6),1920-(1920-960)*(t-$T5)/($T6-$T5),960))':eval=frame:enable='gte(t,$T3)'[t4];"

# Clips 5-8
FILTER+="[t4][v4]overlay=x=0:y='if(lt(t,$T5),3840,if(lt(t,$T6),3840-(3840-1920)*(t-$T5)/($T6-$T5),1920))':eval=frame:enable='gte(t,$T5)'[t5];"
FILTER+="[t5][v5]overlay=x=0:y='if(lt(t,$T5),3840,if(lt(t,$T6),3840-(3840-2880)*(t-$T5)/($T6-$T5),2880))':eval=frame:enable='gte(t,$T5)'[t6];"
FILTER+="[t6][v6]overlay=x='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':y='if(lt(t,$T5),3840,if(lt(t,$T6),3840-(3840-1920)*(t-$T5)/($T6-$T5),1920))':eval=frame:enable='gte(t,$T5)'[t7];"
FILTER+="[t7][v7]overlay=x='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':y='if(lt(t,$T5),3840,if(lt(t,$T6),3840-(3840-2880)*(t-$T5)/($T6-$T5),2880))':eval=frame:enable='gte(t,$T5)'[t8];"

# Clips 9-16
FILTER+="[t8][v8]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1080)*(t-$T7)/($T8-$T7),1080))':y=0:eval=frame:enable='gte(t,$T7)'[t9];"
FILTER+="[t9][v9]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1080)*(t-$T7)/($T8-$T7),1080))':y=960:eval=frame:enable='gte(t,$T7)'[t10];"
FILTER+="[t10][v10]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1620)*(t-$T7)/($T8-$T7),1620))':y=0:eval=frame:enable='gte(t,$T7)'[t11];"
FILTER+="[t11][v11]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1620)*(t-$T7)/($T8-$T7),1620))':y=960:eval=frame:enable='gte(t,$T7)'[t12];"
FILTER+="[t12][v12]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1080)*(t-$T7)/($T8-$T7),1080))':y=1920:eval=frame:enable='gte(t,$T7)'[t13];"
FILTER+="[t13][v13]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1080)*(t-$T7)/($T8-$T7),1080))':y=2880:eval=frame:enable='gte(t,$T7)'[t14];"
FILTER+="[t14][v14]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1620)*(t-$T7)/($T8-$T7),1620))':y=1920:eval=frame:enable='gte(t,$T7)'[t15];"
FILTER+="[t15][v15]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1620)*(t-$T7)/($T8-$T7),1620))':y=2880:eval=frame:enable='gte(t,$T7)'"

echo "Building split screen with real content..."
echo "Slot mapping:"
echo "  1: v1 @ 0s  |  2: v2 @ 0s  |  3: v3 @ 0s  |  4: v1 @ 2s"
echo "  5: v2 @ 2s  |  6: v3 @ 2s  |  7: v1 @ 4s  |  8: v2 @ 4s"
echo "  9: i1       | 10: i2       | 11: i3       | 12: i4"
echo " 13: i5       | 14: v3 @ 4s  | 15: i1       | 16: i2"
echo ""

ffmpeg -y $INPUTS -filter_complex "$FILTER" -c:v libx264 -preset fast -pix_fmt yuv420p -t $TEND "$OUTPUT"

echo "Done! Output: $OUTPUT"
