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

// Build composition_plan from lyrics and style
function buildCompositionPlan(lyrics, style, durationSeconds) {
  const lines = lyrics.split('\n').filter(l => l.trim()).map(l => l.trim());
  return {
    positive_global_styles: style?.positive || ['upbeat', 'joyful', 'melodic'],
    negative_global_styles: style?.negative || ['sad', 'slow', 'heavy metal'],
    sections: [{
      section_name: 'Main',
      positive_local_styles: style?.local_positive || [],
      negative_local_styles: style?.local_negative || [],
      duration_ms: Math.max(3000, Math.min(120000, durationSeconds * 1000)),
      lines: lines.slice(0, 20) // Max 20 lines per section
    }]
  };
}

// POST /api/generate-music
// Generate music using ElevenLabs Eleven Music API
// Body options:
//   Option A: { prompt, duration_seconds } - instrumental from text prompt
//   Option B: { lyrics, style?, duration_seconds } - song with vocals
//   Option C: { composition_plan } - full control over structure
//   Option D: { mood, tension?, energy?, duration_seconds } - auto-built instrumental
router.post('/generate-music', async (req, res) => {
  const config = loadConfig();
  if (!config.elevenLabsKey) {
    return res.status(400).json({ error: 'No ElevenLabs API key configured' });
  }

  let { prompt, lyrics, style, duration_seconds = 25, composition_plan, mood, tension, energy } = req.body;

  // Clamp duration to ElevenLabs limits (3-600 seconds)
  const clampedDuration = Math.max(3, Math.min(600, duration_seconds));

  let requestBody;
  let logMessage;

  // Option C: Full composition_plan provided
  if (composition_plan) {
    requestBody = { composition_plan };
    logMessage = `composition_plan with ${composition_plan.sections?.length || 0} sections`;
  }
  // Option B: Lyrics provided - build composition_plan with vocals
  else if (lyrics) {
    const plan = buildCompositionPlan(lyrics, style, clampedDuration);
    requestBody = { composition_plan: plan };
    logMessage = `lyrics (${plan.sections[0].lines.length} lines)`;
  }
  // Option A: Simple prompt - instrumental
  else if (prompt) {
    requestBody = {
      prompt,
      music_length_ms: clampedDuration * 1000,
      force_instrumental: true
    };
    logMessage = `prompt: "${prompt.substring(0, 80)}..."`;
  }
  // Option D: Build from mood/tension/energy - instrumental
  else if (mood) {
    const profile = computeMusicProfile({ mood, tension: tension ?? 0.5, energy: energy ?? 0.5 });
    prompt = `${profile.dynamics} ${profile.texture} ${mood} instrumental music. ` +
      `${profile.tempo} tempo in ${profile.key} key. ` +
      `Instruments: ${profile.instruments}. ` +
      `Style: ${profile.search_tags.join(', ')}. No vocals.`;
    requestBody = {
      prompt,
      music_length_ms: clampedDuration * 1000,
      force_instrumental: true
    };
    logMessage = `mood: ${mood}`;
  }
  else {
    return res.status(400).json({ error: 'One of prompt, lyrics, composition_plan, or mood is required' });
  }

  console.log(`Generating music: ${clampedDuration}s, ${logMessage}`);

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/music', {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenLabsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
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
      has_vocals: !!lyrics || !!composition_plan,
      request_type: composition_plan ? 'composition_plan' : lyrics ? 'lyrics' : prompt ? 'prompt' : 'mood',
      prompt_used: prompt || null,
      lyrics_used: lyrics || null
    });
  } catch (err) {
    console.error('Music generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
