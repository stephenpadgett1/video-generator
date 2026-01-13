import { z } from "zod";
import { assembleVideo, extractFrame } from "../services/assembly.js";

/**
 * Assembly tools - video assembly with transitions, audio layers, and frame extraction
 */

export const assemblyTools = {
  assemble_video: {
    name: "assemble_video",
    title: "Assemble Video",
    description:
      "Assemble video from shots with tension-aware transitions, audio layers, and text overlays. Can load shots from a project or accept explicit shot list.",
    inputSchema: {
      project_id: z.string().optional().describe("Project ID to load shots from"),
      shots: z
        .array(
          z.object({
            videoPath: z.string().describe("Path to video file"),
            trimStart: z.number().optional().describe("Trim start time in seconds"),
            trimEnd: z.number().optional().describe("Trim end time in seconds"),
            energy: z.number().optional().describe("Energy level 0-1 for transition logic"),
            tension: z.number().optional().describe("Tension level 0-1 for transition logic"),
            mood: z.string().optional().describe("Mood for audio processing"),
            skipTransition: z.boolean().optional().describe("Skip transition (for multi-take continuity)"),
          })
        )
        .optional()
        .describe("Explicit shot list (if not using project_id)"),
      outputFilename: z.string().optional().describe("Output filename"),
      textOverlays: z
        .array(
          z.object({
            text: z.string().describe("Text to overlay"),
            startTime: z.number().describe("Start time in seconds"),
            duration: z.number().describe("Duration in seconds"),
            position: z.enum(["top", "center", "bottom"]).optional().describe("Vertical position"),
          })
        )
        .optional()
        .describe("Text overlays to add"),
      audioLayers: z
        .array(
          z.object({
            type: z.enum(["music", "vo", "sfx", "ambient"]).describe("Audio layer type"),
            path: z.string().optional().describe("Path to audio file"),
            text: z.string().optional().describe("Text for TTS generation"),
            voice_id: z.string().optional().describe("ElevenLabs voice ID for TTS"),
            model_id: z.string().optional().describe("TTS model ID"),
            volume: z.number().optional().describe("Volume 0-1"),
            startTime: z.number().optional().describe("Start time in seconds"),
            mood: z.string().optional().describe("Mood for voice modulation"),
            tension: z.number().optional().describe("Tension for voice modulation"),
            energy: z.number().optional().describe("Energy for voice modulation"),
          })
        )
        .optional()
        .describe("Audio layers to mix"),
      videoVolume: z.number().optional().default(1.0).describe("Video audio volume 0-1"),
      voice_id: z.string().optional().describe("Default voice ID for TTS"),
    },
    handler: async (args: {
      project_id?: string;
      shots?: Array<{
        videoPath: string;
        trimStart?: number;
        trimEnd?: number;
        energy?: number;
        tension?: number;
        mood?: string;
        skipTransition?: boolean;
      }>;
      outputFilename?: string;
      textOverlays?: Array<{
        text: string;
        startTime: number;
        duration: number;
        position?: "top" | "center" | "bottom";
      }>;
      audioLayers?: Array<{
        type: "music" | "vo" | "sfx" | "ambient";
        path?: string;
        text?: string;
        voice_id?: string;
        model_id?: string;
        volume?: number;
        startTime?: number;
        mood?: string;
        tension?: number;
        energy?: number;
      }>;
      videoVolume?: number;
      voice_id?: string;
    }) => {
      try {
        const result = await assembleVideo(args);
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
              text: `Error assembling video: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  extract_frame: {
    name: "extract_frame",
    title: "Extract Frame",
    description: "Extract a single frame from a video at a specific timestamp as PNG.",
    inputSchema: {
      videoPath: z.string().describe("Path to video file"),
      timestamp: z.number().describe("Timestamp in seconds to extract"),
      outputPath: z.string().optional().describe("Output path for PNG (optional, auto-generated if not provided)"),
    },
    handler: async (args: { videoPath: string; timestamp: number; outputPath?: string }) => {
      try {
        const framePath = await extractFrame(args.videoPath, args.timestamp, args.outputPath);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, path: framePath, timestamp: args.timestamp }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error extracting frame: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },
};
