# Plan: TR-6 Inspired Video - "Practice"

## Concept

A mannequin student learns to control bodies through TR-6 drill: first silently guiding a human coach, then giving verbal commands. In the final act, the mannequin is alone in the urban world, giving themselves the same commands and acknowledgments - revealing the drill created not a skill, but a need.

**Tone:** Unsettling/ambiguous
**Duration:** 45-60 seconds (can extend)
**Aspect Ratio:** 9:16

---

## Characters

### The Student (Mannequin)
- Artist-style articulated figure, NOT wooden
- Matte white or brushed gray composite material
- Ball joints visible at shoulders, elbows, wrists, hips, knees
- Humanoid proportions, smooth featureless head (or minimal face suggestion)
- Moves deliberately, learning precision

### The Coach (Human)
- Adult human, any gender
- Professional demeanor - they've done this drill many times
- Compliant without being robotic - this is routine to them
- Neutral business-casual clothing (nothing distracting)

---

## Structure

### Part 1: Silent Control (~15s)
**Setting:** Stark white/gray room, minimal furniture (chair, open floor space)

| Shot | Duration | Description |
|------|----------|-------------|
| 1 | 4s | Wide: Human coach sits in chair, still. Mannequin enters frame from behind, approaches. |
| 2 | 5s | Medium close: Mannequin's jointed hands reach out, lift the human's arm, turn it, set it down. |
| 3 | 6s | Medium: Mannequin guides human to stand, walks them across the room by the shoulders. |

**Audio:** Near silence. Just movement sounds - fabric, footsteps, the subtle mechanics of the mannequin.

### Part 2: Verbal Commands (~15s)
**Setting:** Same room, but now distance between them.

| Shot | Duration | Description | Dialogue |
|------|----------|-------------|----------|
| 4 | 5s | Medium: Mannequin stands across room from seated human. | "Stand up." [Human stands] "Good." |
| 5 | 5s | Two-shot or mannequin POV: Human walks toward wall. | "Walk to the wall." [Human walks] "Thank you." |
| 6 | 5s | Medium on human with mannequin partially visible: Human turns and sits. | "Turn around." [Human turns] "Sit down." [Human sits] |

**Audio:** Room tone enters subtly (fluorescent hum, empty space). Mannequin's voice is normal human - calm, measured. This wrongness is the point.

**Voice:** ElevenLabs TTS - neutral, calm, unhurried delivery. Not synthetic-sounding. The contrast between the voice and the source creates the uncanny.

### Part 3: The World (~20-25s)
**Setting:** Urban street/sidewalk. Crowds optional based on what generates well.

| Shot | Duration | Description | Internal Voice |
|------|----------|-------------|----------------|
| 7 | 5s | Medium: Mannequin walks down sidewalk, people passing. First command to self. | "Walk to the crosswalk." [walks] "Good." |
| 8 | 5s | Medium: Mannequin at crosswalk, waiting. | "Stop." [stops] "Wait." |
| 9 | 5s | Wide: Mannequin crosses street. | "Cross now." [crosses] "Thank you." |
| 10 | 6s | Medium: Mannequin sits on bench. Pause. Then unprompted: | "Good." |
| 11 | 4s | Close or medium: Mannequin stands, walks away. Acknowledgments cascade. | "Good. Thank you. Good..." (fading) |

**Audio:** Urban ambience (traffic, footsteps, city sounds). Voice is layered as internal monologue - same voice, perhaps slightly more intimate in mix (not reverb, just proximity).

---

## The Ending

The payoff is the **unearned acknowledgment**. Shot 10 is the turn:

The mannequin sits on the bench. They're not moving. They haven't done anything. Beat.

*"Good."*

They said it to themselves for nothing. For existing. The drill didn't teach control - it taught a need for validation. A need to be told they're doing well, even when nothing is happening.

Shot 11: They stand and walk away. The acknowledgments come faster now, unprompted, fading as they disappear into the crowd.

---

## Technical Approach

### Character Locking
1. Lock mannequin character first - critical for consistency across all shots
2. Lock human coach for Parts 1-2 consistency
3. Lock drill room environment
4. Urban environment can vary (different streets/angles add realism)

