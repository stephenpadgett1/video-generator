const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const FormData = require('form-data');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');
const BUFFER = 0.15; // 150ms buffer around speech

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    return {};
  }
}

// Normalize text for comparison: lowercase, remove punctuation, collapse whitespace
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate word overlap (Jaccard similarity)
function calculateMatchScore(expected, actual) {
  const expectedWords = normalize(expected).split(/\s+/).filter(Boolean);
  const actualWords = normalize(actual).split(/\s+/).filter(Boolean);

  if (expectedWords.length === 0 && actualWords.length === 0) {
    return { score: 1, missing: [], extra: [] };
  }
  if (expectedWords.length === 0 || actualWords.length === 0) {
    return { score: 0, missing: expectedWords, extra: actualWords };
  }

  const expectedSet = new Set(expectedWords);
  const actualSet = new Set(actualWords);

  const missing = expectedWords.filter(w => !actualSet.has(w));
  const extra = actualWords.filter(w => !expectedSet.has(w));
  const intersection = expectedWords.filter(w => actualSet.has(w));

  const union = new Set([...expectedWords, ...actualWords]);
  const score = intersection.length / union.size;

  return { score, missing, extra };
}

// Get verdict based on match score
function getVerdict(score) {
  if (score >= 0.8) return 'good';
  if (score >= 0.5) return 'partial';
  return 'failed';
}

// Transcribe video using the transcribe endpoint logic
async function transcribeVideo(videoPath, config) {
  const fullPath = path.isAbsolute(videoPath)
    ? videoPath
    : path.join(__dirname, '..', 'data', 'video', videoPath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Video not found: ${fullPath}`);
  }

  const tempWav = path.join(__dirname, '..', 'data', `temp_analyze_${Date.now()}.wav`);

  try {
    // Extract audio as 16kHz mono WAV
    execSync(`ffmpeg -y -i "${fullPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${tempWav}"`,
      { stdio: 'pipe' });

    // Call Whisper API
    const form = new FormData();
    form.append('file', fs.createReadStream(tempWav), { filename: 'audio.wav' });
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    form.append('timestamp_granularities[]', 'word');

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

    return JSON.parse(response.body);

  } finally {
    if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
  }
}

// POST /api/analyze-dialogue-clip
router.post('/', async (req, res) => {
  const { videoPath, expectedDialogue } = req.body;
  const config = loadConfig();

  if (!config.openaiKey) {
    return res.status(500).json({ error: 'openaiKey not configured in data/config.json' });
  }

  if (!videoPath) {
    return res.status(400).json({ error: 'videoPath is required' });
  }

  if (!expectedDialogue) {
    return res.status(400).json({ error: 'expectedDialogue is required' });
  }

  try {
    const whisperResult = await transcribeVideo(videoPath, config);
    const words = whisperResult.words || [];
    const actualText = whisperResult.text || '';
    const clipDuration = whisperResult.duration || 0;

    // Calculate trim points
    let trim;
    if (words.length === 0) {
      // No speech detected
      trim = {
        start: 0,
        end: null,
        usable_duration: clipDuration,
        no_speech: true
      };
    } else {
      const firstWord = words[0];
      const lastWord = words[words.length - 1];
      const trimStart = Math.max(0, firstWord.start - BUFFER);
      const trimEnd = Math.min(clipDuration, lastWord.end + BUFFER);

      trim = {
        start: Math.round(trimStart * 1000) / 1000,
        end: Math.round(trimEnd * 1000) / 1000,
        usable_duration: Math.round((trimEnd - trimStart) * 1000) / 1000,
        no_speech: false
      };
    }

    // Calculate validation
    const { score, missing, extra } = calculateMatchScore(expectedDialogue, actualText);
    const validation = {
      expected: expectedDialogue,
      actual: actualText,
      match_score: Math.round(score * 100) / 100,
      missing_words: missing,
      extra_words: extra,
      verdict: getVerdict(score)
    };

    res.json({
      trim,
      validation,
      clip_duration: clipDuration,
      words // Include for debugging/fine-grained analysis
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
