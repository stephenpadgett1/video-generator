# Hellzapoppin' — Can Can

**Series:** Hellzapoppin (vaudeville-horror absurdist line; sibling of #4 Loading Dock, Dunham Hall)
**Format:** Vertical 4K (2160×3840), ~50s, no narrator, MC has on-camera Veo-native dialogue
**Venue:** **The Pepper's Ghost** (Victorian music-hall, Pepper's-Ghost-trick lineage)
**Brief date:** 2026-05-25
**Workspace:** `data/workspace/hellzapoppin-cancan/`

## Concept

Hand-painted banner reads **"Hellzapoppin LIVE! at The Pepper's Ghost"**. We transition off the banner into a chorus line performing Offenbach's *Galop Infernal* (Can-Can) on a gilded music-hall stage. Stagehands in the wings flip letter cards spelling **HELLZAPOPPIN**. At the climactic kicks we cut to rapid close-ups of dancers' joyous faces, each snapping from happy → **transformed**: melted, decayed, Cronenbergian flesh-husk versions of the same dancer, in the same lighting, same backdrop. The audience never sees what we see — wide cutaway shows them applauding obliviously. An MC steps to center stage: "Welcome, welcome, welcome. The performers are nearly ready. You'll be enchanted. You'll be transported. You'll forget you ever sat down."

The whole dance retroactively reframes as the Pepper's-Ghost reflection — illusion in the glass — while the decay is what's actually backstage.

## Tone & Reference

- **Surface:** brassy, gilded, footlit, joyful, fast. Toulouse-Lautrec palette over the upper two-thirds; vermillion + ochre + black + worn gold.
- **Transformation reveal:** cool desaturated teal/green, melted flesh, body lost coherence, Cronenberg / Bacon. Reference: `~/Downloads/transformation.webp` (mirror-framed melted humanoid). Same *vibe* per dancer, but each transformed CU sits in **that dancer's actual stage backdrop** in the venue's lighting — not the reference's bathroom-mirror.
- **Through-line (never stated):** what the audience sees is the ghost-glass projection. What we see in the close-ups is what's really there.

## Music

**Source:** Offenbach, *Orphée aux enfers* — Galop infernal ("Can-Can"). PD composition; sourcing a PD recording from Musopen first, falling back to IMSLP / Wikimedia Commons.

**Cue map (~50s, assumes ~110 bpm galop):**
- 0:00–0:04 — banner shot — music off or single brassy stinger
- 0:04–0:10 — pickup / fanfare bars
- 0:10–0:32 — main galop melody (the famous kicks) — dance + sign reveal happens here
- 0:32–0:42 — climactic stretto (faster, louder) → **transformation cuts ride this**
- 0:42–0:50 — Audience applause cutaway → MC steps out → final line

## Cast

| ID | Role | Lock | Notes |
|----|------|------|-------|
| cancan-1 | Lead dancer (red hair, freckles) | yes | CU climax #1 (0.8 happy / 0.4 trans) |
| cancan-2 | Dancer (dark hair, pale) | yes | CU climax #2 (0.6 / 0.6) |
| cancan-3 | Dancer (blonde, broad cheeks) | yes | CU climax #3 (0.4 / 0.8) |
| cancan-4 | Dancer (olive skin, dark eyes) | yes | CU climax #4 (0.0 / 1.2 — straight to transformed) |
| sign-girl | Stagehand in wings (Pierrot-y outfit) | yes | Holds letter cards in cutaways |
| mc | Master of ceremonies in tails | yes | Closing dialogue shot, on-camera Veo audio |
| chorus (5–6) | Wide-shot ensemble | no | Matched costumes; faces blur in motion |
| audience | Cutaway only | no | Faces lit by footlights, applauding |

All chorus dancers in matched 1890s Can-Can: long ruffled red skirts with white petticoats, black stockings, garters, low-cut black bustier, feathered red headdress.

## Environment

`pepper-ghost-stage` — locked. Victorian music-hall proscenium: footlights at base, deep red velvet curtains tied back, gilded plaster boxes flanking, painted backdrop (gas-lit London street or Montmartre rooftops — TBD at plate). Wing space stage-left visible in cutaways. Theatrical warm key + saturated rose footlight wash. Faint smoke haze.

## Shot list

