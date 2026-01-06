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

// Get clip duration via ffprobe
function getClipDuration(videoPath) {
  const cmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`;
  const output = execSync(cmd, { encoding: 'utf8' });
  return parseFloat(output.trim());
}

// ============================================
// SCENE DETECTION (Visual)
// ============================================

/**
 * Detect scene changes using ffmpeg's select filter
 * Returns timestamps where visual composition changes significantly
 */
function detectSceneChanges(videoPath, threshold = 0.4) {
  // FFmpeg scene detection - outputs info for frames where scene score exceeds threshold
  const cmd = `ffmpeg -i "${videoPath}" -filter:v "select='gt(scene,${threshold})',showinfo" -f null - 2>&1`;

  try {
    const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const changes = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // Parse showinfo output: [Parsed_showinfo_1 @ ...] n:X pts:Y pts_time:Z ...
      const ptsMatch = line.match(/pts_time:([\d.]+)/);

      if (ptsMatch) {
        const timestamp = parseFloat(ptsMatch[1]);
        changes.push({
          timestamp: Math.round(timestamp * 1000) / 1000,
          confidence: threshold // We know it exceeded this threshold
        });
      }
    }

    return changes;
  } catch (err) {
    // Scene detection failing shouldn't break the whole analysis
    console.error('Scene detection error:', err.message);
    return [];
  }
}

/**
 * Convert scene changes to continuous visual segments
 */
function buildVisualSegments(changes, clipDuration) {
  const segments = [];
  let prevEnd = 0;

  for (const change of changes) {
    if (change.timestamp > prevEnd) {
      segments.push({
        start: prevEnd,
        end: change.timestamp,
        duration: Math.round((change.timestamp - prevEnd) * 1000) / 1000
      });
    }
    prevEnd = change.timestamp;
  }

  // Final segment to end of clip
  if (prevEnd < clipDuration) {
    segments.push({
      start: prevEnd,
      end: clipDuration,
      duration: Math.round((clipDuration - prevEnd) * 1000) / 1000
    });
  }

  return segments;
}

// ============================================
// AUDIO ANALYSIS (reusing audio-timeline logic)
// ============================================

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

async function transcribeVideo(videoPath, config) {
  const tempWav = path.join(__dirname, '..', 'data', `temp_unified_${Date.now()}.wav`);

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

function buildSpeechSegments(words, silences, clipDuration) {
  const segments = [];

  if (!words || words.length === 0) {
    return segments;
  }

  const sortedSilences = [...silences].sort((a, b) => a.start - b.start);
  let segmentStart = words[0].start;
  let segmentWords = [];

  for (const word of words) {
    const silenceBefore = sortedSilences.find(s =>
      s.end <= word.end && s.end > (segmentWords.length > 0 ? segmentWords[segmentWords.length - 1].end : 0)
    );

    if (silenceBefore && silenceBefore.duration > 0.3 && segmentWords.length > 0) {
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

// ============================================
// RECONCILIATION (Correlate audio + visual)
// ============================================

const CORRELATION_WINDOW = 0.15; // 150ms tolerance for event alignment

/**
 * Build unified timeline of all events sorted by timestamp
 */
function buildEventTimeline(sceneChanges, speechSegments, silences) {
  const events = [];

  for (const scene of sceneChanges) {
    events.push({
      timestamp: scene.timestamp,
      type: 'scene_change',
      source: 'visual',
      data: scene
    });
  }

  for (const seg of speechSegments) {
    events.push({
      timestamp: seg.start,
      type: 'speech_start',
      source: 'audio',
      data: seg
    });
    events.push({
      timestamp: seg.end,
      type: 'speech_end',
      source: 'audio',
      data: seg
    });
  }

  for (const silence of silences) {
    events.push({
      timestamp: silence.start,
      type: 'silence_start',
      source: 'audio',
      data: silence
    });
    events.push({
      timestamp: silence.end,
      type: 'silence_end',
      source: 'audio',
      data: silence
    });
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Detect correlations between audio and visual events
 */
function detectCorrelations(sceneChanges, speechSegments, silences) {
  const correlations = [];

  for (const scene of sceneChanges) {
    // Check if scene change aligns with silence
    const nearSilence = silences.find(s =>
      Math.abs(s.start - scene.timestamp) < CORRELATION_WINDOW ||
      Math.abs(s.end - scene.timestamp) < CORRELATION_WINDOW
    );

    if (nearSilence) {
      correlations.push({
        type: 'scene_change_at_silence',
        timestamp: scene.timestamp,
        confidence: 0.9,
        description: `Scene change at ${scene.timestamp.toFixed(2)}s aligns with silence`
      });
    }

    // Check if scene change aligns with speech segment boundary
    const atSpeechBoundary = speechSegments.find(seg =>
      Math.abs(seg.start - scene.timestamp) < CORRELATION_WINDOW ||
      Math.abs(seg.end - scene.timestamp) < CORRELATION_WINDOW
    );

    if (atSpeechBoundary && !nearSilence) {
      correlations.push({
        type: 'scene_matches_speech_boundary',
        timestamp: scene.timestamp,
        confidence: 0.8,
        description: `Scene change at ${scene.timestamp.toFixed(2)}s near speech boundary`
      });
    }
  }

  return correlations;
}

/**
 * Detect anomalies (unexpected patterns)
 */
function detectAnomalies(sceneChanges, speechSegments, silences, clipDuration, context) {
  const anomalies = [];

  // Check for scene change mid-speech
  for (const scene of sceneChanges) {
    const duringSpeech = speechSegments.find(seg =>
      scene.timestamp > seg.start + CORRELATION_WINDOW &&
      scene.timestamp < seg.end - CORRELATION_WINDOW
    );

    if (duringSpeech) {
      anomalies.push({
        type: 'scene_change_mid_word',
        timestamp: scene.timestamp,
        severity: 'warning',
        description: `Visual discontinuity during speech at ${scene.timestamp.toFixed(2)}s`
      });
    }
  }

  // Check for entrance movement (scene change + speech in first 0.5s)
  if (sceneChanges.length > 0 && sceneChanges[0].timestamp < 0.5) {
    const speechStart = speechSegments.length > 0 ? speechSegments[0].start : null;
    if (speechStart !== null && speechStart < 1.0) {
      anomalies.push({
        type: 'entrance_with_speech',
        timestamp: 0,
        severity: 'warning',
        description: `Speech begins at ${speechStart.toFixed(2)}s while scene still establishing (change at ${sceneChanges[0].timestamp.toFixed(2)}s)`
      });
    }
  }

  // Check for dead time at end
  const lastSpeech = speechSegments.length > 0 ? speechSegments[speechSegments.length - 1] : null;
  if (lastSpeech && clipDuration - lastSpeech.end > 0.5) {
    const postSpeechScenes = sceneChanges.filter(s => s.timestamp > lastSpeech.end);
    if (postSpeechScenes.length === 0) {
      anomalies.push({
        type: 'dead_time_detected',
        timestamp: lastSpeech.end,
        severity: 'info',
        description: `${(clipDuration - lastSpeech.end).toFixed(2)}s of dead time after speech ends`
      });
    }
  }

  // Check for visual glitch (rapid scene changes)
  for (let i = 0; i < sceneChanges.length - 2; i++) {
    const window = sceneChanges[i + 2].timestamp - sceneChanges[i].timestamp;
    if (window < 0.5) {
      anomalies.push({
        type: 'visual_glitch',
        timestamp: sceneChanges[i].timestamp,
        severity: 'warning',
        description: `Rapid scene changes detected (3 changes in ${window.toFixed(2)}s)`
      });
      break; // Only report once
    }
  }

  // Check dialogue match if context provided
  if (context && context.dialogue && speechSegments.length > 0) {
    const expectedText = context.dialogue.map(d => d.text).join(' ').toLowerCase();
    const actualText = speechSegments.map(s => s.words).join(' ').toLowerCase();

    // Simple word overlap check
    const expectedWords = expectedText.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w);
    const actualWords = actualText.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w);

    const intersection = expectedWords.filter(w => actualWords.includes(w));
    const matchScore = expectedWords.length > 0 ? intersection.length / expectedWords.length : 1;

    if (matchScore < 0.5) {
      anomalies.push({
        type: 'dialogue_mismatch',
        timestamp: 0,
        severity: 'warning',
        description: `Dialogue match score: ${(matchScore * 100).toFixed(0)}% - expected words may be missing`
      });
    }
  }

  return anomalies;
}

/**
 * Generate edit suggestions based on analysis
 */
function generateEditSuggestions(sceneChanges, speechSegments, silences, anomalies, clipDuration) {
  const suggestions = [];

  // Calculate optimal trim points
  let trimStart = 0;
  let trimEnd = null;
  const reasons = [];
  const basedOn = [];

  // Find where meaningful content starts
  const firstSpeech = speechSegments.length > 0 ? speechSegments[0] : null;

  if (firstSpeech && firstSpeech.start > 0.3) {
    // Look for scene change to cut at
    const cutPoint = sceneChanges.find(s =>
      s.timestamp < firstSpeech.start &&
      s.timestamp > 0.1
    );

    if (cutPoint) {
      trimStart = cutPoint.timestamp;
      reasons.push(`Scene change at ${trimStart.toFixed(2)}s before speech`);
      basedOn.push('visual', 'audio');
    } else {
      trimStart = Math.max(0, firstSpeech.start - CORRELATION_WINDOW);
      reasons.push(`Speech starts at ${firstSpeech.start.toFixed(2)}s`);
      basedOn.push('audio');
    }
  }

  // Find where meaningful content ends
  const lastSpeech = speechSegments.length > 0 ? speechSegments[speechSegments.length - 1] : null;

  if (lastSpeech && clipDuration - lastSpeech.end > 0.5) {
    // Look for scene change after speech as cut point
    const postSpeechCut = sceneChanges.find(s =>
      s.timestamp > lastSpeech.end &&
      s.timestamp < clipDuration - 0.1
    );

    if (postSpeechCut) {
      trimEnd = postSpeechCut.timestamp;
      reasons.push(`Scene change at ${trimEnd.toFixed(2)}s after speech`);
      if (!basedOn.includes('visual')) basedOn.push('visual');
    } else {
      trimEnd = lastSpeech.end + CORRELATION_WINDOW;
      reasons.push(`Speech ends at ${lastSpeech.end.toFixed(2)}s`);
    }
  }

  // Generate trim suggestion if needed
  if (trimStart > 0.1 || (trimEnd !== null && trimEnd < clipDuration - 0.1)) {
    suggestions.push({
      type: 'trim',
      parameters: {
        trim_start: Math.round(trimStart * 100) / 100,
        trim_end: trimEnd ? Math.round(trimEnd * 100) / 100 : null
      },
      reasoning: reasons.join('; '),
      confidence: reasons.length > 1 ? 0.9 : 0.7,
      based_on: basedOn
    });
  }

  // Check for split opportunities
  const longSilences = silences.filter(s => s.duration > 1.0);
  if (longSilences.length > 0) {
    const splitPoints = longSilences.map(s => {
      // Prefer scene change near silence for cleaner split
      const nearScene = sceneChanges.find(sc =>
        Math.abs(sc.timestamp - s.start) < 0.3 ||
        Math.abs(sc.timestamp - s.end) < 0.3
      );
      return nearScene ? nearScene.timestamp : (s.start + s.end) / 2;
    });

    suggestions.push({
      type: 'split',
      parameters: { split_at: splitPoints },
      reasoning: `${longSilences.length} long silence(s) suggest natural split points`,
      confidence: 0.6,
      based_on: ['audio']
    });
  }

  return suggestions;
}

/**
 * Calculate quality score (0-1)
 */
function calculateQualityScore(anomalies, correlations, speechSegments, clipDuration) {
  let score = 1.0;

  // Deduct for anomalies
  for (const a of anomalies) {
    if (a.severity === 'error') score -= 0.3;
    else if (a.severity === 'warning') score -= 0.1;
    else score -= 0.02;
  }

  // Bonus for good correlations
  score += correlations.length * 0.05;

  // Bonus for good speech coverage
  const speechDuration = speechSegments.reduce((sum, s) => sum + (s.end - s.start), 0);
  const coverage = clipDuration > 0 ? speechDuration / clipDuration : 0;
  if (coverage > 0.3 && coverage < 0.9) score += 0.1;

  return Math.max(0, Math.min(1, score));
}

// ============================================
// MAIN ENDPOINT
// ============================================

/**
 * POST /api/analyze-clip-unified
 *
 * Combines scene detection, audio analysis, and context matching
 * into a unified analysis with reconciled events and edit suggestions.
 */
router.post('/', async (req, res) => {
  const {
    videoPath,
    context = {},
    options = {}
  } = req.body;

  const {
    sceneThreshold = 0.4,
    noiseDb = -30,
    minSilenceDuration = 0.3,
    skipTranscription = false
  } = options;

  const config = loadConfig();

  if (!skipTranscription && !config.openaiKey) {
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
    // Run all detection in parallel where possible
    const clipDuration = getClipDuration(fullPath);
    const sceneChanges = detectSceneChanges(fullPath, sceneThreshold);
    const silences = detectSilence(fullPath, noiseDb, minSilenceDuration);

    let whisperResult = { text: '', words: [] };
    let speechSegments = [];

    if (!skipTranscription) {
      whisperResult = await transcribeVideo(fullPath, config);
      const words = whisperResult.words || [];
      speechSegments = buildSpeechSegments(words, silences, clipDuration);
    }

    // Build unified analysis
    const events = buildEventTimeline(sceneChanges, speechSegments, silences);
    const correlations = detectCorrelations(sceneChanges, speechSegments, silences);
    const anomalies = detectAnomalies(sceneChanges, speechSegments, silences, clipDuration, context);
    const editSuggestions = generateEditSuggestions(sceneChanges, speechSegments, silences, anomalies, clipDuration);
    const qualityScore = calculateQualityScore(anomalies, correlations, speechSegments, clipDuration);

    // Determine recommended action
    let recommendedAction = 'use_as_is';
    const hasErrors = anomalies.some(a => a.severity === 'error');
    const hasWarnings = anomalies.some(a => a.severity === 'warning');
    const hasTrimSuggestion = editSuggestions.some(s => s.type === 'trim');

    if (hasErrors || qualityScore < 0.5) {
      recommendedAction = 'regenerate';
    } else if (hasTrimSuggestion) {
      recommendedAction = 'trim';
    } else if (hasWarnings) {
      recommendedAction = 'review';
    }

    // Build trim recommendation from suggestions
    const trimSuggestion = editSuggestions.find(s => s.type === 'trim');
    const trimRecommendation = trimSuggestion ? {
      trim_start: trimSuggestion.parameters.trim_start,
      trim_end: trimSuggestion.parameters.trim_end,
      usable_duration: (trimSuggestion.parameters.trim_end || clipDuration) - trimSuggestion.parameters.trim_start,
      based_on: trimSuggestion.based_on
    } : null;

    // Build visual segments
    const visualSegments = buildVisualSegments(sceneChanges, clipDuration);

    res.json({
      clip_duration: clipDuration,

      scenes: {
        changes: sceneChanges,
        segments: visualSegments,
        summary: {
          total_changes: sceneChanges.length,
          avg_segment_duration: visualSegments.length > 0
            ? visualSegments.reduce((s, seg) => s + seg.duration, 0) / visualSegments.length
            : clipDuration,
          has_abrupt_start: sceneChanges.length > 0 && sceneChanges[0].timestamp < 0.3,
          has_abrupt_end: sceneChanges.length > 0 && sceneChanges[sceneChanges.length - 1].timestamp > clipDuration - 0.3
        }
      },

      audio: {
        whisper: {
          text: whisperResult.text,
          words: whisperResult.words || []
        },
        silences: silences,
        speech_segments: speechSegments,
        summary: {
          total_words: (whisperResult.words || []).length,
          total_silences: silences.length,
          longest_silence: silences.length > 0 ? Math.max(...silences.map(s => s.duration)) : 0,
          speech_coverage: speechSegments.reduce((sum, s) => sum + (s.end - s.start), 0) / clipDuration
        }
      },

      context_match: {
        dialogue_provided: !!(context && context.dialogue),
        duration_match: context && context.duration_target ? {
          target: context.duration_target,
          actual: clipDuration,
          difference: clipDuration - context.duration_target,
          within_tolerance: Math.abs(clipDuration - context.duration_target) < 0.5
        } : null
      },

      reconciled: {
        events: events,
        correlations: correlations,
        anomalies: anomalies,
        edit_suggestions: editSuggestions
      },

      summary: {
        quality_score: Math.round(qualityScore * 100) / 100,
        issues_count: anomalies.length,
        recommended_action: recommendedAction,
        trim_recommendation: trimRecommendation
      }
    });

  } catch (err) {
    console.error('Unified analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
