# Session Log: TR-6 "Practice" Video Production

**Date:** 2026-01-14
**Project:** TR-6 Inspired Video - "Practice"

## Summary

Completed production of a ~87 second experimental video inspired by the TR-6 (Body Control) drill from Scientology. The video follows a mannequin "student" who learns to control a human "coach" through physical guidance and verbal commands, then is shown alone in the urban world giving commands and acknowledgments to itself - revealing the drill created not a skill, but a compulsive need for validation.

## Accomplishments

### Video Assembly
- Assembled 16 clips including 3 title cards ("SESSION START" black, "SESSION END" black, "SESSION START" white)
- Created debug overlay versions (v1-v13) for edit timing with clip numbers, filenames, and timecodes
- Performed extensive trimming on multiple clips to tighten pacing
- Final clean version without debug overlays

### Audio Production
- Generated TTS voice lines using ElevenLabs (River voice - calm, neutral)
- Commands: "Turn around", "Sit down", "Good"
- Internal monologue: "Walk to the crosswalk", "Good", "Stop", "Wait", "Cross now", "Thank you"
- Payoff "Good" at 1:11 (mannequin says "Good" to itself for doing nothing)
- Accelerating "Good" cascade in final clip (12 layered instances with decreasing intervals and volume fade)

### Audio Mix Settings
- Section 1 (Silent Control, 0-36.4s): Original Veo audio at 100%
- Section 2+ (36.4s onwards): Veo audio at 70%
- Commands (Section 2): VO at 2.0x volume
- Internal voice (Section 3): VO at 1.8x volume
- Accelerating cascade: 1.8x down to 0.2x with fade starting at 86s

## Final Output

- **File:** `data/exports/tr6_practice_final.mp4`
- **Duration:** 87.5 seconds
- **Aspect Ratio:** 9:16 (vertical)
- **Resolution:** 720x1280

## Audio Timing (Final)

| Timestamp | VO |
|-----------|-----|
| 0:37 | "Sit down." |
| 0:40 | "Turn around." |
| 0:43.5 | "Good." |
| 0:47 | "Walk to the crosswalk." |
| 0:50 | "Good." |
| 0:53 | "Stop." |
| 0:55 | "Wait." |
| 0:58 | "Cross now." |
| 1:02 | "Thank you." |
| 1:11 | "Good." (THE PAYOFF) |
| 1:21+ | Accelerating "Good" cascade with fade |

## Files Created

- `data/exports/tr6_practice_final.mp4` - Final clean video
- `data/exports/tr6_practice_clean.mp4` - Clean video without audio mix
- `data/exports/tr6_practice_debug_v11.mp4` - Debug version with overlays
- `data/exports/tr6_practice_debug_v13_audio.mp4` - Debug version with final audio
- `data/audio/tts/tr6_*.mp3` - All TTS voice lines
- `data/workspace/debug_temp/` - Working clips and title cards

## Technical Notes

- Used ffmpeg `adelay` filter for precise VO placement
- Used `volume='if(lt(t,36.4),1.0,0.7)':eval=frame` for section-based volume automation
- Layered 12 instances of "Good" clip with decreasing delays (1.0s → 0.25s) for acceleration effect
- Title cards generated with ffmpeg `drawtext` filter and silent audio tracks