### Shot Generation Strategy
- Parts 1-2 (6 shots): Controlled environment, can use reference images for consistency
- Part 3 (5 shots): Urban variety acceptable, mannequin consistency critical
- Consider last-frame chaining between shots 1-2-3 for Part 1 continuity

### Audio Layers
| Type | Content | Timing |
|------|---------|--------|
| VO | Mannequin voice - commands and acknowledgments | Parts 2-3 |
| Ambience | Room tone (subtle) | Part 2 |
| Ambience | Urban city sounds | Part 3 |
| Music | None, or extremely sparse drone (optional) | Throughout |

### Voice Generation
- Single ElevenLabs voice for all mannequin dialogue
- Calm, measured, slightly formal tone
- Part 2: Delivered as spoken commands (clear, directed)
- Part 3: Same voice but mixed as internal monologue

---

## Files to Create

- Project: `data/projects/tr6_practice.json`
- Characters: Mannequin student, Human coach
- Environments: Drill room, Urban street
- ~11 shots total
- Audio: TTS for dialogue, ambient layers

---

## Verification

1. **Character consistency:** Review mannequin appearance across all shots after generation
2. **Voice quality:** Test TTS generation before full production - ensure natural delivery
3. **Tonal coherence:** Watch assembled video without audio first, then with - both should feel unsettling
4. **Ending lands:** The "Good" on the bench should feel like a reveal, not a continuation
5. **Duration check:** Target 45-60s, can extend Part 3 if the urban shots are working

---

## Unknowns / Risks

- **Mannequin consistency in Veo:** May require multiple generations or strong reference images
- **Human-mannequin interaction shots:** Close contact shots (hands on body) may be challenging
- **Urban crowds:** Veo crowd generation can be inconsistent - may need to lean into sparse streets
- **Voice timing:** Internal monologue timing with visuals will need adjustment in assembly

---

## Phase 2: Assembly & Editing (CURRENT)

### Generated Clips (by timestamp order)

| # | Filename | Time |
|---|----------|------|
| 1 | A_caucasian_man_202601140347_7qn8u.mp4 | 03:47 |
| 2 | Closeup_of_the_202601140414_eqoqw.mp4 | 04:14 |
| 3 | Closeup_continues_on_202601140419_32mga.mp4 | 04:19 |
| 4 | The_genderless_offwhite_202601140422_guhe8.mp4 | 04:22 |
| 5 | The_man_in_202601140426_ul7kh.mp4 | 04:26 |
| 6 | The_caucasian_man_202601140440_2krp9.mp4 | 04:40 |
| 7 | The_caucasian_man_202601140440_gmu9a.mp4 | 04:40 |
| 8 | The_caucasian_man_202601140446_lx3pn.mp4 | 04:46 |
| 9 | The_scene_jumps_202601140456_2n5ig.mp4 | 04:56 |
| 10 | The_genderless_offwhite_202601140502_uxbqz.mp4 | 05:02 |
| 11 | The_genderless_offwhite_202601140503_bmapz.mp4 | 05:03 |
| 12 | Jump_to_a_202601140515_xtzm0.mp4 | 05:15 |
| 13 | The_genderless_offwhite_202601140523_ebmu4.mp4 | 05:23 |

### Assembly Task

1. **Concatenate all clips** in timestamp order (1-13)
2. **Add debug annotations** for edit timing:
   - Clip number overlay (top-left)
   - Filename (truncated)
   - Running timecode
   - Per-clip timecode (resets each clip)
3. **Output:** `data/exports/tr6_practice_debug.mp4`

### FFmpeg Debug Overlay Approach

Use `drawtext` filter to overlay:
- Clip index and filename
- Global timecode (cumulative)
- Local timecode (per-clip, resets at each cut)

This requires:
1. Get duration of each clip
2. Calculate cumulative start times
3. Apply drawtext to each clip with correct offset
4. Concat with matching specs

### Files

- **Input:** `data/workspace/*.mp4` (13 clips)
- **Output:** `data/exports/tr6_practice_debug.mp4`

---

## Phase 4: Audio Refinement (v12)

### Changes from v11
1. **Increase all VO volume** - currently too quiet
2. **Replace cascade with accelerating "Good" pattern** in final clip

### Accelerating "Good" Specification
- **Start:** 0.5s after clip 16 begins (~81.0s)
- **Pattern:** "Good" repeats with increasing frequency
  - Slow start: ~1s between repetitions
  - Builds to rapid: ~0.25s between repetitions
