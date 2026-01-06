# Character Dialogue System Enhancement

## Goal
Enable multi-character dialogue in video projects, allowing different characters to speak with distinct voices and precise timing within and across shots.

## Current State

**What works:**
- Single narrator VO per shot with `start`/`middle`/`end` timing
- audioLayers in assembly can have different voice_ids
- Mood/tension/energy affect voice modulation
- TTS generated on-the-fly via ElevenLabs

**What's missing:**
- No character → voice mapping
- No dialogue structure (just single `vo.text` per shot)
- No precise timing for back-and-forth exchanges
- No narrator vs character distinction

## Proposed Data Model

### 1. Project-level voice casting
```typescript
// In Project interface
voiceCasting?: {
  [characterId: string]: string;  // character_id → ElevenLabs voice_id
  narrator?: string;              // Optional narrator voice
}
```

### 2. Shot-level dialogue array (replaces single vo)
```typescript
// In Shot interface - new field alongside existing vo
dialogue?: Array<{
  speaker: string;           // character_id or "narrator"
  text: string;
  timing: number;            // Seconds from shot start (precise)
  mood?: Mood;               // Override shot mood for this line
}>;

// Keep existing vo field for backward compatibility
vo?: { text: string; timing: 'start' | 'middle' | 'end' };
```

### 3. Example project structure
```json
{
  "voiceCasting": {
    "marcus": "pNInz6obpgDQGcFmaJgB",
    "elena": "EXAVITQu4vr4xnSDxMaL",
    "narrator": "onwK4e9ZLuTAKqWW03F9"
  },
  "shots": [{
    "shot_id": "shot_2",
    "dialogue": [
      { "speaker": "narrator", "text": "They stood in silence.", "timing": 0.0 },
      { "speaker": "marcus", "text": "I didn't think you'd come.", "timing": 2.5 },
      { "speaker": "elena", "text": "Neither did I.", "timing": 5.0 }
    ]
  }]
}
```

## Files to Modify

### 1. `src/agents/types.ts`
- Add `voiceCasting` to Project interface
- Add `dialogue` array to Shot interface
- Keep `vo` field for backward compatibility

### 2. `server.js` - Assembly endpoint (~lines 3054-3130)
- When processing shots, check for `dialogue[]` array
- For each dialogue line:
  - Look up voice_id from `project.voiceCasting[speaker]`
  - Calculate absolute startTime: `shotStartTime + line.timing`
  - Push audioLayer with text, voice_id, mood
- Fall back to existing `vo` handling if no dialogue array

### 3. `server.js` - Project generation endpoint (~lines 2010-2195)
- Update Claude prompt to generate `dialogue` arrays for conversation scenes
- Generate `voiceCasting` based on characters in project
- Auto-select voices via `/api/elevenlabs/voices` or let agent choose

### 4. `validators.js`
- Add `validateDialogue()` function:
  - Check all speakers exist in voiceCasting
  - Validate timing doesn't exceed shot duration
  - Warn on overlapping dialogue lines
  - Check for missing voiceCasting entries

### 5. `CLAUDE.md`
- Document dialogue structure
- Add voiceCasting section
- Update audio documentation

## Implementation Order

1. **Types** - Add interfaces (types.ts)
2. **Assembly** - Process dialogue arrays in /api/assemble
3. **Validation** - Add dialogue validators
4. **Generation** - Update project generation to produce dialogue
5. **Documentation** - Update CLAUDE.md

## Backward Compatibility

- Existing `vo` field continues to work unchanged
- `dialogue` array is optional - projects without it work as before
- `voiceCasting` is optional - falls back to provided voice_id or default

## Example Assembly Flow

```
Input shot:
  shot_id: "shot_2"
  dialogue: [
    { speaker: "marcus", text: "Hello", timing: 0.5 },
    { speaker: "elena", text: "Hi", timing: 2.0 }
  ]

voiceCasting:
  marcus: "voice_abc"
  elena: "voice_def"

→ Generated audioLayers:
  [
    { type: "vo", text: "Hello", voice_id: "voice_abc", startTime: shotStart + 0.5 },
    { type: "vo", text: "Hi", voice_id: "voice_def", startTime: shotStart + 2.0 }
  ]
```

## Design Decisions

1. **Auto-timing**: Yes - estimate timing from word count (~150 wpm) + add pauses between speakers
2. **Voice selection**: Auto-assign voices during generation based on character descriptions
3. **Overlap handling**: Warn in validators, auto-adjust in assembly if needed

## Auto-Timing Algorithm

```javascript
function calculateDialogueTiming(dialogueLines) {
  const WPM = 150;
  const PAUSE_BETWEEN_SPEAKERS = 0.5; // seconds

  let currentTime = 0;
  return dialogueLines.map((line, i) => {
    const wordCount = line.text.split(/\s+/).length;
    const duration = (wordCount / WPM) * 60;
    const timing = currentTime;
    currentTime += duration + PAUSE_BETWEEN_SPEAKERS;
    return { ...line, timing };
  });
}
```

## Voice Auto-Assignment

During project generation, add to Claude prompt:
1. Analyze character descriptions (age, gender, personality)
2. Query available ElevenLabs voices
3. Match characteristics: male/female, young/old, tone
4. Assign narrator voice for non-character VO
