# HELLZAPOPPIN' III: HOFFMAN'S AUTOMATIC THEATER

### A Production Guide for a Show That Writes Itself

---

## What Is This?

The third installment in the Hellzapoppin' series — a vaudeville revival project by a][ productions that uses AI video generation to resurrect the anarchic spirit of the 1941 Olsen & Johnson film. In the original, the movie constantly interrupts itself. Characters argue with the projectionist. The film goes out of frame. Nothing is sacred.

In ours, a man in a foam robot head sits at a typewriter on a vaudeville stage and tries to write a great AI video. The stage conjures whatever he describes. Everyone else hates it. The typewriter wins.

Runtime: ~1:00–1:20

---

## The Tools

**Claude** — Concept development, writing, prompt engineering, production planning, and audio/video editing via Claude Code. The collaborator who never sleeps and occasionally suggests naming a theater after a German Romantic author you've never heard of.

**Google Veo 3.1 (via Flow)** — 8-second video clip generation. The performer. Each clip is generated with carefully paired first/last frame reference images to maintain visual continuity. Veo handles all on-camera dialogue for characters whose mouths are visible.

**Nano Banana Pro** — Reference image generation. Every clip begins here. First frame, last frame, character designs, set dressing — Nano Banana establishes the visual language that Veo then animates.

