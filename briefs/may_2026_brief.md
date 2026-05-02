# May 2026 — Monthly Etymological Series

**Working brief for Claude Code. Living document — edit freely.**

---

## Concept

Etymological hook: May (*Maius*) is most commonly derived from **Maia**, the old Italic earth goddess of growth — consort of Vulcan, mother of Mercury. On the Kalends of May, the *flamen Volcanalis* (priest of Vulcan) sacrificed a pregnant sow to her. Macrobius is the main surviving source; Aulus Gellius corroborates the Maia–Vulcan pairing. Ovid's *Fasti* V opens with the muses unable to agree on the month's etymology — Maia, Maiestas, or *maiores* — and Ovid declines to choose.

The piece holds two things at once: May as the season of growth, and May as a season bought with a death.

## Structure

A pregnant sow (period-appropriate Roman setting) is the through line. Between her beats, inserts of growth in many registers — modern and timeless mixed. At the end, a silhouetted flamen sets a fire and the sacrifice is implied, never shown. Hard cut to end.

Target length: ~50–55s, vertical 9:16.

No VO. Diegetic ambient throughout the first ~35s, low drone entering at the priest's fire.

## Pacing draft (~52s)

| Time | Shot | Notes |
|---|---|---|
| 0:00–0:06 | **SOW (establish)** | Stone enclosure, straw, late afternoon light. Lying on side, very pregnant, breathing slow. Wind, distant birds. |
| 0:06–0:10 | INSERT: bread dough, hands kneading | Modern but timeless framing. |
| 0:10–0:14 | **SOW** — closer on her body | Originally drafted as visible piglet kick under skin; safer alternative is a slow body shift or ear flick (see Veo notes below). |
| 0:14–0:18 | INSERT: child on a bike | Parent's hand on the seat, then letting go. The wobble-then-stable beat. |
| 0:18–0:21 | **SOW** — her face | Eye half-open, calm. |
| 0:21–0:25 | INSERT: blacksmith *(fire 1)* | Hammer striking glowing iron. Sparks. Fire as making. |
| 0:25–0:28 | **SOW** | Light is lower. Honeyed. |
| 0:28–0:32 | INSERT: older hand over child's hand, planting a seed | Modern. Tender. |
| 0:32–0:36 | INSERT: glassblower *(fire 2)* | Molten glass on the pipe, breath shaping it. Fire as breath, fire as form. |
| 0:36–0:41 | **SOW** | Evening blue. Fewer ambient sounds. Hold a beat longer than expected. |
| 0:41–0:46 | **SETUP: priest's fire** | Different fire. Larger, freestanding. Silhouette/back of flamen feeding it. Roman ritual garment, weathered hands. Drone enters. |
| 0:46–0:50 | **SOW (final)** | Very close on her eye. Firelight reflected. Still peaceful. |
| 0:50–0:52 | **HARD END** | Cut to black, or empty enclosure with disturbed straw. Silence. |

## Sow continuity

The sow appears in ~5 separate beats. She must read as the same animal across all of them. Generate a Nano Banana Pro reference of her — specific markings, ear shape, scale of pregnancy — and use as an anchor / first-frame reference for every sow shot. Light changes (afternoon → honey → evening blue → firelight) progressively across the piece.

Roman setting: stone-walled enclosure, straw bedding, simple wooden trough. Avoid anything overtly fantasy/sword-and-sandal. Reference: republican-era Italian farmstead, not Gladiator.

## Insert pool (final selection TBD)

Locked in current draft:
- Bread dough kneading
- Child on a bike, hand letting go
- Blacksmith at forge (fire)
- Older + younger hand planting a seed
- Glassblower (fire)

Bench / alternates if any of the above don't generate well:
- Calluses forming on guitarist's fingers
- Stone being laid into a wall
- Quilt being pieced at a kitchen table
- Stew simmering
- Hair being braided
- Wound healing into a scar
- Lights coming on across a city at dusk
- Market setting up at dawn

