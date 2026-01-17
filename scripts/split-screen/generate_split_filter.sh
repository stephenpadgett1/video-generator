#!/bin/bash
# Progressive Split Screen Effect - Full 16 clips
# Output: 2160x3840 @ 24fps, ~4 seconds total

# Timing constants
T1=1.0   # End state 1 (full screen), start trans 1→2
T2=1.4   # End trans 1→2, start state 2
T3=1.9   # End state 2, start trans 2→4
T4=2.2   # End trans 2→4, start state 3
T5=2.6   # End state 3, start trans 4→8
T6=2.9   # End trans 4→8, start state 4
T7=3.2   # End state 4, start trans 8→16
T8=3.5   # End trans 8→16, start state 5
TEND=4.0 # End

# Grid sizes at each state:
# State 1: 1 clip (2160x3840)
# State 2: 2 clips (2160x1920 each)
# State 3: 4 clips (1080x1920 each)
# State 4: 8 clips (1080x960 each)
# State 5: 16 clips (540x960 each)

# Build inputs
INPUTS=""
for i in {1..16}; do
  INPUTS="$INPUTS -i data/exports/placeholder_$i.mp4"
done

# Build filter
# Black canvas
FILTER="color=c=black:s=2160x3840:r=24:d=$TEND,format=yuv420p[bg];"

# Helper function for interpolation
# lerp(from, to, t, t_start, t_dur) = from + (to - from) * (t - t_start) / t_dur

# Clip 1: Always visible
# Scale: 2160x3840 → 2160x1920 (t1-t2) → 1080x1920 (t3-t4) → 1080x960 (t5-t6) → 540x960 (t7-t8)
# Position: (0,0) always
FILTER+="[0:v]scale=w='if(lt(t,$T3),2160,if(lt(t,$T4),2160-(2160-1080)*(t-$T3)/($T4-$T3),if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))))':h='if(lt(t,$T1),3840,if(lt(t,$T2),3840-(3840-1920)*(t-$T1)/($T2-$T1),if(lt(t,$T5),1920,if(lt(t,$T6),1920-(1920-960)*(t-$T5)/($T6-$T5),960))))':eval=frame,format=yuv420p[v0];"

# Clip 2: Appears at t1, slides up from y=3840 to y=1920 (t1-t2)
# Then shrinks and moves: y stays at 1920 → 960 (t5-t6), then fixed at 960
FILTER+="[1:v]scale=w='if(lt(t,$T3),2160,if(lt(t,$T4),2160-(2160-1080)*(t-$T3)/($T4-$T3),if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))))':h='if(lt(t,$T5),1920,if(lt(t,$T6),1920-(1920-960)*(t-$T5)/($T6-$T5),960))':eval=frame,format=yuv420p[v1];"

# Clip 3: Appears at t3, slides in from x=2160 to x=1080 (t3-t4)
# Then shrinks: x stays at 1080 → 540 (t7-t8)
FILTER+="[2:v]scale=w='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':h='if(lt(t,$T5),1920,if(lt(t,$T6),1920-(1920-960)*(t-$T5)/($T6-$T5),960))':eval=frame,format=yuv420p[v2];"

# Clip 4: Appears at t3, slides in from x=2160 to x=1080 (t3-t4)
FILTER+="[3:v]scale=w='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':h='if(lt(t,$T5),1920,if(lt(t,$T6),1920-(1920-960)*(t-$T5)/($T6-$T5),960))':eval=frame,format=yuv420p[v3];"

# Clips 5-8: Appear at t5, slide up from bottom
# Clip 5: y goes from 3840 → 1920 (t5-t6)
FILTER+="[4:v]scale=w='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':h=960:eval=frame,format=yuv420p[v4];"
# Clip 6: y goes from 3840 → 2880 (t5-t6)
FILTER+="[5:v]scale=w='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':h=960:eval=frame,format=yuv420p[v5];"
# Clip 7: y goes from 3840 → 1920 (t5-t6)
FILTER+="[6:v]scale=w='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':h=960:eval=frame,format=yuv420p[v6];"
# Clip 8: y goes from 3840 → 2880 (t5-t6)
FILTER+="[7:v]scale=w='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':h=960:eval=frame,format=yuv420p[v7];"

# Clips 9-16: Appear at t7, slide in from right
# Final positions: x=1080 (col 2) or x=1620 (col 3), y=0/960/1920/2880
for i in {8..15}; do
  FILTER+="[$i:v]scale=540:960,format=yuv420p[v$i];"
done

# Overlays - build up the composite
# Clip 1
FILTER+="[bg][v0]overlay=x=0:y=0:eval=frame[t1];"

# Clip 2: y transitions
FILTER+="[t1][v1]overlay=x=0:y='if(lt(t,$T1),3840,if(lt(t,$T2),3840-(3840-1920)*(t-$T1)/($T2-$T1),if(lt(t,$T5),1920,if(lt(t,$T6),1920-(1920-960)*(t-$T5)/($T6-$T5),960))))':eval=frame:enable='gte(t,$T1)'[t2];"

