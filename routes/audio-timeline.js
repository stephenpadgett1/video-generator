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

// Detect silence periods using ffmpeg
function detectSilence(videoPath, noiseDb = -30, minDuration = 0.3) {
  const cmd = `ffmpeg -i "${videoPath}" -af silencedetect=noise=${noiseDb}dB:d=${minDuration} -f null - 2>&1`;
  const output = execSync(cmd, { encoding: 'utf8' });

  const silences = [];
  const lines = output.split('\n');

  let currentStart = null;
  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);

    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
    }
    if (endMatch && currentStart !== null) {
      silences.push({
        start: currentStart,
        end: parseFloat(endMatch[1]),
        duration: parseFloat(endMatch[2])
      });
      currentStart = null;
    }
  }

  return silences;
}

// Get clip duration via ffprobe
function getClipDuration(videoPath) {
  const cmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`;
  const output = execSync(cmd, { encoding: 'utf8' });
  return parseFloat(output.trim());
}

// Transcribe using Whisper
async function transcribeVideo(videoPath, config) {
  const tempWav = path.join(__dirname, '..', 'data', `temp_timeline_${Date.now()}.wav`);

  try {
    execSync(`ffmpeg -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${tempWav}"`,
      { stdio: 'pipe' });

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

// Reconcile Whisper words with silence periods
// Whisper often compresses gaps - use silence data to correct word start times
function reconcileTimeline(words, silences, clipDuration) {
  if (!words || words.length === 0) {
    return [];
  }

  const reconciled = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prevWord = i > 0 ? reconciled[i - 1] : null;

    // Find any silence that occurs between this word's reported start and the previous word's end
    let adjustedStart = word.start;

    if (prevWord) {
      // Look for silence that ends near or after this word's reported start
      for (const silence of silences) {
        // If silence ends after previous word and before/at this word's end
        // then this word probably starts after the silence
        if (silence.start >= prevWord.end - 0.1 && silence.end <= word.end + 0.1) {
          // Word likely starts after this silence
          if (silence.end > adjustedStart) {
            adjustedStart = silence.end;
          }
        }
      }
    }

    reconciled.push({
      word: word.word,
      original_start: word.start,
      original_end: word.end,
      adjusted_start: Math.round(adjustedStart * 1000) / 1000,
      adjusted_end: word.end, // End times are usually more reliable
      confidence: adjustedStart === word.start ? 'high' : 'adjusted'
    });
  }

  return reconciled;
}

// Build speech segments (continuous speech between silences)
function buildSpeechSegments(words, silences, clipDuration) {
  const segments = [];

  if (!words || words.length === 0) {
    return segments;
  }

  // Sort silences by start time
  const sortedSilences = [...silences].sort((a, b) => a.start - b.start);

  // Build segments between silences
  let segmentStart = 0;
  let segmentWords = [];

  for (const word of words) {
    // Check if there's a significant silence before this word
    const silenceBefore = sortedSilences.find(s =>
      s.end <= word.end && s.end > (segmentWords.length > 0 ? segmentWords[segmentWords.length - 1].end : 0)
    );

    if (silenceBefore && silenceBefore.duration > 0.3 && segmentWords.length > 0) {
      // End current segment, start new one
      segments.push({
        start: segmentStart,
        end: silenceBefore.start,
        words: segmentWords.map(w => w.word).join(' '),
        word_count: segmentWords.length
      });
      segmentStart = silenceBefore.end;
      segmentWords = [];
    }

    segmentWords.push(word);
  }

  // Final segment
  if (segmentWords.length > 0) {
    segments.push({
      start: segmentStart,
      end: segmentWords[segmentWords.length - 1].end,
      words: segmentWords.map(w => w.word).join(' '),
      word_count: segmentWords.length
    });
  }

  return segments;
}

// POST /api/audio-timeline
router.post('/', async (req, res) => {
  const { videoPath, noiseDb = -30, minSilenceDuration = 0.3 } = req.body;
  const config = loadConfig();

  if (!config.openaiKey) {
    return res.status(500).json({ error: 'openaiKey not configured' });
  }

  if (!videoPath) {
    return res.status(400).json({ error: 'videoPath is required' });
  }

  const fullPath = path.isAbsolute(videoPath)
    ? videoPath
    : path.join(__dirname, '..', 'data', 'video', videoPath);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: `Video not found: ${fullPath}` });
  }

  try {
    // Get all the data
    const [whisperResult, silences, clipDuration] = await Promise.all([
      transcribeVideo(fullPath, config),
      Promise.resolve(detectSilence(fullPath, noiseDb, minSilenceDuration)),
      Promise.resolve(getClipDuration(fullPath))
    ]);

    const words = whisperResult.words || [];

    // Reconcile and build segments
    const reconciledWords = reconcileTimeline(words, silences, clipDuration);
    const speechSegments = buildSpeechSegments(words, silences, clipDuration);

    res.json({
      clip_duration: clipDuration,

      // Raw Whisper output
      whisper: {
        text: whisperResult.text,
        words: words
      },

      // Raw silence detection
      silences: silences,

      // Reconciled timeline
      reconciled: {
        words: reconciledWords,
        speech_segments: speechSegments
      },

      // Summary
      summary: {
        total_words: words.length,
        total_silences: silences.length,
        longest_silence: silences.length > 0 ? Math.max(...silences.map(s => s.duration)) : 0,
        adjustments_made: reconciledWords.filter(w => w.confidence === 'adjusted').length
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
