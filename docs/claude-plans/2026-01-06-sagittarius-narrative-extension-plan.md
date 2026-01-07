# Plan: Extend Sagittarius Video with Narrative

## Current State
- 5 shots across 5 environments (mountain → ocean → city → forest → crossroads)
- 24 seconds total, no dialogue, visual storytelling only
- Character: middle-aged adventurer (locked appearance)
- Theme: "Why Choose?" - embracing all paths

---

## Creative Direction

### Narrative Approach: Internal Monologue
The traveler speaks directly - not to an audience, but as someone thinking aloud. These are the thoughts of someone who has stopped explaining themselves to others. Warm, grounded, with occasional philosophical edges. Not preachy - earned wisdom from someone who's lived it.

### Tone: Grounded Philosophical
Conversational warmth with lyrical moments. The Sagittarius archetype is optimistic but not naive, wise but not pretentious. Someone who's seen enough to speak simply about big ideas.

### Core Theme
The world demands you pick a lane. Career, place, identity. "What do you do?" expects one answer. This character refuses the premise. Not from indecision - from fullness. They've been everywhere and belong everywhere.

---

## Scene Dialogues

Each scene below has dialogue that could work as a standalone extension. The dialogue reflects that scene's mood and energy from the original project.

### Scene 1: Mountain Summit
**Mood:** contemplative | **Energy:** 0.3 | **Tension:** 0.2

*The traveler stands alone at the peak, wind in their hair, gazing at endless ridges.*

> "People ask where I'm from. I used to have an answer. Now I just point at the horizon and say... somewhere past that."

**Action notes:** Minimal movement. Character speaks while looking outward, maybe a slight turn toward camera on the last line. The stillness is the point.

**Duration if extended:** +8-10s

---

### Scene 2: Ocean Shore
**Mood:** hopeful | **Energy:** 0.4 | **Tension:** 0.3

*Walking barefoot along volcanic sand, waves rolling in.*

> "I stopped making plans when I realized... the best things that ever happened to me were detours."

**Action notes:** Walking and talking. Natural, unhurried pace. Could glance at the ocean mid-line. The forward motion reinforces the message.

**Duration if extended:** +8-10s

---

### Scene 3: Urban Rooftop
**Mood:** triumphant | **Energy:** 0.5 | **Tension:** 0.4

*Standing on a rooftop at dusk, city lights flickering on below.*

> "Everyone down there picked a door. Walked through it. Built a life behind it." *(beat)* "I just... kept walking past doors."

**Action notes:** Looking down at the city, then turning to face camera on the second line. The height gives perspective - literal and metaphorical.

**Duration if extended:** +10-12s

---

### Scene 4: Forest Path
**Mood:** serene | **Energy:** 0.6 | **Tension:** 0.3

*Moving through dappled sunlight on a forest trail.*

> "You know what nobody tells you about paths? They don't disappear when you leave them. They're still there. All of them. Waiting."

**Action notes:** Walking through the forest, light shifting. More energy here - could gesture slightly on "all of them." Comfortable in motion.

**Duration if extended:** +8-10s

---

### Scene 5: Crossroads
**Mood:** peaceful | **Energy:** 0.5 | **Tension:** 0.2

*Standing where multiple paths diverge, facing camera with calm knowing expression.*

> "They always ask... 'Which way?' Like standing at a crossroads means you have to leave." *(small smile)* "Why choose?"

**Action notes:** This is the thesis. Delivered directly to camera. The smile isn't smug - it's genuine peace. The "Why choose?" lands soft, not defiant.

**Duration if extended:** +10-12s

---

## Execution Plan (Once Scene Selected)

1. **Generate extended shot** using existing character + environment locks
2. **Use Veo native dialogue** - dialogue text passed to prompt generation
3. **Assemble**: Original video + extended scene inserted at appropriate position + end card
4. **Review/trim** if needed using clip edit system

## Files
- Project: `data/projects/sagittarius_why_choose.json`
- Character lock: `data/locks/character_sagittarius_traveler.json`
- Environment locks: `data/locks/environment_*.json`
- Videos: `data/video/veo_*.mp4`
- Export: `data/exports/sagittarius_why_choose.mp4`
