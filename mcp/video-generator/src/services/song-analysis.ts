/**
 * Song Analysis Service
 *
 * Analyzes songs to extract:
 * - Lyrics with word-level timestamps (via Whisper)
 * - Audio onsets (when sounds/notes start) using librosa
 * - Energy curves and section detection (loud/quiet)
 *
 * Combines into a unified timeline for video synchronization.
 */

import fs from "fs";
import { spawn } from "child_process";
import { transcribe, TranscriptionWord } from "./analysis.js";
import { SONG_ANALYSIS_SCRIPT, resolvePath } from "../utils/paths.js";

// ============================================================================
// Types
// ============================================================================

export interface Onset {
  time: number;
  strength: number;
}

export interface EnergyPoint {
  time: number;
  rms: number;
}

export interface Section {
  start: number;
  end: number;
  type: "loud" | "quiet";
}

export interface TimelineEvent {
  time: number;
  type: "onset" | "lyric" | "section_start" | "section_end";
  strength?: number;
  text?: string;
  end?: number;
  description?: string;
}

export interface LyricsData {
  words: TranscriptionWord[];
  full_text: string;
}

export interface SongAnalysisOptions {
  skipLyrics?: boolean;
  onsetThreshold?: number;
  energyThreshold?: number;
}

export interface SongAnalysisResult {
  timeline: TimelineEvent[];
  lyrics: LyricsData | null;
  onsets: Onset[];
  energy_curve: EnergyPoint[];
  summary: {
    duration: number;
    lyric_count: number;
    onset_count: number;
    sections: Section[];
  };
}

interface PythonOnsetOutput {
  onsets: Onset[];
  energy_curve: EnergyPoint[];
  sections: Section[];
  duration: number;
  error?: string;
}

// ============================================================================
// Python Script Execution
// ============================================================================

async function runPythonScript(
  scriptPath: string,
  input: object
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Use 'python' on Windows, 'python3' elsewhere
    const pythonCmd = process.platform === "win32" ? "python" : "python3";

    const proc = spawn(pythonCmd, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed (exit ${code}): ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });

    // Send input via stdin
    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
}

// ============================================================================
// Core Analysis
// ============================================================================

/**
 * Detect onsets and compute energy curve using librosa (Python).
 */
async function detectOnsets(
  audioPath: string,
  options: { onsetThreshold?: number; energyThreshold?: number }
): Promise<PythonOnsetOutput> {
  const input = {
    audio_path: audioPath,
    options: {
      onset_threshold: options.onsetThreshold ?? 0.5,
      energy_threshold: options.energyThreshold ?? 0.3,
    },
  };

  const stdout = await runPythonScript(SONG_ANALYSIS_SCRIPT, input);
  const result = JSON.parse(stdout) as PythonOnsetOutput;

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
}

/**
 * Build unified timeline from onsets, lyrics, and sections.
 */
function buildTimeline(
  onsets: Onset[],
  lyrics: LyricsData | null,
  sections: Section[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Add section events
  for (const section of sections) {
    events.push({
      time: section.start,
      type: "section_start",
      description: `${section.type} section begins`,
    });
  }

  // Add onset events (filter to strength >= 0.2)
  for (const onset of onsets) {
    if (onset.strength >= 0.2) {
      events.push({
        time: onset.time,
        type: "onset",
        strength: onset.strength,
      });
    }
  }

  // Add lyric events
  if (lyrics) {
    for (const word of lyrics.words) {
      events.push({
        time: word.start,
        type: "lyric",
        text: word.word,
        end: word.end,
      });
    }
  }

  // Sort by time
  events.sort((a, b) => a.time - b.time);

  return events;
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Analyze a song file for lyrics, onsets, and energy sections.
 *
 * @param audioPath - Path to audio/video file
 * @param options - Analysis options
 */
export async function analyzeSong(
  audioPath: string,
  options: SongAnalysisOptions = {}
): Promise<SongAnalysisResult> {
  const { skipLyrics = false, onsetThreshold = 0.5, energyThreshold = 0.3 } = options;

  const resolvedPath = resolvePath(audioPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  // Run onset detection (Python/librosa)
  const onsetResult = await detectOnsets(resolvedPath, {
    onsetThreshold,
    energyThreshold,
  });

  // Get lyrics via Whisper (unless skipped)
  let lyrics: LyricsData | null = null;
  if (!skipLyrics) {
    try {
      const transcription = await transcribe(resolvedPath);
      lyrics = {
        words: transcription.words,
        full_text: transcription.full_text,
      };
    } catch (error) {
      // Log but continue - lyrics are optional
      console.error("Whisper transcription failed:", error);
    }
  }

  // Build unified timeline
  const timeline = buildTimeline(onsetResult.onsets, lyrics, onsetResult.sections);

  return {
    timeline,
    lyrics,
    onsets: onsetResult.onsets,
    energy_curve: onsetResult.energy_curve,
    summary: {
      duration: onsetResult.duration,
      lyric_count: lyrics?.words.length ?? 0,
      onset_count: onsetResult.onsets.length,
      sections: onsetResult.sections,
    },
  };
}
