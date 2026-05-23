# THE DIGNITY OF WORK — Shooting Script v1

**Date:** 2026-05-22
**Slug:** `dignity-of-work` — workspace `data/workspace/dignity-of-work/`
**Format:** 9:16 vertical, 4K final. Target runtime ~72–80s (≤90s ceiling).
**Veo:** Fast default; up to 4 shots on Standard.
**Type:** Polemic. Automation, redistribution, and the future of work — and the
unequal application of all three to preserve structural inequity.

## Through-line (an idea — never stated on screen)

*They'll make you work so they can "work."*

## Logline

A fixed vertical split-screen. Above the line: a candlelit dinner where the
professional/creative class discourses, sincerely, on the dignity of work and the
importance of earning one's place. Below the line: the labor that produces that
dinner — a cook, a courier, a picker, a data-labeler, a cleaner — surveilled and
paced by the same AI that, upstairs, books the car and writes the keynote. The
promised liberation is real. It was delivered upward.

## Tone

No villains. The diners are sincere, articulate, warmly lit, possibly right-sounding.
The instrument of the inequity is never a whip — it is a calm UI, a soft assistant
voice, a pleasant platitude. The banality is the argument. The labor below is shown
in **glimpses** — evidence and punctuation, not a competing narrative. Never let a
diner indict themselves out loud; the contradiction lives in the cut between halves,
not in a confession.

---

## The Formal Conceit — FIXED VERTICAL DIPTYCH

The 1080×1920 frame is a permanent cross-section. It never cuts to a single image.

- **Top zone** (≈1080×900) — the dinner. Warm gold, candlelight, the room expansive.
- **Divider** (≈90px band) — a dark structural floor slab. A **dumbwaiter shaft**
  runs through it: the one channel connecting the halves.
- **Bottom zone** (≈1080×900) — the labor. Cooler, screen-lit, cramped.

Both halves are live the entire runtime. The viewer never gets to stop seeing the
contradiction. The **dinner-table audio is the spine**; the labor below carries
diegetic sound bleeding up underneath.

**The dumbwaiter** is the only object that crosses the line. The plated dish rises
through it; what comes back down is a fresh ticket. The whole economy in one device.

## The two faces of the AI — ONE voice

A single synthetic assistant voice is heard in both halves — the same timbre, two
registers. This is the unequal application made literal.
- **Upstairs (concierge):** soft, deferential. *"Your car will arrive at ten."*
  *"Shall I extend the reservation?"*
- **Downstairs (warden):** same voice, clipped. *"Pace is down four percent."*
  *"You have ninety seconds."* *"You are behind schedule."*

---

## Production Approach

Each beat is **composited**: a top-zone element + a bottom-zone element + the divider
graphic, stacked into the 1080×1920 frame in ffmpeg. Halves are generated separately
for full control.

- **Veo** for any zone with real motion (plating, riding, picking, a laugh, a toast,
  the dumbwaiter dish).
