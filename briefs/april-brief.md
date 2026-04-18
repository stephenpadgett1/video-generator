# APRIL — Monthly Calendar Series

## The Idea

April is a word whose meaning is lost.

It's painted in red on a 2,100-year-old wall — the Fasti Antiates Maiores, the oldest surviving Roman calendar, created between 84–55 BCE — and we can still read the abbreviation **APR**. But nobody knows what it actually means anymore. Four competing etymologies exist. None are settled:

- *aperire* — "to open" (flowers, buds, the earth after winter)
- *Aphrodite* — the goddess, via Ovid
- *Apru* — a conjectured Etruscan borrowing (no direct physical evidence exists)
- *\*ap(e)ro-* — Proto-Italic for "the next one," i.e. the second month

The Romans themselves disagreed. Varro rejected the Aphrodite connection. Ovid championed it. The Fasti Praenestini inscribed the *aperire* reading in stone. Modern linguists call that folk etymology.

**The piece is about this gap: a name that outlasted its own meaning.** Everyone has a story. Nobody knows. The word just persists.

---

## Format

- **Aspect ratio:** 9:16 (vertical)
- **Duration:** 35–45 seconds
- **No voiceover**
- **Music:** Yes — something that begins warm/organic and becomes more austere or bare. Could be a single instrument that thins out. Could be ambient drone that empties. The emotional arc is: lush → sparse. Beautiful → uncertain. If using Suno or ElevenLabs for generation, keep it simple. A solo cello or bowed string that gradually loses its resonance would work. No percussion.

---

## Structure (5 shots)

### Shot 1 — THE OPENING (6–8 sec)
Extreme close-up: flower buds opening in warm spring light. Soft, golden. The obvious, beautiful reading of April — *aperire*, "to open." This should feel like every greeting card and stock photo of spring you've ever seen, but rendered with enough visual quality that it's genuinely beautiful rather than ironic. Morning light. Dew. Slow unfurling.

**Veo prompt direction:** Simple physical description. "Extreme close-up of flower buds slowly opening in warm golden morning light. Dew visible on petals. Soft focus background. Gentle, slow movement. 9:16 vertical." Keep it clean — no poetic language in the prompt.

### Shot 2 — THE SHIFT (5–7 sec)
The flowers are still present but the light changes. Overcast. The color drains slightly — not to monochrome, but cooler, flatter. The camera pulls back (or cuts wider) and we realize the flowers are against a wall. Plaster. Stone. They're growing from a crack in old masonry, or climbing a weathered surface. The "opening" is now ambiguous — nature asserting itself against something built and decaying.

**Veo prompt direction:** "Flowers growing from a crack in old weathered plaster wall. Overcast light, muted color palette. Camera slowly pulling back to reveal the wall surface. Some plaster crumbling. 9:16 vertical."

### Shot 3 — THE WALL (6–8 sec)
No flowers now. Just a wall. Aged plaster, off-white with traces of red and black pigment — the palette of the actual Fasti Antiates Maiores (painted in red and black on white plaster). The surface is cracked, stained, partially effaced. We're looking at something very old. The camera moves slowly across it, as if searching for something.

**Veo prompt direction:** "Slow tracking shot across an ancient plaster wall with traces of red and black painted markings. Faded, partially effaced. Cracks in the surface. Dim, even lighting as if in a museum or underground chamber. 9:16 vertical."

### Shot 4 — THE LETTERS (6–8 sec)
The camera finds them. Three letters in faded red paint on white plaster: **APR**. They're legible but worn. The camera holds on them. Nothing explains them. They just exist — marks made by a hand two thousand years ago, still readable, still unexplained.

**Production note:** This shot will likely need to be composited or the text added in post, since Veo won't reliably generate specific legible Latin text. Options:
- Generate the blank wall in Veo, add the text as an overlay in ffmpeg (burned-in, not a clean modern font — something that looks hand-painted, irregular, slightly faded, in a muted red/ochre)
- Generate a reference image with text via GPT Image 1.5, use as first-frame anchor for Veo
- If neither works cleanly, this can be a static or near-static shot with subtle camera drift added in post

The letters should feel *found*, not designed. No serifs. No typography. Paint on plaster.

### Shot 5 — THE DISSOLUTION (8–10 sec)
The letters remain but the wall around them slowly changes. Plaster crumbles at the edges of frame. Or dust falls. Or light shifts — the dim interior light slowly brightening as if the wall is being exposed to open air for the first time. The letters don't move. They stay. Everything else is uncertain.

Hold on this. Let it breathe. The piece ends here — on the persistence of a word no one can explain.

**Veo prompt direction:** "Ancient plaster wall with faded red painted letters. Dust slowly falling in a shaft of light. The light gradually brightens as if a door or ceiling has opened. The wall surface remains still. Atmospheric, slow. 9:16 vertical."

---

## Text Overlays

Minimal. Two moments:

1. **Over Shot 1 or the transition into Shot 2**, the four etymologies appear one at a time, each held for ~2 seconds, then fading:

   ```
   to open
   Aphrodite
   Apru
   the next one
   ```

   Small, lowercase, sans-serif, white with slight opacity. Positioned lower-third. Each one replaces the last. They should feel like guesses — offered and withdrawn.

2. **End card (over Shot 5 or after it):**

   ```
   APRIL
   ```

   Centered. Held for 3–4 seconds. Same treatment as the monthly series title cards for prior installments. Then:

   ```
   a][ productions
   ```

---

## What This Piece Is NOT

- It's not a history lesson. No dates, no "did you know," no educational framing.
- It's not about Veneralia, Venus, or Roman religion specifically — that research informed the concept but the piece is more abstract.
- It's not ironic or clever. It's genuinely interested in the mystery.
- It's not melancholy. The ending isn't sad — it's about persistence. The word survived. That's remarkable, not tragic.

---

## Tone References

- The texture of Andrei Tarkovsky's close-ups of walls and water in *Nostalghia* — surfaces that hold time
- Agnes Martin's paintings — minimal marks on a pale field, the meaning is in what's withheld
- The mood (not content) of the Spatial Coherence piece from January — patient, observational, trusting the viewer to sit with ambiguity

---

## Technical Notes for Claude Code

- **Veo prompting:** Clean, simple physical descriptions outperform poetic language. Include audio notes in prompts. Clarity over poetry. Tonal notes help for character action but straightforward wins.
- **Continuity across shots:** Use first/last frame reference images (via Nano Banana Pro or GPT Image 1.5) to maintain visual continuity, especially for the wall texture across Shots 3–5.
- **The text in Shot 4** is the hardest production challenge. Don't fight Veo on legible text — plan to composite it. A hand-painted irregular font in muted red/ochre, partially transparent, with some noise/grain to match the wall texture.
- **Color grade:** Warm in Shot 1, cooling through Shot 2, neutral/muted for Shots 3–5. The shift should feel gradual, not dramatic.
- **Audio:** Music should run the full duration. No sound effects needed unless they emerge naturally from Veo generation (ambient room tone, etc., which could work well for the interior shots).
- **Assembly:** Linear sequence. No intercuts, no flashbacks, no split screens. One continuous drift from nature to artifact.
- **Aspect ratio reminder:** All Veo generations must be 9:16 vertical.
- **For reverse-clip static scene transitions:** if using a fixed camera angle across consecutive shots with the same environment, generate the second clip and reverse it rather than prompting "static camera angle unchanged" — this produces more seamless continuity.
- **If Stephen is available during production**, flag any content moderation issues with Veo early. The wall/plaster shots should be safe but the text overlay approach may need iteration.
