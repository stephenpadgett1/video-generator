import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { loadConfig } from "../utils/config.js";
import { resolvePath, VIDEO_DIR, DATA_DIR } from "../utils/paths.js";

const execAsync = promisify(exec);

export interface TranscriptionWord {
  start: number;
  end: number;
  word: string;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  words: TranscriptionWord[];
  full_text: string;
  duration: number;
}

export interface SilenceRegion {
  start: number;
  end: number;
  duration: number;
}

export interface AudioTimelineResult {
  clip_duration: number;
  whisper: {
    text: string;
    words: TranscriptionWord[];
  };
  silences: SilenceRegion[];
  reconciled: {
    words: Array<TranscriptionWord & { adjusted_start: number; adjusted_end: number; confidence: string }>;
    speech_segments: Array<{ start: number; end: number; words: string; word_count: number }>;
  };
  summary: {
    total_words: number;
    total_silences: number;
    longest_silence: number;
    adjustments_made: number;
  };
}

export interface DialogueAnalysisResult {
  trim: {
    start: number;
    end: number | null;
    usable_duration: number;
    no_speech: boolean;
  };
  validation: {
    expected: string;
    actual: string;
    match_score: number;
    missing_words: string[];
    extra_words: string[];
    verdict: "good" | "partial" | "failed";
  };
  clip_duration: number;
  words: TranscriptionWord[];
}

export interface UnifiedAnalysisResult {
  clip_duration: number;
  scenes: {
    changes: Array<{ timestamp: number; confidence: number }>;
    segments: Array<{ start: number; end: number; duration: number }>;
    summary: { total_changes: number; avg_segment_duration: number; has_abrupt_start: boolean; has_abrupt_end: boolean };
  };
  visual_detection: {
    black_frames: SilenceRegion[];
    freeze_frames: SilenceRegion[];
    summary: { has_black_frames: boolean; has_freeze_frames: boolean; total_black_duration: number; total_freeze_duration: number };
  };
  audio: {
    whisper?: { text: string; words: TranscriptionWord[] };
    silences: SilenceRegion[];
    speech_segments: Array<{ start: number; end: number; words: string; word_count: number }>;
    summary: { total_words: number; total_silences: number; longest_silence: number; speech_coverage: number };
  };
  reconciled: {
    correlations: Array<{ type: string; timestamp: number; confidence: number; description: string }>;
    anomalies: Array<{ type: string; timestamp: number; severity: string; description: string }>;
    edit_suggestions: Array<{ type: string; parameters: Record<string, unknown>; reasoning: string; confidence: number }>;
  };
  summary: {
    quality_score: number;
    issues_count: number;
    recommended_action: "use_as_is" | "trim" | "review" | "regenerate";
    trim_recommendation?: { trim_start: number; trim_end: number | null; usable_duration: number; based_on: string[] };
  };
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
  );
  return parseFloat(stdout.trim());
}

/**
 * Extract audio from video to WAV for transcription
 */
async function extractAudio(videoPath: string): Promise<string> {
  const tempDir = path.join(DATA_DIR, "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const timestamp = Date.now();
  const wavPath = path.join(tempDir, `audio_${timestamp}.wav`);

  await execAsync(
    `ffmpeg -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${wavPath}"`
  );

  return wavPath;
}

/**
 * Transcribe audio using OpenAI Whisper API
 */
export async function transcribe(videoPath: string): Promise<TranscriptionResult> {
  const config = loadConfig();
  const openaiKey = config.openaiKey as string;

  if (!openaiKey) {
    throw new Error("openaiKey not configured in data/config.json");
  }

  const resolvedPath = resolvePath(videoPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  // Get duration
  const duration = await getVideoDuration(resolvedPath);

  // Extract audio
  const wavPath = await extractAudio(resolvedPath);

  try {
    // Call Whisper API
    const formData = new FormData();
    const audioData = fs.readFileSync(wavPath);
    const audioBlob = new Blob([audioData], { type: "audio/wav" });
    formData.append("file", audioBlob, "audio.wav");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");
    formData.append("timestamp_granularities[]", "segment");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      text: string;
      segments?: Array<{ start: number; end: number; text: string }>;
      words?: Array<{ start: number; end: number; word: string }>;
    };

    return {
      segments: data.segments || [],
      words: data.words || [],
      full_text: data.text,
      duration,
    };
  } finally {
    // Clean up temp file
    if (fs.existsSync(wavPath)) {
      fs.unlinkSync(wavPath);
    }
  }
}

/**
 * Detect silence regions using ffmpeg silencedetect
 */
async function detectSilences(
  videoPath: string,
  noiseDb = -30,
  minDuration = 0.3
): Promise<SilenceRegion[]> {
  const { stderr } = await execAsync(
    `ffmpeg -i "${videoPath}" -af silencedetect=n=${noiseDb}dB:d=${minDuration} -f null - 2>&1`
  );

  const silences: SilenceRegion[] = [];
  const lines = stderr.split("\n");

  let currentStart: number | null = null;

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);

    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
    } else if (endMatch && currentStart !== null) {
      silences.push({
        start: currentStart,
        end: parseFloat(endMatch[1]),
        duration: parseFloat(endMatch[2]),
      });
      currentStart = null;
    }
  }

  return silences;
}