- **nano-banana still + programmatic motion** for atmospheric/low-motion zones
  (the candlelit table held wide, the labeler's screen-lit face, slow pushes).
- The dinner is **not lip-synced** — the voices float over impressionistic affluence
  (hands, candlelight, wine, a sleeve, a laugh). Dodges Veo's dialogue weakness and
  reads as more sophisticated than talking heads.
- Book-end (nano poster frames) every Veo clip. Each half generated at 1:1 or 9:16
  and cropped to the ~1080×900 zone.

---

## Characters

**Dinner (top) — 4 guests, candlelit table:**
- `host` — warm, expansive; says the opening "dignity" line and the capstone.
- `guest_w` — a woman; the "nobody hands you anything / my kids" line.
- `guest_keynote` — the one whose keynote "wrote itself in twenty minutes."
- `guest_fail` — the one who failed upward ("wasn't my call").

**Labor (bottom) — glimpses; `cook` and `cleaner` recur:**
- `cook` — line cook; plates the exact dish eaten above; spine of the lower half.
- `courier` — bike courier in the rain, phone counting down on the handlebars.
- `picker` — warehouse worker, wrist scanner, a rate meter.
- `labeler` — data worker in a small room, clicking through image tiles — training
  the very model the keynote "wrote itself" on. Closes the loop.
- `cleaner` — after-hours; the final image.

## Dinner dialogue (the spine — sincere, never winking)

1. host: *"There's a real dignity in earning your place. You appreciate a thing more when you've had to work for it."*
2. guest_w: *"That's what I tell my kids. Nobody is going to hand you anything."*
3. guest_fail: *"We've gone soft on the whole idea of effort, as a culture."*
4. guest_keynote: *"Did the keynote come together?" — "Twenty minutes. I gave it the angle and it… honestly, it's better than mine."*
5. guest_w: *"I haven't opened my laptop in days. I'm not even joking."* [warm laughter]
6. host: *"But that's the freedom we're building toward. For everyone."*
7. guest_fail: *"…it wasn't really my call. The board wanted a reset. We all moved on."*
8. host (capstone): *"Still — I would never trade the struggle. The struggle is where the meaning is."* [glasses, agreement]

AI concierge (top), AI warden (bottom): see "two faces" above — placed per beat.

---

## Beat Sheet (~9 beats, both zones live)

| # | Top zone (dinner) | Bottom zone (labor) | Veo |
|---|-------------------|---------------------|-----|
| B1 | Establish: candlelit table, 4 guests, warm. Line 1 begins. | Establish: the kitchen, the cook in the heat, ticket screen. | T:still B:**Std** |
| B2 | Guests nod; wine gestured. Line 2. | The cook plates *the dish*, loads the dumbwaiter; it rises. | T:Fast B:Fast |
| B3 | A hand lifts the risen dish from the dumbwaiter, not looking. Line 3. | Courier, rain, handlebar phone. Warden: "you are behind." | T:Fast B:**Std** |
| B4 | Line 4 (keynote). A laugh. Concierge: "shall I extend the reservation?" | Warehouse picker, rate meter. Warden: "pace down four percent." | T:Fast B:Fast |
| B5 | Line 5 ("haven't opened my laptop"), reclining, laughter. | The labeler, clicking image tiles — training the model. | T:still B:Fast |
| B6 | Line 6 ("…freedom… for everyone"). | Hardship glimpse: the courier still out, an exhausted face, countdown. | T:Fast B:**Std** |
| B7 | Line 7 (failure deflected). | A worker's screen: shift extended / rate missed — a consequence lands. | T:still B:Fast |
| B8 | Line 8, the capstone. Glasses raised. | Dumbwaiter drops a fresh ticket; the cook reads it; begins again. | T:Fast B:Fast |
| B9 | Dinner over. Guests rise and leave; the top dims to an empty gold room. | The cleaner climbs up into the emptied dining room and begins. Hold on the cleaner alone; their phone glows with the next job. | T:Fast B:**Std** |

**Ending:** B9 — the labor outlasts the talk. The worker, not the diners, has the
last frame. (Final fine cut decided in edit.)

## Audio

- **Spine:** the dinner dialogue (TTS, 4 voices) — warm, overlapping, unhurried.
- **AI voice:** one voice, two registers, placed per beat.
- **Bottom diegetic:** kitchen clatter / rain+traffic / warehouse hum / mouse-clicks
  / the warden's metronome — always present low under the talk.
- **Music:** sparse. A warm string/piano bed for the dinner that, heard against the
  labor, curdles. ElevenLabs. Possibly drops out entirely for the ending.
- No narration. The through-line is never spoken.

## Cost Estimate

Larger than recent pieces — accepted (user chose "longer + more Standard"). ~13–15
Veo clips (4 Standard), ~5 nano stills, ~30 book-end/plate nano images, ~12 TTS +
music + SFX, QA passes. **Rough total ~$25–38 + Claude tokens.** Veo billed on every
submission incl. rerolls.

## Doctrine

Fast-default; the 4 Standard reserved for the labor establishes (B1, B3, B6, B9).
One generation per shot; keep / edit-rescue / flag-skip; no autonomous rerolls.
Composite discipline: lock the divider geometry once, reuse everywhere.
