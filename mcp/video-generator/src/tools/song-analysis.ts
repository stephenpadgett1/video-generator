/**
 * Song Analysis MCP Tools
 *
 * Tools for analyzing songs to extract lyrics, onsets, and energy sections.
 */

import { z } from "zod";
import { analyzeSong } from "../services/song-analysis.js";

// ============================================================================
// Tool: analyze_song
// ============================================================================

const analyzeSongTool = {
  name: "analyze_song",
  description: `Analyze a song to extract lyrics and audio onset times into a unified timeline.

Extracts:
- Lyrics with word-level timestamps (via Whisper)
- Audio onsets (when sounds/notes start) using librosa
- Energy curve (RMS) for visualizing intensity
- Sections (loud/quiet) based on energy threshold

Output includes a unified timeline combining all events sorted by time.

Requirements:
- Python with librosa installed: cd scripts/song-analysis && pip install -r requirements.txt
- OpenAI API key in config (for Whisper, unless skipLyrics: true)`,
  inputSchema: {
    audioPath: z.string().describe("Path to audio or video file"),
    skipLyrics: z
      .boolean()
      .optional()
      .default(false)
      .describe("Skip Whisper transcription (for instrumentals)"),
    onsetThreshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.5)
      .describe("Onset detection sensitivity (0-1, default 0.5)"),
    energyThreshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.3)
      .describe("Section detection threshold (0-1, default 0.3)"),
  },
  handler: async (args: {
    audioPath: string;
    skipLyrics?: boolean;
    onsetThreshold?: number;
    energyThreshold?: number;
  }) => {
    const result = await analyzeSong(args.audioPath, {
      skipLyrics: args.skipLyrics,
      onsetThreshold: args.onsetThreshold,
      energyThreshold: args.energyThreshold,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
};

// ============================================================================
// Exports
// ============================================================================

export const songAnalysisTools = {
  analyze_song: analyzeSongTool,
};
