# AI Explains Steganography — Lessons Learned

Companion to `ai_explains_steganography_brief.md`. Notes from the production session (2026-05-24) — third piece in the AI-explainer series, first one to embed an actual functional payload in the artifact.

---

## What worked

- **The series template held — third use of the all-PIL pipeline.** Same allocation as Model Weights and Named Tensors:
  - **PIL programmatic:** waveforms (synthetic but audio-like), spectrum bars, bit-dot scatter, hex grid, lock icon, codec pills — everything geometric
  - **ffmpeg drawtext:** none this time — *all* on-screen text rendered via PIL because the visual elements were so geometric that no NB plate was needed
  - **NB Pro:** not used. The piece is wholly programmatic.
  - **Veo:** not used. Same call as the prior two.

- **All-PIL was the right call.** No NB plates needed. Waveforms, spectrum bars, hex grids, lock icons, codec pills — all renderable programmatically with full control. The piece visually reads as polished as the prior two but cost zero in image-gen API spend. **For diagrammatic explainers without illustrated metaphors, default to "could this be 100% PIL?" — often yes, and it removes a whole class of NB drift/coord-mismatch issues.**

- **Synthetic waveform that looks like real audio.** `waveform_samples()` mixes 5 sine waves at different frequencies + slow amplitude envelope + tiny broadband noise. The result *reads* as music/voice — not as a smooth sine wave or pure noise. Seed-deterministic, so the carrier in Shot 1, the stego-object in Shot 2, the time-domain view in Shot 4 Phase A, and the final card in Shot 6 are *literally pixel-identical waveforms*. That repeatability is the visual through-line — "the same waveform, with and without a message inside it."

- **Spectrum-with-dots was the visual centerpiece and landed first try.** `draw_spectrum()` takes a list of `(band_idx, amplitude_fraction, alpha)` dots that sit *inside* the existing bars. Visually this reads as "the bits are scattered across many frequency bands, at amplitudes inside the existing audio energy" — i.e., perceptually masked. **For the spread-spectrum beat, this single visual idea did 80% of the conceptual work.**

- **The "same waveform = identical input/output" gag in Shot 2.** Carrier and stego-object panels render the same `waveform_samples(seed=7)` — the viewer can see they're literally identical. With a subtle accent pulse on the right panel during 6.0–8.2s drawing attention to the identity. **For "show, don't tell" visual proofs, use the same generator seed across panels — the identity is bit-perfect and reads instantly.**

- **VO-first + Whisper word timestamps + timeline.md — third time, still the template.** Generated the full 59.8s VO at speed=1.1, transcribed, mapped every visual cue to a specific word landing. Math worked out cleanly: 6 shot durations summing to 62.94s, with tail silence absorbed into shot durations. Same workflow as Model Weights and Named Tensors.

- **Hard concat + per-clip dip-to-black fades — preserves VO sync exactly.** Each shot's PIL render has fade-in/out built into the alpha expressions at the boundaries. Concatenated with ffmpeg concat demuxer (no xfade), the resulting video duration is exactly the sum of clip durations — VO timing stays aligned. **xfade is appealing for "professional dissolves" but breaks VO sync because it overlaps clips. For VO-driven pieces, per-clip dip-to-black + hard concat is the simpler, sync-preserving pattern.**

- **Watermark embed is post-mix, pre-upscale.** Audiowmark operates on a WAV; ffmpeg re-encodes to AAC for the muxed mp4. Verified that the watermark survives the AAC round-trip (still 3 confidence-strong matches at strength=10). The watermark also survives independent MP3 128k, AAC 96k, and OPUS 96k recompression — meaning it'll survive any reasonable platform transcoding chain. **Embed once, pre-upscale; the audio is untouched during the Real-ESRGAN video upscale.**

- **audiowmark survives the production AAC re-encode at default strength=10.** No need to crank strength. Confidence values dropped from 0.221 → 0.226 → 0.235 (CLIP-B at 0s) across raw WAV → muxed MP4 → MP3 128k → AAC 96k → OPUS 96k — all comfortably above the noise threshold. **Default strength is fine for a single AAC pass + one platform recompression. Bump only if multi-generation re-encoding is expected.**

- **Build audiowmark locally with a private zita-resampler install.** No sudo needed — clone zita-resampler, `cmake -DCMAKE_INSTALL_PREFIX=/tmp/local`, `make install`, then build audiowmark with `CPPFLAGS=-I/tmp/local/include LDFLAGS=-L/tmp/local/lib DYLD_LIBRARY_PATH=/tmp/local/lib`. The binary lands at `data/workspace/steg-test/audiowmark/src/audiowmark`. **Document the DYLD_LIBRARY_PATH dependency — every invocation needs it.**

---

## Surprises / things to plan for

- **The audiowmark binary wasn't preserved from the steg-test session.** Source tree was there, watermarked WAVs were there, but the binary itself was gone (probably because the dir wasn't a `make install` target, just an in-tree build). Spent ~5 minutes rebuilding. **For tools that get used recurringly, install to a stable path or check in the binary alongside the source. Or just always rebuild — the build is ~30s once deps are in place.**

- **`from common import *` doesn't export underscore-prefixed names.** `_col()` is a private helper but the shot scripts need it. Fixed by `import common; _col = common._col`. **For shared utility modules, either don't underscore-prefix things shot scripts need, or document the import dance.**

- **PIL `text()` arrow glyph (→ U+2192) doesn't render in Avenir Next.** First pass at "time →" / "frequency →" labels showed as "time ?" / "frequency ?". Fell back to bare "time" and "frequency" — visual context (waveform vs. spectrum) carried the axis meaning anyway. **For axis labels in this style, skip arrow glyphs unless the font has them; or use ASCII ">".**

