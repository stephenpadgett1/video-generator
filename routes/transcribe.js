const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const FormData = require('form-data');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    return {};
  }
}

// POST /api/transcribe
router.post('/', async (req, res) => {
  const { videoPath } = req.body;
  const config = loadConfig();

  if (!config.openaiKey) {
    return res.status(500).json({ error: 'openaiKey not configured in data/config.json' });
  }

  // Resolve path relative to data/video if not absolute
  const fullPath = path.isAbsolute(videoPath)
    ? videoPath
    : path.join(__dirname, '..', 'data', 'video', videoPath);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: `Video not found: ${fullPath}` });
  }

  const tempWav = path.join(__dirname, '..', 'data', `temp_${Date.now()}.wav`);

  try {
    // Extract audio as 16kHz mono WAV
    execSync(`ffmpeg -y -i "${fullPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${tempWav}"`,
      { stdio: 'pipe' });

    // Call Whisper API using form-data's submit (handles multipart correctly)
    const form = new FormData();
    form.append('file', fs.createReadStream(tempWav), { filename: 'audio.wav' });
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');

    const response = await new Promise((resolve, reject) => {
      form.submit({
        host: 'api.openai.com',
        path: '/v1/audio/transcriptions',
        protocol: 'https:',
        headers: {
          'Authorization': `Bearer ${config.openaiKey}`
        }
      }, (err, res) => {
        if (err) return reject(err);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
        res.on('error', reject);
      });
    });

    if (response.status !== 200) {
      throw new Error(`Whisper API error: ${response.status} - ${response.body}`);
    }

    const result = JSON.parse(response.body);

    res.json({
      segments: (result.segments || []).map(s => ({
        start: s.start,
        end: s.end,
        text: s.text.trim()
      })),
      full_text: result.text,
      duration: result.duration
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    // Cleanup temp file
    if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
  }
});

module.exports = router;