Each insert should be 3–5s and read clearly in under 3s. Mix of modern and timeless. No clear century markers in either direction for most.

## Veo-specific notes & risks

- **Compound prompt risk on the priest beat.** "Pregnant animal" + "fire" + "man with sacrificial implements" in proximity is exactly the kind of compound that Veo may refuse or distort. Generate the flamen-and-fire plate completely separately from any sow footage. Splice in edit. The piece never shows them in frame together anyway.
- **The piglet kick (0:10–0:14).** Veo will likely fumble subdermal motion. Default to a body shift, slow breath rise, or ear flick. Don't waste generations on the under-skin movement.
- **Trigger word watch.** Avoid "sacrifice," "slaughter," "ritual killing" in prompts — these will read literally and either refuse or produce graphic results we don't want. The flamen's fire prompt should describe the action as "tending a fire," "feeding flames," "stoking the altar fire" — the meaning is supplied by edit context, not by the prompt.
- **Static camera reminder.** Do NOT add "static camera angle unchanged from before" unless specifically needed. Use reverse clips for static-feeling transitions if continuity reads as off.
- **Audio prompts.** Always include audio notes per shot. For sow beats: "ambient: light wind, distant birds, soft animal breathing, no music." For inserts: location-appropriate diegetic sound. For the priest beat: "low fire crackle, no human vocalization, no music."
- **Bookend workflow.** Use Nano Banana Pro first-frame / last-frame anchors for the sow shots and for the flamen beat.

## Audio plan

- **0:00–~0:35:** Diegetic ambient only. Wind, birds, kneading sounds, bike wobble, hammer strikes, soft hand-on-soil, glass furnace hum. No score.
- **~0:35–0:41:** Ambient thinning. Wind drops. The piece gets quieter, not louder.
- **0:41–0:50:** Low sustained drone enters under the flamen's fire. Subtle. Sub-frequency rather than melodic.
- **0:50–0:52:** Silence. Or: a single low tone cutting off mid-decay at the hard cut.

Drone candidate sources: Suno (with explicit "no melody, no rhythm, low drone, dread without crescendo" direction), or hand-built in editing from layered field recordings.

## Title card / credits (TBD)

End card after the hard cut, plain text on black:

> **MAY**
> *from Maia, Roman goddess of growth —
> to whom, on the first of May,
> a pregnant sow was sacrificed.*

Full credits per series standard: distinguish human oversight / creative direction / production. List Veo, Nano Banana Pro, Suno, Claude Code + ffmpeg as appropriate. Reminder: do NOT reference Adobe Premiere Pro.

Frame the etymological card as factual attestation — Macrobius, *Saturnalia* I.12.18 is the locus classicus if a source citation is wanted in the GitHub README rather than on screen.

## Open questions

- Final ending: cut to black, or cut to empty enclosure? Empty enclosure is the more devastating image but risks being read as on-the-nose. Black is cleaner. Test both.
- Title card timing: before or after the hard cut? Current plan: after.
- Number of inserts: five feels right for ~50s, but if any specific insert is stronger than expected at generation it could expand and replace one of the others.
- Whether to include any reference at all to the unresolved-etymology angle (Ovid's muses arguing). Currently not in the piece — saving for a possible future return to the theme.

## Production order (suggested)

1. Nano Banana Pro: sow reference image. Lock her appearance.
2. Nano Banana Pro: flamen silhouette reference. Lock the silhouette shape and garment.
3. Veo: sow beats in sequence, using the locked reference as bookend anchor. Light progression baked into prompts.
4. Veo: insert clips. Generate more candidates than needed; some will be edit-driven surprises worth keeping.
5. Veo: flamen-and-fire plate. Multiple takes — this is the riskiest generation.
6. Audio: gather diegetic, build drone last.
7. Assembly in Claude Code + ffmpeg. The edit will reshape the structure; that's expected.

---

*Last updated: May 1, 2026.*
