# Plan: Extend /api/assemble with Inline VO Generation

## Goal
Allow audioLayers to accept `text` + `voice_id` instead of `path`, auto-generating VO audio before assembly.

## File to Modify
- `server.js` - `/api/assemble` endpoint (around line 2095)

## Changes

### 1. Update comment documentation (lines 2067-2071)
```javascript
// audioLayers (optional): array of { type, path?, text?, voice_id?, volume, startTime }
//   - type: "music", "vo", "sfx", "ambient"
//   - path: path to existing audio file
//   - OR text + voice_id: generate VO on the fly (voice_id required with text)
//   - volume: 0.0-1.0
//   - startTime: seconds from start of assembled video
```

### 2. Add VO generation helper (before the try block or inside it)
Extract the TTS logic into a reusable function, or inline the fetch call.

### 3. Process audioLayers before assembly (after line 2100, before concat)
```javascript
// Process audio layers - generate TTS for any with text instead of path
const processedAudioLayers = [];
for (let i = 0; i < allAudioLayers.length; i++) {
  const layer = allAudioLayers[i];

  if (layer.text && !layer.path) {
    // Generate VO from text
    if (!layer.voice_id) {
      throw new Error(`audioLayer ${i}: voice_id required when using text`);
    }

    const config = loadConfig();
    if (!config.elevenLabsKey) {
      throw new Error('No ElevenLabs API key configured for TTS generation');
    }

    console.log(`Generating TTS for audioLayer ${i}: "${layer.text.substring(0, 50)}..."`);

    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${layer.voice_id}`, {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenLabsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: layer.text,
        model_id: layer.model_id || 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!ttsResponse.ok) {
      const error = await ttsResponse.text();
      throw new Error(`TTS generation failed for audioLayer ${i}: ${error}`);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();

    // Save to temp directory for this assembly
    const ttsFilename = `tts_layer_${i}_${Date.now()}.mp3`;
    const ttsPath = path.join(tempDir, ttsFilename);
    fs.writeFileSync(ttsPath, Buffer.from(audioBuffer));

    processedAudioLayers.push({
      ...layer,
      path: ttsPath,  // Use absolute path since it's in tempDir
      _generatedPath: ttsPath  // Mark as generated for potential cleanup
    });
  } else {
    processedAudioLayers.push(layer);
  }
}
```

### 4. Use processedAudioLayers instead of allAudioLayers
Replace references to `allAudioLayers` with `processedAudioLayers` in the audio mixing section.

## Interface
```json
{
  "shots": [...],
  "audioLayers": [
    { "type": "vo", "path": "/audio/tts/existing.mp3", "volume": 1, "startTime": 0 },
    { "type": "vo", "text": "Generate this on the fly", "voice_id": "abc123", "volume": 1, "startTime": 3 },
    { "type": "vo", "text": "Custom model", "voice_id": "xyz", "model_id": "eleven_multilingual_v2", "volume": 0.9, "startTime": 6 }
  ]
}
```

## Notes
- Generated files go to tempDir (cleaned up with other temp files)
- Optional `model_id` on text layers, defaults to `eleven_turbo_v2_5`
- Validation: `voice_id` required when `text` is present