- **Volume fade:** Begin fading at 1:26 (86s)
- **End:** Quiet "Good"s audible until 0.5s before end (~87.2s)
- **Duration:** ~6.2 seconds total

### Implementation Approach
Layer the existing `tr6_good_bench.mp3` (0.65s) multiple times with calculated delays:

| Instance | Delay (ms) | Gap from prev | Cumulative |
|----------|------------|---------------|------------|
| 1 | 81000 | — | 81.0s |
| 2 | 82000 | 1.0s | 82.0s |
| 3 | 82900 | 0.9s | 82.9s |
| 4 | 83700 | 0.8s | 83.7s |
| 5 | 84400 | 0.7s | 84.4s |
| 6 | 85000 | 0.6s | 85.0s |
| 7 | 85500 | 0.5s | 85.5s |
| 8 | 85900 | 0.4s | 85.9s |
| 9 | 86200 | 0.3s | 86.2s (fade starts) |
| 10 | 86450 | 0.25s | 86.45s |
| 11 | 86700 | 0.25s | 86.7s |
| 12 | 86950 | 0.25s | 86.95s |

Volume automation:
- Instances 1-8: Full volume (1.3x)
- Instance 9: 1.0x (fade begins)
- Instance 10: 0.7x
- Instance 11: 0.4x
- Instance 12: 0.2x

### Updated VO Volume Settings
Increase all VO volumes:
- Commands (Section 2): 1.5x → **2.0x**
- Internal voice (Section 3): 1.3x → **1.8x**
- Accelerating "Good"s: Start at 1.8x, fade as specified

### FFmpeg Command Structure
```bash
ffmpeg -y \
  -i tr6_practice_debug_v11.mp4 \
  -i tr6_turnaround.mp3 \
  ... (other VOs) ...
  -i tr6_good_bench.mp3 \  # Instance 1
  -i tr6_good_bench.mp3 \  # Instance 2
  ... (repeat for all instances) ...
  -filter_complex "
    [0:a]volume=0.7[video];
    [1:a]adelay=40000|40000,volume=2.0[vo1];
    ... (other VOs with increased volume) ...
    [N:a]adelay=81000|81000,volume=1.8[g1];
    [N+1:a]adelay=82000|82000,volume=1.8[g2];
    ... (accelerating with fading volume) ...
    amix=inputs=X:duration=first[aout]
  " \
  -map 0:v -map "[aout]" \
  -c:v copy -c:a aac \
  tr6_practice_debug_v12_audio.mp4
```

### Output
- `data/exports/tr6_practice_debug_v12_audio.mp4`

---

## Phase 3: Audio Timing Plan (v10) [ARCHIVED]

### Current Timeline (87.8s total)

| Clip | Start | Duration | Content | Section |
|------|-------|----------|---------|---------|
| 01 | 0:00.0 | 1.5s | Title: SESSION START (black) | — |
| 02 | 0:01.5 | 6.1s | A_caucasian_man (trimmed) | SILENT CONTROL |
| 03 | 0:07.7 | 8.0s | Closeup_of_the | SILENT CONTROL |
| 04 | 0:15.7 | 8.0s | Closeup_continues_on | SILENT CONTROL |
| 05 | 0:23.7 | 5.7s | The_genderless_offwhite (trimmed) | SILENT CONTROL |
| 06 | 0:29.3 | 5.9s | The_man_in (trimmed) | SILENT CONTROL |
| 07 | 0:35.2 | 1.2s | clip_07 (triple trimmed) | SILENT CONTROL |
| 08 | 0:36.4 | 8.0s | The_caucasian_man | VERBAL COMMANDS |
| 09 | 0:44.4 | 1.5s | Title: SESSION END (black) | — |
| 10 | 0:46.0 | 6.7s | clip_09 (trimmed) | URBAN/INTERNAL |
| 11 | 0:52.7 | 4.6s | The_genderless_offwhite (trimmed) | URBAN/INTERNAL |
| 12 | 0:57.3 | 8.0s | The_genderless_offwhite | URBAN/INTERNAL |
| 13 | 1:05.3 | 6.8s | Jump_to_a (trimmed) | URBAN/INTERNAL |
| 14 | 1:12.0 | 7.2s | The_genderless_offwhite (trimmed) | URBAN/INTERNAL |
| 15 | 1:19.2 | 1.5s | Title: SESSION START (white) | — |
| 16 | 1:20.7 | 7.1s | The_white_plastic (trimmed) | URBAN/INTERNAL |