| # | Type | Duration | Description |
|---|------|----------|-------------|
| S1 | Veo Fast / hybrid | 4s | **Banner shot.** Hand-painted "Hellzapoppin LIVE! at The Pepper's Ghost" banner stretched between two stagehands across center stage. Single brassy fanfare stinger; banner drops / is whipped down to reveal the chorus already mid-kick. |
| S2 | Veo Fast | 5s | Chorus knees-up Can-Can kicks, frontal mid-shot — line of dancers, skirts flying, headdresses bobbing |
| S3 | Veo Fast | 4s | Sign-flipper cutaway #1 — sign-girl in wings flips cards **H · E · L · L** to rhythm |
| S4 | Veo Fast | 5s | Chorus second figure — diagonal angle, hands joined, kicks alternating |
| S5 | Veo Fast | 4s | Sign-flipper cutaway #2 — **Z · A · P · O** |
| S6 | Veo Fast/Std | 5s | Chorus peak — full kick line, headdresses bobbing, hard footlight (Std contingency if Fast drifts) |
| S7 | Veo Fast | 4s | Sign-flipper cutaway #3 — **P · P · I · N** (final card lingers an extra beat) |
| S8 | Hybrid stills montage | 4.8s | **Climax** — 4 dancers × (happy → transformed). Beats: D1 0.8/0.4 → D2 0.6/0.6 → D3 0.4/0.8 → D4 0.0/1.2 (D4 skips the happy preamble entirely). Happy CUs extracted from chorus Veo or short dedicated CU Veo. Transformed CUs are Nano Banana Pro frame-edits of those happy frames into melted/decayed state in same lighting/backdrop. Held with subtle drift motion (ffmpeg). |
| S9 | Veo Fast | 3s | Audience cutaway — wide POV of audience clapping, smiling, oblivious. Footlights bottom-light their faces. They didn't see it. |
| S10 | Veo Standard | 7s | MC in tails + top hat steps to center stage, hands raised: **"Welcome, welcome, welcome. The performers are nearly ready. You'll be enchanted. You'll be transported. You'll forget you ever sat down."** Hard cut to black on final word. |

**Total:** ~45.8s.

## Production tactics

- **Identity for chorus**: matched costume + headdress + uniform pose makes face-drift in Veo invisible.
- **Identity for CU dancers**: 4 distinct locks via Nano Banana Pro character refs; refs include face-visible 3/4 portrait per [[feedback_face_visible_in_ref]].
- **Sign-flipper shots**: design cards as oversized printed letters (vintage circus alphabet) on hand-held boards. Pre-render each card as a still for book-end anchoring. Sign-girl flips one per beat — 2 letters per second feels right at 110 bpm.
- **Transformation pipeline** (per dancer): extract happy CU frame from chorus Veo → Nano Banana Pro edit: "same dancer, same costume, same backdrop, same lighting; flesh has dissolved into melted wax-like decay, face features sunk and slumped, cool desaturated teal cast over warm scene." Hold frame ~0.4–1.2s with 1–2% drift/scale motion via ffmpeg.
- **Banner shot S1**: prefer Veo for the dynamic banner-drop reveal. Fallback if Veo drifts: hand-built — Nano Banana banner still + ffmpeg whip-pan / wipe transition to a Veo chorus clip held over.
- **MC shot S10**: Veo Standard with native audio. Lock the MC character. Prompt MC line verbatim. ~7s leaves room for delivery cadence on three "welcomes" plus the four-clause main sentence.
- **No Veo native audio** on shots S1–S9 — `generateAudio: false`. Full audio bed = Offenbach Galop Infernal + designed transformation drone (ElevenLabs sub-bass / ambience) that swells in S8 and undercuts the music under the last 2 cuts. Audience applause SFX (ElevenLabs) overlaid on S9.
- **Risk budget:** allow 1–2 Standard escalations for S2 or S6 chorus shots if Fast drifts on multi-dancer choreography. MC shot is Std by design.

## Cost estimate

