# Hellzapoppin' No. 5 — The Pepper's Ghost (Can-Can) — Lessons

Built and shipped 2026-05-25 → 2026-05-26 over ~14 iteration passes (v0 painterly → v14 final). Vaudeville Can-Can dance number with a body-horror reveal underneath. ~1:00, vertical 4K.

Final: `data/workspace/hellzapoppin-cancan/final/cancan_v14_4k.mp4`
YouTube: https://youtube.com/shorts/nzvwrnlvmNs

## What worked

### Body horror via hard cut, not morph
The single biggest creative win. Live morphing (Veo book-end happy→melted) renders convincingly enough on the face but **leaves the neck visibly the dancer's own** — the audience can't escape "wait that's still her, with a thing over her face." Fixed by switching to **hard cut to a different angle of the same dancer in a corrupted version of the stage**, already fully transformed. The cut IS the transformation. Each dancer's post-morph CU uses a distinct angle (3/4-left profile / 3/4-right / low / high) and a darker, color-drained, slightly twisted backdrop. Combined with the OTS-style "we're now looking at the version behind the Pepper's Ghost glass," the reveal lands without needing Veo to render the morph itself. **Stills with subtle ffmpeg drift motion are sufficient** for the transformed half of each beat. See [[feedback_veo_lastframe_only]] for the related Veo book-end constraint that pushed us here.

### Music-tutti-on-climax timing
The PD Offenbach galop has its climactic tutti naturally at the end. To put that crescendo on the S8 climax cuts, **delay music_start = climax_end − music_duration**. For us: climax ended at 36.3s, music was 31.68s long → start at 4.6s. Adjusted the music start (not the cue map) when we made other timing changes downstream. Music duck (volume 0.25) for the 3s grey-suit dialogue under it works cleanly via `volume=eval=frame:volume='if(between(t,X,Y),0.25,1)'`.

### Photoreal pivot mid-build
First pass leaned painterly cabaret-poster (gilded illustrations, art-nouveau lettering, cartoon faces). User halted and called for photoreal. **Salvaged** the music, the hand-painted props (banner, cards), and the basic project structure. **Reshot** env plate, all 6 character locks, all book-end frames, all Veo shots. Total redo cost ~$10 (already-spent Veo could not be cancelled but failed cleanly). The recovery was fast because the cue map and shot decomposition held; only the visual register changed. Codified the convention: [[feedback_hellzapoppin_photoreal]]. Also: **"Technicolor 1950s period drama" is the right prompt anchor** for nano/Veo when targeting photoreal-but-saturated. Plain "photoreal" pulls toward muddy modern.

### Downstage staging requires explicit prompt
First photoreal char gens placed dancers UPSTAGE against the painted backdrop because the env plate had foreground audience + middle stage + upstage backdrop. The model picked the wrong staging layer. Fixed by explicit prompt: "stands DOWNSTAGE at the front edge of the wooden stage, just behind the row of glowing gas footlights visible at the bottom of frame; camera at audience eye level; subject occupies central two-thirds of vertical frame." No env-plate ref (which was pulling them upstage). The footlights-at-bottom-of-frame language is what makes Veo place the figure correctly downstage in subsequent shots.

### Card mechanic with mixed presenters > single character
v1 had clown holding all three cards (HELL/ZAPO/PPIN). Felt repetitive. v2 split across 4 cards alternating clown ↔ dancers: Clown:HELL → Outer dancers:Z+A → Clown:POP → Inner dancers (share):PIN. Each dancer holding her own letter card (Z, A) is more dynamic than two sharing one; for 3-letter chunks (PIN), two-dancer joint hold works fine.

### Recurring character callback (grey-suit + palm)
Bringing back the man-in-grey-suit + potted-palm from Hellzapoppin No. 1 as the wings-aside gag locked the piece into the series spine. **Setup beat (silent kneeling tenderness, 4s) → payoff beat (dialogue address to the plant, 3s)** is the proven shape. The line ("The applause is all for you.") delivered tenderly to a plant while the show happens off-camera is the cleanest absurdist beat in the piece.

### Date-palm fat-trunk inside joke
User provided a Phoenix canariensis reference. Pulled the distinctive **fat scaly diamond-pattern trunk** as the visual joke. Used the user's image as a nano ref + kept our existing dark-green ceramic pot for series continuity. The trunk being unmistakably-a-palm-tree was the load-bearing detail. Worth asking for visual references when there's an inside joke or specific aesthetic the user has in mind.