/**
 * Detect scene changes using ffmpeg
 */
async function detectSceneChanges(
  videoPath: string,
  threshold = 0.4
): Promise<Array<{ timestamp: number; confidence: number }>> {
  const { stdout } = await execAsync(
    `ffmpeg -i "${videoPath}" -vf "select='gt(scene,${threshold})',showinfo" -f null - 2>&1 | grep showinfo`
  );

  const changes: Array<{ timestamp: number; confidence: number }> = [];
  const lines = stdout.split("\n");

  for (const line of lines) {
    const ptsMatch = line.match(/pts_time:([\d.]+)/);
    if (ptsMatch) {
      changes.push({
        timestamp: parseFloat(ptsMatch[1]),
        confidence: threshold,
      });
    }
  }

  return changes;
}

/**
 * Detect black frames using ffmpeg blackdetect
 */
async function detectBlackFrames(
  videoPath: string,
  threshold = 0.98,
  minDuration = 0.1
): Promise<SilenceRegion[]> {
  try {
    const { stderr } = await execAsync(
      `ffmpeg -i "${videoPath}" -vf "blackdetect=d=${minDuration}:pix_th=${threshold}" -an -f null - 2>&1`
    );

    const blackFrames: SilenceRegion[] = [];
    const lines = stderr.split("\n");

    for (const line of lines) {
      const match = line.match(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/);
      if (match) {
        blackFrames.push({
          start: parseFloat(match[1]),
          end: parseFloat(match[2]),
          duration: parseFloat(match[3]),
        });
      }
    }

    return blackFrames;
  } catch {
    return [];
  }
}

/**
 * Detect freeze frames using ffmpeg freezedetect
 */
async function detectFreezeFrames(
  videoPath: string,
  noise = 0.001,
  minDuration = 0.5
): Promise<SilenceRegion[]> {
  try {
    const { stderr } = await execAsync(
      `ffmpeg -i "${videoPath}" -vf "freezedetect=n=${noise}:d=${minDuration}" -an -f null - 2>&1`
    );

    const freezeFrames: SilenceRegion[] = [];
    const lines = stderr.split("\n");

    let currentStart: number | null = null;

    for (const line of lines) {
      const startMatch = line.match(/freeze_start:\s*([\d.]+)/);
      const endMatch = line.match(/freeze_end:\s*([\d.]+)/);

      if (startMatch) {
        currentStart = parseFloat(startMatch[1]);
      } else if (endMatch && currentStart !== null) {
        const end = parseFloat(endMatch[1]);
        freezeFrames.push({
          start: currentStart,
          end,
          duration: end - currentStart,
        });
        currentStart = null;
      }
    }

    return freezeFrames;
  } catch {
    return [];
  }
}

/**
 * Analyze audio timeline with Whisper + silence detection
 */