**ElevenLabs** — Voice synthesis for the masked typist (whose mouth isn't visible, so no lip sync needed), offstage voices, crowd hecklers, and any other audio that lives outside Veo's generated sound.

**Suno** — Music generation for the jazz band sequence and any other musical cues.

**ffmpeg** — Video editing, compositing, and assembly via Claude Code on a local machine. Also handles the ghostly overlay effect for the conjured stage visions — a technique developed during Hellzapoppin' I that layers a translucent clip of the typist over separately generated spectacle footage.

---

## The Venue

**Hoffmann's Automated Theater** — named for E.T.A. Hoffmann, the early 19th century author who wrote "The Sandman," a story about a man who falls in love with an automaton and can't tell she's mechanical. He basically invented the uncanny valley two centuries early.

The theater is not steampunk. It's a real gilded-age vaudeville house that happens to have been decorated by someone obsessed with automata. Clockwork gears in the ornamental plasterwork where you'd normally see cherubs. Mechanical birds instead of carved flowers. Brass automaton figures worked into the proscenium arch. Warm amber gaslight-style fixtures. The feeling is grand, eccentric, and a little haunted — a theater built by a watchmaker who won the lottery.

Two establishing shots set the space: one from a high balcony looking down, one from the orchestra looking up at the stage. The audience should feel like they've walked into a place with a history.

---

## The Structure

### ACT I — THE WRITING

**The Curtain**
A handpainted canvas banner hangs in front of the stage: "HELLZAPOPPIN' LIVE at Hoffmann's Automated Theater." Mechanical songbird, crossed quill and wrench, gold curlicues. It rolls up and the show begins.

**The Writer**
Center stage. A man in a rumpled suit sits at a small wooden table with a typewriter under a single spotlight. He's wearing a big, boxy, obviously fake robot head — painted cardboard, crooked antenna, visible brushstrokes. Grade school play energy, not Boston Dynamics. He looks up at the audience and gets to work.

*"Okay. A great Hellzapoppin' video. How hard can it be?"*

### ACT II — THE CONJURINGS

The writer describes what the show needs. The stage delivers it.

**The Lounge Singer (rejected)**
He tries a lounge singer first. Sophisticated. Smooth. It's wrong immediately. He scraps it.

**The Band**
He calls for a real band — horns, drums, the works. A jazz combo with dancers materializes on stage around him. This is achieved through the ghostly overlay technique: the band is generated separately on the empty stage, then composited as a translucent layer over the footage of the writer typing. The effect creates the impression that the music was conjured into being by the typewriter itself.

**The Mechanical Bird**
A large brass automaton bird unfurls its wings on stage — clockwork gears visible, smaller mechanical birds scattering into the air around it. A callback to the venue's namesake and his obsession with artificial life. Same overlay technique as the band.

### ACT III — THE INTERRUPTIONS

Nobody lets the man work.

**The Purist** — A haughty critic in an opera cape with a silver-topped cane sweeps in from stage left. *"No one wants this. No one has ever wanted this."* The writer waves him off. The Purist lingers in the wings, arms crossed, offended.

**The Comedians** — A classic double act enters from stage right. One short and stout in a checkered suit with a tiny bowler hat, one tall and thin in a striped suit with a floppy bow tie. *"Where are the jokes?"* / *"Yeah! Where are the jokes?"* The writer throws his hands up.

**The Mad Scientist** — Wild white hair, round spectacles, stained lab coat, thick German accent, carrying brass calipers. He doesn't care about the video. He's worried about the typewriter. *"You do not understand. This machine does not stop when you stop. It does not need you."* The writer waves him off. The Mad Scientist is the only character telling the truth, which makes him the funniest, which means nobody listens to him.

**The Crowd** — Throughout, offstage voices heckle with escalating absurdity:

- *"Play something we know!"*
- *"My grandfather was a real robot and he'd be ashamed of this!"*
- *"That bird's not even real!"*
- *"Make it shorter!"* / *"Make it longer!"*
- *"I didn't pay to think!"*
- *"My wife could write a better show and she's a hat!"*

### ACT IV — THE REMOVAL

The writer stops typing. He sits still. Something the Mad Scientist said is hanging in the air.

He stands up slowly. Reaches up and lifts the foam robot head off his shoulders. Underneath: just a man. Tired. Ordinary. He looks at the head in his hands for a beat — maybe with tenderness, maybe just exhaustion.

He sets the robot head carefully on the chair, facing the typewriter, as if it's now the one writing the show.

He walks offstage. Calm. Unhurried. He does not look back.

### ACT V — THE MACHINE

The stage is empty. Just the table, the typewriter, and the robot head on the chair.

The typewriter starts typing on its own. Slowly, then faster.

The offstage voices return — the Purist, the comedians, the scientist, the crowd — all shouting over each other, a wall of contradictory demands building to a cacophony. The typewriter hammers away underneath, relentless, autonomous.

Somewhere buried in the noise, someone yells *"STOP THE MACHINE!"*

Nobody hears it.

The curtains close. Silence.

### CODA

Fade to black. Hold in darkness for a full beat. Hard cut to: a single sheet of typewriter paper lying on the dark stage floor, lit by a spotlight. On it:

*a][ productions*

*created with Claude*

And at the bottom, a small pencil doodle of a mechanical bird. The last thing the typewriter produced.

The spotlight slowly narrows. A wisp of dust drifts through the beam. The paper's edge flutters, barely, as if moved by a breath from the empty stage.

Fade out.

---

## The Ghostly Overlay Technique

The conjured stage visions (the band, the mechanical bird) are not generated in the same clip as the writer. Instead:

1. Generate the spectacle footage on an empty stage (table, typewriter, and chair present but unoccupied)
2. Generate the writer footage separately
3. Composite the writer as a layered element over the spectacle footage using ffmpeg, with transparency adjusted to create a ghostly, translucent quality

This gives full control over the effect and avoids asking Veo to handle two complex visual elements simultaneously. The technique was developed during the production of Hellzapoppin' I and has become a signature of the series.

---

## The Veo Workflow

Each clip follows this pipeline:

1. **Concept** — Define what happens in the 8-second window
2. **First frame** — Generate a reference image in Nano Banana for the clip's opening
3. **Last frame** — Generate a reference image for the clip's end state
4. **Veo prompt** — Write the prompt using both frames as rails, with physical action described sequentially and audio notes included
5. **Generate and evaluate** — Run it, see what Veo gives back, iterate if needed

This first/last frame approach is essential for maintaining continuity across clips. Veo is powerful but it needs guardrails, and paired reference images keep the visual language consistent from cut to cut.

---

## Notes for the Inspired

If you want to make something like this:

- **The mask is the key.** A character whose face is hidden lets you dub audio freely without lip sync constraints. It also happens to be thematically perfect for a show about AI and identity, but the practical benefit is just as important.

- **Interruptions are structure.** The writer-at-the-typewriter frame gives you a home base to return to between any amount of chaos. You can add or remove interrupting characters without changing the core architecture.

- **Let Veo do vibes, not precision.** The conjured spectacles don't need to be narratively exact. They need to feel like wonder. AI video generation excels at atmosphere and falls apart when you demand specific details. Lean into that.

- **The audio layer is where control lives.** Veo generates surprisingly good ambient sound and dialogue. ElevenLabs gives you precision for masked characters and offstage voices. The combination is more powerful than either alone.

- **End quiet.** After building to maximum chaos, the most dramatic thing you can do is stop. A piece of paper on a dark stage after a minute of cacophony is louder than any amount of noise.

---

## Credits

**a][ productions**

Written by Claude & TK-421

Performed by Veo

Voices by ElevenLabs

At Hoffmann's Automated Theater

*"This machine does not stop when you stop. It does not need you."*