### Audio Sections

**Section 1: Silent Control (0:01.5 - 0:36.4)**
- NO voice over
- Ambient: Near silence, subtle room tone, movement sounds
- Optional: Very quiet atmospheric drone

**Section 2: Verbal Commands (0:36.4 - 0:44.4) — Clip 08**
- Mannequin speaks OUT LOUD to human coach
- Clip 08 content: Man starts facing wall, turns at ~3.75s, chair appears, sits ~5.0s, fully seated ~7.0s

| VO File | Text | Duration | Global Start | Local (in clip) |
|---------|------|----------|--------------|-----------------|
| tr6_turnaround.mp3 | "Turn around." | 0.97s | 0:40.0 | ~3.6s (just before turn) |
| tr6_sitdown.mp3 | "Sit down." | 0.84s | 0:41.5 | ~5.1s (as he sits) |
| tr6_good_1.mp3 | "Good." | 0.68s | 0:43.5 | ~7.1s (once seated) |

**Section 3: Urban Internal Voice (0:46.0 - end)**
- Mannequin speaks TO ITSELF (internal monologue)
- Same voice, slightly more intimate mix

| VO File | Text | Duration | Global Start | Clip |
|---------|------|----------|--------------|------|
| tr6_walktocrosswalk.mp3 | "Walk to the crosswalk." | 1.38s | 0:47.0 | 10 |
| tr6_good_2.mp3 | "Good." | 0.68s | 0:50.0 | 10 |
| tr6_stop.mp3 | "Stop." | 0.73s | 0:53.0 | 11 |
| tr6_wait.mp3 | "Wait." | 0.68s | 0:55.0 | 11 |
| tr6_crossnow.mp3 | "Cross now." | 0.86s | 0:58.0 | 12 |
| tr6_thankyou_2.mp3 | "Thank you." | 0.84s | 1:02.0 | 12 |
| tr6_good_bench.mp3 | "Good." | 0.65s | ~1:16.0 | 14 - THE PAYOFF (near end) |
| *silence* | — | 1.5s | 1:19.2 | 15 - Title card |
| tr6_cascade_long.mp3 | "Good. Thank you. Good. Good..." | ~5-6s | 1:21.0 | 16 - fading out |

**NEW TTS NEEDED:**
- `tr6_cascade_long.mp3` — Extended cascade: "Good. Good. Thank you. Good. Good. Thank you. Good..." (~5-6 seconds, fading delivery)

### Generated TTS Files (data/audio/tts/)

| File | Text | Duration | Status |
|------|------|----------|--------|
| tr6_turnaround.mp3 | "Turn around." | 0.97s | EXISTS |
| tr6_sitdown.mp3 | "Sit down." | 0.84s | EXISTS |
| tr6_good_1.mp3 | "Good." | 0.68s | EXISTS |
| tr6_walktocrosswalk.mp3 | "Walk to the crosswalk." | 1.38s | EXISTS |
| tr6_good_2.mp3 | "Good." | 0.68s | EXISTS |
| tr6_stop.mp3 | "Stop." | 0.73s | EXISTS |
| tr6_wait.mp3 | "Wait." | 0.68s | EXISTS |
| tr6_crossnow.mp3 | "Cross now." | 0.86s | EXISTS |
| tr6_thankyou_2.mp3 | "Thank you." | 0.84s | EXISTS |
| tr6_good_bench.mp3 | "Good." | 0.65s | EXISTS |
| tr6_cascade_long.mp3 | "Good. Good. Thank you..." | ~5-6s | **GENERATE** |

### Unused TTS (from original plan)

| File | Text | Reason |
|------|------|--------|
| tr6_standup.mp3 | "Stand up." | Clip 08 doesn't show stand action |
| tr6_walktowall.mp3 | "Walk to the wall." | Clip 08 doesn't show walk to wall |
| tr6_thankyou_1.mp3 | "Thank you." | Not needed for turn/sit sequence |
| tr6_cascade.mp3 | "Good. Thank you. Good." | Replace with longer version |
