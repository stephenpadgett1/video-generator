// routes/music.js
// Music generation using ElevenLabs Eleven Music API

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { computeMusicProfile } = require('../audio-rules');

function loadConfig() {
  const configPath = path.join(__dirname, '..', 'data', 'config.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return {};
}

// POST /api/generate-music
// Generate music using ElevenLabs Eleven Music API
// Body: { prompt?, duration_seconds?, mood?, tension?, energy? }
router.post('/generate-music', async (req, res) => {
  const config = loadConfig();
  if (!config.elevenLabsKey) {
    return res.status(400).json({ error: 'No ElevenLabs API key configured' });
  }

  let { prompt, duration_seconds = 25, mood, tension, energy } = req.body;

  // Build prompt from mood/tension/energy if not provided directly
  if (!prompt && mood) {
    const profile = computeMusicProfile({ mood, tension: tension ?? 0.5, energy: energy ?? 0.5 });
    prompt = `${profile.dynamics} ${profile.texture} ${mood} instrumental music. ` +
      `${profile.tempo} tempo in ${profile.key} key. ` +
      `Instruments: ${profile.instruments}. ` +
      `Style: ${profile.search_tags.join(', ')}. No vocals.`;
  }

  if (!prompt) {
    return res.status(400).json({ error: 'prompt or mood is required' });
  }

  // Clamp duration to ElevenLabs limits (3-600 seconds)
  const clampedDuration = Math.max(3, Math.min(600, duration_seconds));

  console.log(`Generating music: ${clampedDuration}s, prompt: "${prompt.substring(0, 100)}..."`);

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/music', {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenLabsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        music_length_ms: clampedDuration * 1000,
        force_instrumental: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs Music API error:', response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const audioBuffer = await response.arrayBuffer();

    // Save to music directory
    const musicDir = path.join(__dirname, '..', 'data', 'audio', 'music');
    if (!fs.existsSync(musicDir)) {
      fs.mkdirSync(musicDir, { recursive: true });
    }

    const filename = `music_${Date.now()}.mp3`;
    const filepath = path.join(musicDir, filename);
    fs.writeFileSync(filepath, Buffer.from(audioBuffer));

    // Get actual duration via ffprobe
    let actualDuration = clampedDuration;
    try {
      const probeOutput = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filepath}"`,
        { encoding: 'utf-8' }
      ).trim();
      actualDuration = parseFloat(probeOutput) || clampedDuration;
    } catch (e) {
      console.error('ffprobe duration check failed:', e.message);
    }

    console.log(`Music generated: ${filename}, duration: ${actualDuration}s`);

    res.json({
      success: true,
      path: `/audio/music/${filename}`,
      filename,
      duration: actualDuration,
      prompt_used: prompt
    });
  } catch (err) {
    console.error('Music generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