- Veo Fast: 8 shots × ~4.5s × $0.10 ≈ $3.60; ~1.5× attempts ≈ **$5.40**
- Veo Std: MC (7s) + ~1 chorus contingency (5s) × $0.30/sec(est) ≈ **$3.60**
- Nano Banana Pro: 4 char refs + MC ref + sign-girl ref + venue plate + banner + 11 letter cards + 4 transformation edits ≈ 23 calls × $0.15 ≈ **$3.45**
- ElevenLabs SFX/drone/applause: ~$1
- QA (clip-qa / frame-qa Opus calls): ~$2
- Per [[feedback_veo_bills_attempts]] padding for hung/RAI attempts: +30% on Veo subtotal ≈ +$2.70

**Total estimate: ~$18–22**. Cap at $30.

## Open risks

- **PD recording quality** — Musopen/IMSLP varies; may need light EQ. Will flag at sourcing time if quality is unusable.
- **Sign-flipper choreography** — Veo may render the wrong letter on the card or a smear. Mitigation: nano-pre-render each card as a still, then book-end frames so the card content is anchored. May need 2 takes per cutaway.
- **Cronenberg/melted body imagery + RAI** — body-horror prose can trip Veo RAI ([[feedback_morbid_content_stills_first.md]]). Mitigation: transformation reveals are **stills, not Veo**. No Veo prompt asks for body horror.
- **Identity drift across 4 happy→transformed pairs** — the transformation must clearly read as "same person, melted." Mitigation: Nano Banana Pro edit uses the happy frame itself as the source; "preserve hair color/length, costume, headdress, framing, lighting; only change face/skin to melted decay."
- **MC dialogue length** — 5 short sentences in 7s is tight. Mitigation: write prompt with explicit beat timing; allow 1 reroll budget.
- **Banner drop in S1** — Veo may not nail the "banner drops to reveal action" dynamic. Mitigation: hand-build fallback via still banner + ffmpeg wipe to chorus clip if Veo S1 drifts.

## Cut sequence

```
S1  (4.0s)  banner             [00:00.0-00:04.0]  silence → fanfare stinger
S2  (5.0s)  chorus kicks       [00:04.0-00:09.0]  melody A
S3  (4.0s)  signs H-E-L-L      [00:09.0-00:13.0]  melody A
S4  (5.0s)  chorus diagonal    [00:13.0-00:18.0]  melody A'
S5  (4.0s)  signs Z-A-P-O      [00:18.0-00:22.0]  melody B
S6  (5.0s)  chorus peak        [00:22.0-00:27.0]  melody B
S7  (4.0s)  signs P-P-I-N      [00:27.0-00:31.0]  bridge to stretto
S8  (4.8s)  climax cuts        [00:31.0-00:35.8]  stretto + drone swell
            D1 happy 0.8 → trans 0.4
            D2 happy 0.6 → trans 0.6
            D3 happy 0.4 → trans 0.8
            D4              trans 1.2 (held)
S9  (3.0s)  audience oblivion  [00:35.8-00:38.8]  applause + music tag
S10 (7.0s)  MC dialogue        [00:38.8-00:45.8]  music drops out → MC line → hard cut to black
```

## Build order

1. **Music** — source PD Offenbach recording (Musopen → IMSLP → Wikimedia fallback). Trim and arrange to cue map. Flag quality issues.
2. **Plate & locks** — env plate (Pepper's Ghost stage), 6 character locks (4 dancers + sign-girl + MC).
3. **Banner asset** — hand-painted banner image with "Hellzapoppin LIVE! at The Pepper's Ghost".
4. **Sign cards** — 11 letter cards as stills (H, E, L, L, Z, A, P, O, P, P, I, N).
5. **Sign cutaways S3/S5/S7** — Veo Fast, book-end, lowest-risk shots first to validate sign mechanic.
6. **Chorus shots S2/S4/S6** — Veo Fast (Std contingency for S6).
7. **Banner intro S1** — Veo or hand-built fallback.
8. **Happy CU extraction** — pull 4 clean dancer CU frames from chorus Veo.
9. **Transformations** — Nano Banana Pro frame-edit each happy CU → transformed.
10. **Climax montage S8** — assemble stills timeline with drift motion.
11. **Audience S9** — Veo Fast.
12. **MC S10** — Veo Standard with native dialogue audio.
13. **Audio** — layer Offenbach bed + transformation drone + applause SFX + MC dialogue.
14. **Assembly** — full timeline, hard cut to black.
15. **Master + 4K upscale** — Real-ESRGAN ×2.