- **Default spectrum_bands had floor=0.05 → right half of frame looked empty.** Natural 1/f falloff puts high-freq bars below visibility. Bumped floor to 0.22 + added a mid-frequency bump — right side of frame now reads as "spectrum continues" instead of "empty." **For visual spectrum bars (not actual FFT), use a floor of 0.20+ and a mid-band bump so the full frame width feels alive.**

- **Loudness pre/post watermark was identical to one decimal place.** -19.5 LUFS integrated, -4.3 dBTP peak both before and after audiowmark. The watermark is genuinely below perceptual threshold at default strength. **You can ship audiowmark at default strength without worrying about audible artifacts in mixed audio with VO + music + SFX.**

---

## Workflow notes — for future explainer-style pieces

- **The series template is solidly stable at 3 pieces.** Production pattern:
  1. Receive brief
  2. Confirm pipeline (hybrid/all-PIL, no Veo), voice profile, accuracy non-negotiables
  3. VO first → Whisper → timeline.md
  4. PIL plates per shot (NB Pro if needed for illustration)
  5. Per-shot PIL render with motion timed to VO word landings
  6. Hard concat + audio mix with apad/amix
  7. Per-shot user review (one round of feedback expected — none needed here, this was autonomous)
  8. 4K upscale via Real-ESRGAN x2

- **Per-shot review cadence:** for autonomous builds, render key preview frames (t=mid-shot) with `python3 -c "from shotNN import frame; ..."` before kicking off the full render. Catches layout/timing/glyph issues in <5s without spending 30-60s on a full encode.

- **Common.py is the leverage point.** This piece added 4 new primitives (`waveform_samples`, `draw_waveform`, `spectrum_bands`, `draw_spectrum`, `hex_grid_text`) on top of the Ramsey Books common.py. Once those primitives exist, each shot is ~80–130 lines and writes in 15-20 minutes. **Investment in shared primitives compounds — every new shot in the series benefits.**

- **Visual through-line via shared seed.** Using `waveform_samples(seed=7)` across Shots 1, 2, 4, and 6 means the same waveform shape appears at start, in the principle diagram, in the spread-spectrum walkthrough, and at the final card. The viewer subliminally registers "this is the same thing all the way through." **For series pieces with a visual anchor (path string, file icon, waveform), use a deterministic generator seed to lock it across shots — costs nothing, lands strongly.**

---

## Subject-matter specific notes — for steganography pieces

- **The "embed your own demo into the artifact" move is irresistible for this subject.** Anything teaching steganography should *be* a steg demo. Curious viewers who download and run `audiowmark get` find the payload. That's the artifact rewarding inspection — exactly what the technique is about.

- **`stegmail.example` as the payload.** 16 ASCII bytes — exactly fills audiowmark's 128-bit short-payload mode (no padding needed). The choice of an `example.com`-style address rather than a real email is the right move: it signals "this is a demo payload, you found the easter egg" without doxxing anyone or implying surveillance.

- **Don't tell the viewer.** The brief was explicit: silent embed. No mention in VO, no on-screen text pointing at it, no metadata callout. Only the actually-curious viewer who runs an audiowmark decode against the audio track will find it. That selection-for-curiosity is the point. **For any "the artifact itself demonstrates X" gag, resist the temptation to wink at the camera. The reward should be private.**

- **Brief took care to flag accuracy non-negotiables.** Steganography vs. cryptography (complementary, not opposed); spread-spectrum is one technique among several; FEC matters for robustness; "below the noise floor" claim requires perceptual masking, not magic. Honoring all four in the VO + visuals avoided overclaim while staying simple. **For any "vs." piece (this concept vs. that concept), enumerate the things you must NOT conflate before writing VO.**

---

## Cost notes

- **Estimated ~$1–3 in APIs + ~$10–15 in Claude tokens.** API spend:
  - NB Pro: 0 plates ($0)
  - ElevenLabs TTS: 1 VO generation ~$0.40
  - ElevenLabs Music: 1 track @ 63s ~$0.25
  - ElevenLabs SFX: 3 samples ~$0.10
  - Whisper local: free
  - audiowmark: free (open source, locally built)
- **Lowest API cost of the series so far.** No NB plates means $0 image-gen. Confirms the "all-PIL when you can" guideline.

---

## Genre-level — for the explainer series

- **Three pieces in, the visual language is fully formed.** Deep blue-black background, warm amber accents (carrier/waveform/active element), pale cool secondary (hidden/payload/passive element), mono font for code/hex/path, serif for titles, sans for labels. Bella VO at speed=1.1, contemplative mood, ElevenLabs ambient underscore at ~13% volume, dip-to-black per-clip fades. **The look is consistent enough now that a viewer who watched Model Weights or Named Tensors will immediately recognize this as part of the same series — without any branding overlay.**

- **The "visual spine" pattern is now standard.** Model Weights: file icon → distributed patterns. Named Tensors: path string opaque → decomposed → returned legible. AI Explains Steganography: clean waveform → contains hidden structure → still clean waveform. Each piece has a single anchor element traversed across the whole arc.

- **The "accuracy non-negotiables" brief section is paying off across the series.** Three briefs now have this section explicitly; three productions have had no factual issues flagged because every accuracy claim was verified against an explicit upfront list. **Standard practice. Worth keeping.**

- **Embedding a functional payload in the artifact is a new pattern.** Not every piece will have one, but for any subject where the technique can be *demonstrated by the file itself* (cryptography, compression, parsing, etc.), consider it. It adds a layer of reward for the technically-curious viewer without disrupting the educational read.
