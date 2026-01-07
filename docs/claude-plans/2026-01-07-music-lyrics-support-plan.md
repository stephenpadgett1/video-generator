# Plan: Commit Music API + Add Lyrics Support

## Task 1: Commit and Push Music API Changes

Files to commit:
- `routes/music.js` (new file - music generation endpoint)
- `server.js` (added require + app.use for music routes)
- `CLAUDE.md` (documented new endpoint)

## Task 2: Add Lyrics Support to Music Generation

### Copyright Status
"Singin' in the Rain" (1929) entered US public domain on January 1, 2025.
We can use the original Arthur Freed lyrics freely.

### ElevenLabs Lyrics API

Use `composition_plan` instead of simple `prompt` for lyrics:

```json
{
  "composition_plan": {
    "positive_global_styles": ["upbeat jazz", "romantic", "1920s broadway"],
    "negative_global_styles": ["heavy metal", "electronic", "sad"],
    "sections": [
      {
        "section_name": "Verse 1",
        "positive_local_styles": ["joyful", "building"],
        "duration_ms": 15000,
        "lines": [
          "I'm singin' in the rain",
          "Just singin' in the rain",
          "What a glorious feeling",
          "I'm happy again"
        ]
      }
    ]
  }
}
```

### API Enhancement

**Update `routes/music.js`** to support new parameter:

```javascript
// POST /api/generate-music
// Body options:
//   Option A: { prompt, duration_seconds }  - instrumental
//   Option B: { lyrics, style, duration_seconds } - with vocals
//   Option C: { composition_plan } - full control

let { prompt, lyrics, style, duration_seconds, composition_plan, mood } = req.body;

if (lyrics) {
  // Build composition_plan from lyrics + style
  composition_plan = buildCompositionPlan(lyrics, style, duration_seconds);
}

const body = composition_plan
  ? { composition_plan }
  : { prompt, music_length_ms, force_instrumental: true };
```

### Helper Function

```javascript
function buildCompositionPlan(lyrics, style, durationSeconds) {
  const lines = lyrics.split('\n').filter(l => l.trim());
  return {
    positive_global_styles: style?.positive || ["upbeat", "joyful"],
    negative_global_styles: style?.negative || ["sad", "slow"],
    sections: [{
      section_name: "Main",
      positive_local_styles: [],
      duration_ms: durationSeconds * 1000,
      lines: lines.slice(0, 10)  // Max ~10 lines for 25s
    }]
  };
}
```

## Test: Singin' in the Rain with Lyrics

```bash
curl -X POST /api/generate-music -d '{
  "lyrics": "I'\''m singin'\'' in the rain\nJust singin'\'' in the rain\nWhat a glorious feeling\nI'\''m happy again",
  "style": {
    "positive": ["1920s broadway jazz", "romantic", "joyful", "piano"],
    "negative": ["electronic", "heavy", "sad"]
  },
  "duration_seconds": 25
}'
```

## Files to Modify

| File | Changes |
|------|---------|
| `routes/music.js` | Add lyrics/composition_plan support |
| `CLAUDE.md` | Document lyrics parameter |