### REMEMBER NOTHING button + MC silent stare
Two-beat closer: MC's last line ("...you'll forget you ever sat down.") then **hands lower, smile drops, held silent unsmiling stare to camera for 3s** before cut to the clown button. The silent stare lands harder than the line. Then clown (now wearing the dancers' headdress) holds "REMEMBER NOTHING" card. The button works because the clown's been the wings-presenter all along; ending on her gives the piece a unified voice. **Have characters return to button** wherever possible.

### Greasepaint-on-mirror credits with calypso under
Empty Vaudeville dressing-room mirror as the credits canvas, credit names composited as red Marker Felt Wide greasepaint with downward drips + slight glow underneath (all via PIL). Bright calypso steel-pan music underneath was the user's call — incongruous cheer over a dressing-room horror frame. **The mismatch is the joke.** For text within ornate-framed image, **constrain horizontal placement to the visible inside of the frame** (mirror bounds: x 170–560 in a 720-wide image) with auto-font-shrink if a line overflows.

## What didn't work / had to fix

- **Veo lastFrame-only book-end** — errors "Frame interpolation requires both an input image and a last frame." Captured in [[feedback_veo_lastframe_only]]. Either use first+last, first-only, or no anchors.
- **S1 banner push-through, take 1** — top of the lobby doors went transparent/dissolved mid-camera-move. Fixed with an explicit "the lobby architecture must REMAIN SOLID, COMPLETE, AND CONTINUOUS throughout, every surface fully realized" addition to the prompt + fresh seed.
- **S6b card text orientation** — first nano gen of REMEMBER NOTHING rendered the two words as vertical columns rather than two horizontal stacked lines. Fixed with explicit "TWO HORIZONTAL LINES OF TEXT, both lines reading left-to-right; REMEMBER sits ABOVE NOTHING." Card text orientation in held-overhead shots needs explicit cardinal-direction prompting.
- **Veo dropping a frame at the end of S4** — chorus diagonal clip had a backdrop saturation shift and chorus reframing in the last ~1.2s. **Always trim Veo clips before any visible drift** — the "good middle" of a clip is more reliable than the full clip. Easy fix: trim S4 to 2.5s, extend the next shot to fill the duration.
- **Continuous melt-morph approach (v1 of climax)** — see above. The neck stayed visibly the dancer's own. Pivoted to hard-cut-different-angle approach.

## Generalizable techniques

- **Post-morph cut > live morph** for any "this character is wrong now" reveal. Cut to a different angle in a corrupted version of the same space. The cut is the transformation.
- **Music delay math**: for PD orchestral cues with the climax at the end, `music_start = climax_end − music_duration`. Then duck under any dialogue with a volume=eval=frame conditional.
- **Veo audio ducking via filter expressions** rather than splitting/concating audio tracks. `volume=eval=frame:volume='if(between(t,X,Y),0.25,1)'` is robust.
- **Series-spine character returns** — bringing a character from earlier in the series back with a small variation (here: grey-suit man + palm aside) is the cheapest way to make a one-off feel like part of a connected body of work.
- **Mux new audio into existing 4K video** to avoid a 30-minute re-upscale. After the visual is locked, audio iterations are essentially free: `ffmpeg -i video_4k.mp4 -i new_audio.wav -map 0:v -map 1:a -c:v copy -c:a aac out.mp4`.
- **Stills with PIL composited text + ffmpeg fades** > nano-banana for credits or any "text on a surface in a fixed environment" sequence. Full control over font, placement, drips, glow. Single plate, all variations.

## Cost (rough)

- Veo: ~$25 (multiple re-rolls across S1, climax morphs, palm, MC, button). Significant from the photoreal pivot + iterative refinement passes.
- Nano: ~$8 (env + chars + cards + frames + iterations including the photoreal redo).
- ElevenLabs: <$1 (offstage VO + calypso music).
- Upscale: ~$0 (local Real-ESRGAN, just compute time — 37 min).
- Claude/Opus: not separately budgeted; sustained across ~14 iteration passes including the v0 painterly redo.

**Total project cost: ~$35–40**, well above the original $25 cap due to the painterly→photoreal pivot, but the recovery was the right call.