# Clip 3: x transitions
FILTER+="[t2][v2]overlay=x='if(lt(t,$T3),2160,if(lt(t,$T4),2160-(2160-1080)*(t-$T3)/($T4-$T3),if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))))':y=0:eval=frame:enable='gte(t,$T3)'[t3];"

# Clip 4: x transitions, y same as clip 2
FILTER+="[t3][v3]overlay=x='if(lt(t,$T3),2160,if(lt(t,$T4),2160-(2160-1080)*(t-$T3)/($T4-$T3),if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))))':y='if(lt(t,$T5),1920,if(lt(t,$T6),1920-(1920-960)*(t-$T5)/($T6-$T5),960))':eval=frame:enable='gte(t,$T3)'[t4];"

# Clips 5-8: appear at t5, slide up, then shrink width at t7-t8
# Clip 5: x=0, y: 3840→1920
FILTER+="[t4][v4]overlay=x=0:y='if(lt(t,$T5),3840,if(lt(t,$T6),3840-(3840-1920)*(t-$T5)/($T6-$T5),1920))':eval=frame:enable='gte(t,$T5)'[t5];"

# Clip 6: x=0, y: 3840→2880
FILTER+="[t5][v5]overlay=x=0:y='if(lt(t,$T5),3840,if(lt(t,$T6),3840-(3840-2880)*(t-$T5)/($T6-$T5),2880))':eval=frame:enable='gte(t,$T5)'[t6];"

# Clip 7: x=1080→540, y: 3840→1920
FILTER+="[t6][v6]overlay=x='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':y='if(lt(t,$T5),3840,if(lt(t,$T6),3840-(3840-1920)*(t-$T5)/($T6-$T5),1920))':eval=frame:enable='gte(t,$T5)'[t7];"

# Clip 8: x=1080→540, y: 3840→2880
FILTER+="[t7][v7]overlay=x='if(lt(t,$T7),1080,if(lt(t,$T8),1080-(1080-540)*(t-$T7)/($T8-$T7),540))':y='if(lt(t,$T5),3840,if(lt(t,$T6),3840-(3840-2880)*(t-$T5)/($T6-$T5),2880))':eval=frame:enable='gte(t,$T5)'[t8];"

# Clips 9-16: appear at t7, slide in from right
# Final positions:
# 9: x=1080, y=0      10: x=1080, y=960    13: x=1080, y=1920   14: x=1080, y=2880
# 11: x=1620, y=0     12: x=1620, y=960    15: x=1620, y=1920   16: x=1620, y=2880

# Clip 9: x: 2160→1080, y=0
FILTER+="[t8][v8]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1080)*(t-$T7)/($T8-$T7),1080))':y=0:eval=frame:enable='gte(t,$T7)'[t9];"

# Clip 10: x: 2160→1080, y=960
FILTER+="[t9][v9]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1080)*(t-$T7)/($T8-$T7),1080))':y=960:eval=frame:enable='gte(t,$T7)'[t10];"

# Clip 11: x: 2160→1620, y=0
FILTER+="[t10][v10]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1620)*(t-$T7)/($T8-$T7),1620))':y=0:eval=frame:enable='gte(t,$T7)'[t11];"

# Clip 12: x: 2160→1620, y=960
FILTER+="[t11][v11]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1620)*(t-$T7)/($T8-$T7),1620))':y=960:eval=frame:enable='gte(t,$T7)'[t12];"

# Clip 13: x: 2160→1080, y=1920
FILTER+="[t12][v12]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1080)*(t-$T7)/($T8-$T7),1080))':y=1920:eval=frame:enable='gte(t,$T7)'[t13];"

# Clip 14: x: 2160→1080, y=2880
FILTER+="[t13][v13]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1080)*(t-$T7)/($T8-$T7),1080))':y=2880:eval=frame:enable='gte(t,$T7)'[t14];"

# Clip 15: x: 2160→1620, y=1920
FILTER+="[t14][v14]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1620)*(t-$T7)/($T8-$T7),1620))':y=1920:eval=frame:enable='gte(t,$T7)'[t15];"

# Clip 16: x: 2160→1620, y=2880 (final output, no label)
FILTER+="[t15][v15]overlay=x='if(lt(t,$T7),2160,if(lt(t,$T8),2160-(2160-1620)*(t-$T7)/($T8-$T7),1620))':y=2880:eval=frame:enable='gte(t,$T7)'"

# Run FFmpeg
echo "Running FFmpeg..."
ffmpeg -y $INPUTS -filter_complex "$FILTER" -c:v libx264 -preset fast -pix_fmt yuv420p -t $TEND data/exports/split_screen_16clips.mp4

echo "Done! Output: data/exports/split_screen_16clips.mp4"
