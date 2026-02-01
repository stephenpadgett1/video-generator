# Narrative Model

## Shot Axes

Each shot has three independent axes:

| Axis | Range | Controls |
|------|-------|----------|
| `energy` | 0-1 | Pace, intensity, camera movement speed |
| `tension` | 0-1 | Anticipation, suspense (can be high with low energy) |
| `mood` | string | Emotional color (see vocabulary below) |

**Mood vocabulary:** hopeful, melancholic, tense, peaceful, unsettling, triumphant, intimate, desolate, mysterious, urgent, contemplative, chaotic, bittersweet, whimsical, ominous, serene

**Arc types:** `linear-build`, `tension-release`, `wave`, `flat-punctuate`, `bookend`

## Production Rules

Enforce consistent constraints across all shots:

```json
{
  "production_style": "stage_play"
}
```

Or custom:
```json
{
  "production_rules": {
    "camera": { "perspective": "audience_front_row", "movement": "locked", "framing": "proscenium" },
    "visual": { "lighting": "theatrical_spotlight", "palette": "high_contrast" },
    "continuity": { "location": "single", "time_flow": "real_time" }
  }
}
```

**Presets:**
- `stage_play` - Fixed front-row perspective, locked camera, theatrical lighting, single location
- `documentary` - Observational perspective, minimal movement, natural lighting, film grain
- `music_video` - Dynamic camera, saturated colors, fragmented time flow
- `noir` - Character POV, monochrome palette, noir lighting, elliptical time

## Mood-Aware Audio

Voice modulation and music profiles computed from shot mood/tension/energy:

```javascript
// In assembly audioLayers or direct TTS calls:
{ "type": "vo", "text": "...", "voice_id": "...", "mood": "ominous", "tension": 0.7, "energy": 0.3 }
```

**Voice settings** (ElevenLabs): stability, similarity_boost derived from mood; speed_factor (0.5-2.0) via ffmpeg atempo post-processing.

**Music profiles**: tempo, key, texture, instruments, search tags - computed but not yet connected to music selection/generation.

See `audio-rules.js` for full mappings.

### Music Generation Services

| Use Case | Service | Notes |
|----------|---------|-------|
| Short clips (<60s) | ElevenLabs `generate_music` | Quick, integrated |
| Long-form / audiobook | **Suno** | Discuss with user first |
| Background ambient | Either | ElevenLabs fine for loops |

**Guideline:** For projects requiring extended music (>3 minutes), especially audiobook-style productions, prefer Suno or discuss options with user before generating multiple ElevenLabs tracks.

## Transitions (Assembly)

Tension-aware (priority):
- High → low tension: long crossfade (release)
- Low → high tension: black insert (breath before impact)
- Sustained high: hard cuts

Energy fallback: drop ≥0.4 → black, rise ≥0.4 → hard cut, small change → crossfade
