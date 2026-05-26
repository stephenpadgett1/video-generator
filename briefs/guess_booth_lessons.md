# Guess Booth — Lessons

Built 2026-05-24 → 2026-05-25. Final: 37s, 9:16, 4K. Pipeline: Veo 3.1 Fast/Standard + nano-banana + ElevenLabs.

## What worked

- **Hand-painted booth signage** rendered cleanly when described concretely (faded carnival red/cream plywood, hand-painted block letters, strike-throughs as graphic elements). The booth identity locked from a single master plate and reused across all mark shots.
- **Three-mark escalation structure** (Tyler trivia → David burger → Sarah wound) gave a clean comedic-to-existential arc. Single-word jab shots ("Karaoke.", "Goodbye.") inserted between heavier beats added rhythm and breadth ("this happens to everyone").
- **Multi-stage trimming + 4K splice** for late additions: upscale only the new clips and splice into the existing 4K master, rebuilding only the global audio bed. Saved a full re-upscale.
- **Per-shot version files in scratch/v1_clips/** kept the Veo-native-audio takes around for reference after we switched to ElevenLabs.

## What didn't work

- **Veo native audio for the robot's lines** put the robot dialogue onto the human marks' faces. CRT-headed robot has no mouth → Veo lip-syncs to the only mouth in frame. Memory updated: faceless/mouthless characters always go through ElevenLabs from the start. See [[feedback_veo_native_audio_default]].
- **Subtle expression deltas** (S3 David's "smile breaks") barely register in static frame comparisons. The audio carries the wound, not the visual.
- **Walter's Veo clip** had a subtle mouth-motion artifact at the start (Veo putting speech-like motion on him despite generateAudio: false in the resubmit). Solved by trimming `ss=1` to pull from the stiller middle of the clip.

## Generalizable techniques

- **Identify the falsifying test for "is this lip-synced":** bilabials (M/B/P) force lip closure; rounded vowels (OH/OO) force round opening. If a sampled frame at one of those word timestamps doesn't have the corresponding mouth shape, it's not lip-syncing. But the inverse is *not* conclusive — open lips at an open vowel could be either lip-sync OR a coincidental reaction. (I missed Tyler delivering "two of them are torn" because his open mouth at that timestamp also fit "laughing.")
- **The "single word, no reaction" jab shot** as a pacing tool. After two long beats, two snap cuts with one-word VO and held faces give breadth without weight. ~3s each.
- **Phone-screen text in the peek shot baked into the nano poster frame** — Veo would mangle live text. Bake legible text into the static frame and let Veo do only ambient motion.

## Cost

Rough actual: ~$25 total. ~$8 Veo (mostly Fast with 2 Standard pivots + 1 Standard reshoot), ~$5 nano (lots of iteration on booth signage), ~$2 ElevenLabs, ~$1 QA Anthropic, ~$8 in upscale-related compute. Well under the original $11–16 estimate after factoring in the post-launch jab additions (~$7 extra).
