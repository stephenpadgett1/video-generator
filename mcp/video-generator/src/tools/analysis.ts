import { z } from "zod";
import {
  transcribe,
  analyzeAudioTimeline,
  analyzeDialogueClip,
  analyzeClipUnified,
} from "../services/analysis.js";

/**
 * Analysis tools - transcription, audio timeline, dialogue validation, unified analysis
 */

export const analysisTools = {
  transcribe: {
    name: "transcribe",
    title: "Transcribe",
    description: "Transcribe audio from video using OpenAI Whisper. Returns segments, words with timestamps, and full text.",
    inputSchema: {
      videoPath: z.string().describe("Path to video file"),
    },
    handler: async (args: { videoPath: string }) => {
      try {
        const result = await transcribe(args.videoPath);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error transcribing: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  analyze_audio_timeline: {
    name: "analyze_audio_timeline",
    title: "Analyze Audio Timeline",
    description:
      "Analyze audio timeline combining Whisper transcription with FFmpeg silence detection. Returns reconciled word timings and speech segments.",
    inputSchema: {
      videoPath: z.string().describe("Path to video file"),
      noiseDb: z.number().optional().default(-30).describe("Noise threshold in dB for silence detection"),
      minSilenceDuration: z.number().optional().default(0.3).describe("Minimum silence duration in seconds"),
    },
    handler: async (args: { videoPath: string; noiseDb?: number; minSilenceDuration?: number }) => {
      try {
        const result = await analyzeAudioTimeline(args.videoPath, {
          noiseDb: args.noiseDb,
          minSilenceDuration: args.minSilenceDuration,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error analyzing audio timeline: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  analyze_dialogue_clip: {
    name: "analyze_dialogue_clip",
    title: "Analyze Dialogue Clip",
    description:
      "Validate dialogue generation by comparing expected vs actual speech. Returns trim recommendations and match score.",
    inputSchema: {
      videoPath: z.string().describe("Path to video file"),
      expectedDialogue: z.string().describe("Expected dialogue text"),
    },
    handler: async (args: { videoPath: string; expectedDialogue: string }) => {
      try {
        const result = await analyzeDialogueClip(args.videoPath, args.expectedDialogue);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error analyzing dialogue clip: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  analyze_clip_unified: {
    name: "analyze_clip_unified",
    title: "Analyze Clip Unified",
    description:
      "Comprehensive multi-signal analysis: scene detection, black/freeze frames, audio analysis, and correlation. Returns quality score and edit suggestions.",
    inputSchema: {
      videoPath: z.string().describe("Path to video file"),
      sceneThreshold: z.number().optional().default(0.4).describe("Scene change detection threshold"),
      noiseDb: z.number().optional().default(-30).describe("Noise threshold for silence detection"),
      minSilenceDuration: z.number().optional().default(0.3).describe("Minimum silence duration"),
      skipTranscription: z.boolean().optional().default(false).describe("Skip Whisper transcription"),
      blackPixThreshold: z.number().optional().default(0.98).describe("Black frame pixel threshold"),
      blackMinDuration: z.number().optional().default(0.1).describe("Minimum black frame duration"),
      freezeNoise: z.number().optional().default(0.001).describe("Freeze frame noise tolerance"),
      freezeMinDuration: z.number().optional().default(0.5).describe("Minimum freeze frame duration"),
      context: z
        .object({
          dialogue: z
            .array(
              z.object({
                speaker: z.string(),
                text: z.string(),
              })
            )
            .optional(),
          duration_target: z.number().optional(),
        })
        .optional()
        .describe("Context for validation (expected dialogue, target duration)"),
    },
    handler: async (args: {
      videoPath: string;
      sceneThreshold?: number;
      noiseDb?: number;
      minSilenceDuration?: number;
      skipTranscription?: boolean;
      blackPixThreshold?: number;
      blackMinDuration?: number;
      freezeNoise?: number;
      freezeMinDuration?: number;
      context?: { dialogue?: Array<{ speaker: string; text: string }>; duration_target?: number };
    }) => {
      try {
        const result = await analyzeClipUnified(args.videoPath, {
          sceneThreshold: args.sceneThreshold,
          noiseDb: args.noiseDb,
          minSilenceDuration: args.minSilenceDuration,
          skipTranscription: args.skipTranscription,
          blackPixThreshold: args.blackPixThreshold,
          blackMinDuration: args.blackMinDuration,
          freezeNoise: args.freezeNoise,
          freezeMinDuration: args.freezeMinDuration,
          context: args.context,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error analyzing clip: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

};
