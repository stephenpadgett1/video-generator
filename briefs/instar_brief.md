# INSTAR — Shooting Script v1

**Date:** 2026-05-22
**Slug:** `instar` — workspace `data/workspace/instar/`
**Format:** 9:16 vertical, 4K final. Target runtime ~40s.
**Veo:** Fast default; 2 shots on Standard (B2 the cut, B5 the becoming).
**Type:** Stylized surrealist art piece. Silent-film / expressionist / Lynchian.

## Source idea

A thread is cut from the loom of fate and metamorphoses into a stick insect.
(Reconstructed from the user's direction — no saved brief was found.)

## The idea

A metamorphosis told as a film that metamorphoses with it. The thread changes;
the *form of the film* changes in lockstep — aesthetic, palette, sound, grammar all
mutate beat to beat. The subject of the piece is **the jarring nature of change
itself.** Not a smooth dissolve — a series of jolts.

## Tone

Silent-film bones, expressionist nerves, Lynchian dread in the middle, surreal
tenderness at the end. No dialogue, no intertitles, no words anywhere. The
transformation reads purely through image and sound. Getting weird is the brief.

## The metamorphosing form

| Beat | Palette / aesthetic | Grammar |
|------|--------------------|---------|
| B1 Loom | hard high-contrast B&W, heavy silent-film grain, judder | ordered, geometric, locked |
| B2 Cut | B&W, German-expressionist — raked stage, painted shadow, Caligari angles | theatrical, a held frame |
| B3 Fall | B&W destabilizing — grain swarm, frame judder, first color (a red bleed) | vertigo, falling, unstable |
| B4 Writhe | desaturated sickly — grey, sick green, deep shadow | uncanny, wrong scale, dread |
| B5 Becoming | color floods in — warming, organic browns/greens displacing the grey | surreal, articulating |
| B6 Stick insect | full naturalistic / dream color, soft dappled light | calm, still, a new order |

The film travels from hard B&W order → rupture → uncanny → becoming → soft color
stillness. The viewer should feel the grammar itself molt.

## Visual logic of the transformation

A thread is already nearly a stick insect — a long thin line. The metamorphosis is
**articulation**: the line gains motion (alive), then joints, then legs, then a head.
Nothing is added that wasn't latent in the line.

## Elements

- **The thread** — protagonist. In B&W it is the one pale thread that catches light.
- **The dancer** — agent of fate. Stark white face, dark figure, on a bare raked
  stage, wielding **giant scissors** (taller than a person). Appears in B2 only.
- **The loom of fate** — B1: a vast wall of taut vertical threads.
- **The stick insect** — B6: the arrival state, twig-perfect, motionless.

## Beat Sheet (~40s, 6 beats, all book-ended)

| # | Beat | ~Dur | Veo | Motion |
|---|------|------|-----|--------|
| B1 | THE LOOM — a vast loom of taut threads; the camera settles on one. Tension hums. | 6s | Fast | slow push onto the one thread |
| B2 | THE CUT — the dancer on the raked stage raises the giant scissors to the descending thread; the blades close; the thread is severed. One frame of white-flash inversion on the cut. | 7s | **Std** | the scissor arc + the SHANK |
| B3 | THE FALL — the severed thread falls twisting through a void; B&W cracks apart, grain swarms, a thin red bleeds in. | 6s | Fast | the thread tumbling, frame judder |
| B4 | THE WRITHE — the thread has landed on a pale not-quite-fleshy surface; it writhes, alive, moving wrong. Sickly uncanny palette. | 7s | Fast | the thread writhing, dread-slow |
| B5 | THE BECOMING — thin jointed legs articulate out of the writhing thread; segments form; a head resolves. Color floods in, organic. | 8s | **Std** | limbs unfolding from the line |
| B6 | THE STICK INSECT — the complete creature stands on a real twig in soft dappled light, utterly still, twig-perfect. The film has fully metamorphosed. Hold. → **CUT TO BLACK** | 5s | Fast | near-stillness, one antenna twitch |
| B7 | THE COSTUME — after black: a man in an elaborate stick-insect costume walks down an ordinary well-lit street, on the sidewalk, cars driving past. Flat, mundane, naturalistic — phone-ordinary. The film's last molt: it sheds all its stylization and lands in dumb reality. Hold, end. | 6s | Fast | the man walking, cars passing |

## Audio — a score that metamorphoses, + surreal sound design. No words.

- **Score:** begins as a lone precise silent-film piano figure (ordered). At the cut
  it distorts; through the fall and writhe it smears into a detuned Lynchian drone;
  at the becoming it resolves into something new, strange, organic; B6 ends on a
  sparse calm figure that is *not* the piano — a new instrument for a new form.
- **Sound design:** loom-threads humming under tension + a metronomic loom-clack;
  the **colossal metallic scissor-SHANK** (the central jolt); a falling whoosh + a
  heartbeat; wet/uncanny rasps in the writhe; delicate chitin cracking in the
  becoming; a tiny forest hush at the end.
- ElevenLabs for score + SFX. The score may be built in 2–3 sections and crossfaded
  so it genuinely changes character rather than evolving smoothly.

## Production

Book-end every shot — nano-banana poster frames define each transformation state;
Veo animates between. nano-banana carries the stylization (expressionist, grain,
palette per beat). Heavy per-beat color/grain grading in ffmpeg on top. The white-
flash cut (B2→B3) and the grain/judder of B3 are programmatic.

## Cost estimate

~6 Veo clips (2 Std), ~14 nano poster frames + element refs, score + SFX, grading.
**Rough total ~$12–18 + Claude tokens.**

## Doctrine

Fast-default; 2 Standard on B2 and B5. One generation per shot; keep / edit-rescue /
flag-skip. The aesthetic shifts are deliberate — grade hard, don't be timid.