export async function analyzeAudioTimeline(
  videoPath: string,
  options: { noiseDb?: number; minSilenceDuration?: number } = {}
): Promise<AudioTimelineResult> {
  const { noiseDb = -30, minSilenceDuration = 0.3 } = options;

  const resolvedPath = resolvePath(videoPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const duration = await getVideoDuration(resolvedPath);

  // Run transcription and silence detection in parallel
  const [transcription, silences] = await Promise.all([
    transcribe(videoPath),
    detectSilences(resolvedPath, noiseDb, minSilenceDuration),
  ]);

  // Reconcile word timings with silence data
  const reconciledWords = transcription.words.map((word) => {
    // Check if word overlaps with a silence
    const overlappingSilence = silences.find(
      (s) => word.start >= s.start && word.start < s.end
    );

    if (overlappingSilence) {
      // Adjust word start to after silence
      return {
        ...word,
        adjusted_start: overlappingSilence.end,
        adjusted_end: word.end + (overlappingSilence.end - word.start),
        confidence: "adjusted" as const,
      };
    }

    return {
      ...word,
      adjusted_start: word.start,
      adjusted_end: word.end,
      confidence: "high" as const,
    };
  });

  // Build speech segments (separated by significant silences)
  const speechSegments: Array<{ start: number; end: number; words: string; word_count: number }> = [];
  let currentSegment: { start: number; end: number; words: string[] } | null = null;

  for (const word of reconciledWords) {
    if (!currentSegment) {
      currentSegment = { start: word.adjusted_start, end: word.adjusted_end, words: [word.word] };
    } else {
      const gap = word.adjusted_start - currentSegment.end;
      if (gap > 0.5) {
        // End current segment
        speechSegments.push({
          start: currentSegment.start,
          end: currentSegment.end,
          words: currentSegment.words.join(" "),
          word_count: currentSegment.words.length,
        });
        currentSegment = { start: word.adjusted_start, end: word.adjusted_end, words: [word.word] };
      } else {
        currentSegment.end = word.adjusted_end;
        currentSegment.words.push(word.word);
      }
    }
  }

  if (currentSegment) {
    speechSegments.push({
      start: currentSegment.start,
      end: currentSegment.end,
      words: currentSegment.words.join(" "),
      word_count: currentSegment.words.length,
    });
  }

  const adjustmentsMade = reconciledWords.filter((w) => w.confidence === "adjusted").length;

  return {
    clip_duration: duration,
    whisper: {
      text: transcription.full_text,
      words: transcription.words,
    },
    silences,
    reconciled: {
      words: reconciledWords,
      speech_segments: speechSegments,
    },
    summary: {
      total_words: transcription.words.length,
      total_silences: silences.length,
      longest_silence: silences.length > 0 ? Math.max(...silences.map((s) => s.duration)) : 0,
      adjustments_made: adjustmentsMade,
    },
  };
}

/**
 * Analyze dialogue clip - compare expected vs actual
 */
export async function analyzeDialogueClip(
  videoPath: string,
  expectedDialogue: string
): Promise<DialogueAnalysisResult> {
  const resolvedPath = resolvePath(videoPath);
  const duration = await getVideoDuration(resolvedPath);
  const transcription = await transcribe(videoPath);

  const BUFFER = 0.15;

  // Normalize text for comparison
  const normalize = (text: string) =>
    text.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();

  const expectedWords = new Set(normalize(expectedDialogue).split(" "));
  const actualWords = new Set(normalize(transcription.full_text).split(" "));

  // Jaccard similarity
  const intersection = [...expectedWords].filter((w) => actualWords.has(w)).length;
  const union = new Set([...expectedWords, ...actualWords]).size;
  const matchScore = union > 0 ? Math.round((intersection / union) * 100) / 100 : 0;

  // Missing and extra words
  const missingWords = [...expectedWords].filter((w) => !actualWords.has(w));
  const extraWords = [...actualWords].filter((w) => !expectedWords.has(w));

  // Determine verdict
  let verdict: "good" | "partial" | "failed";
  if (matchScore >= 0.8) verdict = "good";
  else if (matchScore >= 0.5) verdict = "partial";
  else verdict = "failed";

  // Calculate trim points
  const words = transcription.words;
  const noSpeech = words.length === 0;
  const trimStart = noSpeech ? 0 : Math.max(0, words[0].start - BUFFER);
  const trimEnd = noSpeech ? null : Math.min(duration, words[words.length - 1].end + BUFFER);
  const usableDuration = noSpeech ? 0 : (trimEnd || duration) - trimStart;

  return {
    trim: {
      start: trimStart,
      end: trimEnd,
      usable_duration: usableDuration,
      no_speech: noSpeech,
    },
    validation: {
      expected: expectedDialogue,
      actual: transcription.full_text,
      match_score: matchScore,
      missing_words: missingWords,
      extra_words: extraWords,
      verdict,
    },
    clip_duration: duration,
    words,
  };
}

/**
 * Comprehensive unified clip analysis
 */
export async function analyzeClipUnified(
  videoPath: string,
  options: {
    sceneThreshold?: number;
    noiseDb?: number;
    minSilenceDuration?: number;
    skipTranscription?: boolean;
    blackPixThreshold?: number;
    blackMinDuration?: number;
    freezeNoise?: number;
    freezeMinDuration?: number;
    context?: {
      dialogue?: Array<{ speaker: string; text: string }>;
      duration_target?: number;
    };
  } = {}
): Promise<UnifiedAnalysisResult> {
  const {
    sceneThreshold = 0.4,
    noiseDb = -30,
    minSilenceDuration = 0.3,
    skipTranscription = false,
    blackPixThreshold = 0.98,
    blackMinDuration = 0.1,
    freezeNoise = 0.001,
    freezeMinDuration = 0.5,
    context,
  } = options;

  const resolvedPath = resolvePath(videoPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const duration = await getVideoDuration(resolvedPath);

  // Run all detections in parallel
  const [sceneChanges, silences, blackFrames, freezeFrames, transcription] = await Promise.all([
    detectSceneChanges(resolvedPath, sceneThreshold),
    detectSilences(resolvedPath, noiseDb, minSilenceDuration),
    detectBlackFrames(resolvedPath, blackPixThreshold, blackMinDuration),
    detectFreezeFrames(resolvedPath, freezeNoise, freezeMinDuration),
    skipTranscription ? Promise.resolve(null) : transcribe(videoPath).catch(() => null),
  ]);

  // Build scene segments
  const sceneSegments: Array<{ start: number; end: number; duration: number }> = [];
  let segmentStart = 0;
  for (const change of sceneChanges) {
    sceneSegments.push({
      start: segmentStart,
      end: change.timestamp,
      duration: change.timestamp - segmentStart,
    });
    segmentStart = change.timestamp;
  }
  if (segmentStart < duration) {
    sceneSegments.push({ start: segmentStart, end: duration, duration: duration - segmentStart });
  }

  // Build speech segments from transcription
  const speechSegments: Array<{ start: number; end: number; words: string; word_count: number }> = [];
  if (transcription && transcription.words.length > 0) {
    let currentSeg: { start: number; end: number; words: string[] } | null = null;
    for (const word of transcription.words) {
      if (!currentSeg) {
        currentSeg = { start: word.start, end: word.end, words: [word.word] };
      } else if (word.start - currentSeg.end > 0.5) {
        speechSegments.push({
          start: currentSeg.start,
          end: currentSeg.end,
          words: currentSeg.words.join(" "),
          word_count: currentSeg.words.length,
        });
        currentSeg = { start: word.start, end: word.end, words: [word.word] };
      } else {
        currentSeg.end = word.end;
        currentSeg.words.push(word.word);
      }
    }
    if (currentSeg) {
      speechSegments.push({
        start: currentSeg.start,
        end: currentSeg.end,
        words: currentSeg.words.join(" "),
        word_count: currentSeg.words.length,
      });
    }
  }

  // Detect anomalies and correlations
  const anomalies: Array<{ type: string; timestamp: number; severity: string; description: string }> = [];
  const correlations: Array<{ type: string; timestamp: number; confidence: number; description: string }> = [];
  const editSuggestions: Array<{ type: string; parameters: Record<string, unknown>; reasoning: string; confidence: number }> = [];

  // Check for scene change at silence (good correlation)
  for (const scene of sceneChanges) {
    const nearSilence = silences.find(
      (s) => Math.abs(scene.timestamp - s.start) < 0.15 || Math.abs(scene.timestamp - s.end) < 0.15
    );
    if (nearSilence) {
      correlations.push({
        type: "scene_change_at_silence",
        timestamp: scene.timestamp,
        confidence: 0.9,
        description: "Visual cut aligns with audio silence",
      });
    }
  }

  // Check for freeze frames (potential AI artifacts)
  for (const freeze of freezeFrames) {
    if (freeze.duration > 1.0) {
      anomalies.push({
        type: "long_freeze_frame",
        timestamp: freeze.start,
        severity: "warning",
        description: `Frozen frame for ${freeze.duration.toFixed(1)}s`,
      });
      editSuggestions.push({
        type: "trim_out_freeze",
        parameters: { start: freeze.start, end: freeze.end },
        reasoning: "Long freeze frame may be AI artifact",
        confidence: 0.7,
      });
    }
  }

  // Check for black frames at start/end
  for (const black of blackFrames) {
    if (black.start < 0.5) {
      anomalies.push({
        type: "black_frame_at_start",
        timestamp: black.start,
        severity: "info",
        description: "Black frame at clip start (natural cut point)",
      });
    }
    if (black.end > duration - 0.5) {
      anomalies.push({
        type: "black_frame_at_end",
        timestamp: black.start,
        severity: "info",
        description: "Black frame at clip end (natural cut point)",
      });
    }
  }

  // Calculate trim recommendation
  let trimStart = 0;
  let trimEnd: number | null = duration;
  const basedOn: string[] = [];

  // Use black frames as cut points if available
  const startBlack = blackFrames.find((b) => b.start < 0.5);
  if (startBlack) {
    trimStart = startBlack.end;
    basedOn.push("black_frame_at_start");
  } else if (speechSegments.length > 0) {
    trimStart = Math.max(0, speechSegments[0].start - 0.15);
    basedOn.push("speech_start");
  }

  const endBlack = blackFrames.find((b) => b.end > duration - 0.5);
  if (endBlack) {
    trimEnd = endBlack.start;
    basedOn.push("black_frame_at_end");
  } else if (speechSegments.length > 0) {
    trimEnd = Math.min(duration, speechSegments[speechSegments.length - 1].end + 0.15);
    basedOn.push("speech_end");
  }

  // Calculate quality score
  let qualityScore = 1.0;
  for (const anomaly of anomalies) {
    if (anomaly.severity === "error") qualityScore -= 0.3;
    else if (anomaly.severity === "warning") qualityScore -= 0.1;
    else qualityScore -= 0.02;
  }
  qualityScore += correlations.length * 0.05;
  qualityScore = Math.max(0, Math.min(1, qualityScore));

  // Determine recommended action
  let recommendedAction: "use_as_is" | "trim" | "review" | "regenerate";
  const hasErrors = anomalies.some((a) => a.severity === "error");
  const hasWarnings = anomalies.some((a) => a.severity === "warning");

  if (hasErrors || qualityScore < 0.5) recommendedAction = "regenerate";
  else if (basedOn.length > 0) recommendedAction = "trim";
  else if (hasWarnings) recommendedAction = "review";
  else recommendedAction = "use_as_is";

  // Calculate speech coverage
  const totalSpeech = speechSegments.reduce((sum, s) => sum + (s.end - s.start), 0);
  const speechCoverage = duration > 0 ? totalSpeech / duration : 0;

  return {
    clip_duration: duration,
    scenes: {
      changes: sceneChanges,
      segments: sceneSegments,
      summary: {
        total_changes: sceneChanges.length,
        avg_segment_duration: sceneSegments.length > 0 ? duration / sceneSegments.length : duration,
        has_abrupt_start: sceneChanges.some((s) => s.timestamp < 0.5),
        has_abrupt_end: sceneChanges.some((s) => s.timestamp > duration - 0.5),
      },
    },
    visual_detection: {
      black_frames: blackFrames,
      freeze_frames: freezeFrames,
      summary: {
        has_black_frames: blackFrames.length > 0,
        has_freeze_frames: freezeFrames.length > 0,
        total_black_duration: blackFrames.reduce((sum, b) => sum + b.duration, 0),
        total_freeze_duration: freezeFrames.reduce((sum, f) => sum + f.duration, 0),
      },
    },
    audio: {
      whisper: transcription ? { text: transcription.full_text, words: transcription.words } : undefined,
      silences,
      speech_segments: speechSegments,
      summary: {
        total_words: transcription?.words.length || 0,
        total_silences: silences.length,
        longest_silence: silences.length > 0 ? Math.max(...silences.map((s) => s.duration)) : 0,
        speech_coverage: speechCoverage,
      },
    },
    reconciled: {
      correlations,
      anomalies,
      edit_suggestions: editSuggestions,
    },
    summary: {
      quality_score: qualityScore,
      issues_count: anomalies.length,
      recommended_action: recommendedAction,
      trim_recommendation:
        basedOn.length > 0
          ? {
              trim_start: trimStart,
              trim_end: trimEnd,
              usable_duration: (trimEnd || duration) - trimStart,
              based_on: basedOn,
            }
          : undefined,
    },
  };
}

