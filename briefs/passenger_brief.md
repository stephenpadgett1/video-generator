# PASSENGER — Shooting Script v1

**Date:** 2026-05-22
**Slug:** `passenger` — workspace `data/workspace/passenger/`
**Format:** 9:16 vertical, 4K final. Target ~40s.
**Veo:** Fast for all; 1 Standard held in reserve (likely B5, the mirror glance).
**Type:** Wordless tone poem. Warm, tender, no concept — a held feeling.

## The feeling

Being a drowsy child in the passenger seat, driven home at night in the rain.
The specific safety of being *carried* — someone calm at the wheel, the world
sliding by outside, nothing for you to do but be small and let it happen. No
plot, no irony, no argument. Just that.

## Tone & palette

Deep night blue and black outside; warm amber pools inside (streetlights,
dashboard, dome light). Cold wet night against a warm dry cabin. Soft, slightly
gauzy, heavy rain-bokeh. The palette is **constant** — one held mood, start to
finish. Camera is intimate, near-still, drifting like heavy eyelids.

## Camera / POV

We never leave the passenger seat. We see what the child sees: the side glass,
the windshield, the driver's hands and shoulder, the rear-view mirror, light
moving across the cabin. The driver's face is mostly *not* shown — kept universal,
"whoever drove you home." The one direct beat is the mirror glance.

## Beat Sheet (~40s, 6 beats)

| # | Beat | ~Dur | Veo | Notes |
|---|------|------|-----|-------|
| B1 | THE GLASS — rain streaks the side window; streetlight blooms slide past and smear. The world outside, in motion. | 7s | Fast | book-end: lights drift across |
| B2 | THE ROAD — the windshield; wipers sweep their metronome; the road ahead smears, red taillights bloom. | 6s | Fast | the wiper rhythm established |
| B3 | THE DRIVER — the driver's calm hands resting on the wheel, dashboard glow warm on them, a shoulder. The anchor. | 7s | Fast | steady, reassuring, minimal motion |
| B4 | DROWSY — streetlight light slides across the cabin ceiling and a small lap; the image goes soft, gauzy, heavy; focus loosening. | 7s | Fast | the drift toward sleep |
| B5 | THE GLANCE — the rear-view mirror; the driver's eyes flick up to it — to you — a small soft look, then back to the road. | 6s | **Std** (reserve) | the one emotional beat; eyes must read warm |
| B6 | HOME — the car slows, stops; the engine cuts; the wipers halt mid-sweep; rain is suddenly the only sound. Stillness held. A soft dome light. | 7s | Fast | arrival; everything settles |

End: hold the stillness of B6, slow fade to black. No title card, or a whisper of
one — decided in edit. No words anywhere.

## Audio (no dialogue)

The soundscape *is* the piece — built in post, `generateAudio: false` on Veo.
- **Rain** — constant bed; sharper/louder in B1–B2, muffling as drowsiness sets in
  (B4), then in B6 it becomes the *only* sound when the engine cuts.
- **Wipers** — a soft metronomic sweep, almost a heartbeat; it stops in B6.
- **Engine** — a low warm hum under everything; cuts at B6.
- **Radio** — barely-there, a warm indistinct low murmur, almost subliminal.
- **Score** — a single sparse, soft lullaby figure — felt-piano or music-box,
  very quiet, almost not there. ElevenLabs. It should feel like a memory of a song.

## Production

Book-end the beats where the gentle camera drift needs control; lock the car
interior + the driver's hands/look via nano-banana. Mostly Veo (rain, wipers,
light motion). Heavy warm grade + soft bloom + a touch of gate-weave/grain in post.

## Cost estimate

~6 Veo clips (≤1 Standard), ~10–12 nano frames, score + ~4 SFX. **~$8–12.**
