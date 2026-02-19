import { z } from "zod";
import {
  fetchVoices,
  getVoicesCached,
  loadVoicesCache,
  generateTTS,
  generateMusic,
  generateSoundEffect,
  computeVoiceSettings,
  computeMusicProfile,
} from "../services/audio.js";

/**
 * Audio tools - voices, TTS, music generation, and audio profiles
 */

export const audioTools = {
  get_voices: {
    name: "get_voices",
    title: "Get Voices",
    description: "Fetch available voices from ElevenLabs API (direct call, no caching).",
    inputSchema: {},
    handler: async () => {
      try {
        const voices = await fetchVoices();

        const summary = voices.map((v) => ({
          voice_id: v.voice_id,
          name: v.name,
          labels: v.labels,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ count: voices.length, voices: summary }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching voices: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  get_cached_voices: {
    name: "get_cached_voices",
    title: "Get Cached Voices",
    description:
      "Get voices with smart caching (7-day TTL). Returns stale cache on network errors.",
    inputSchema: {
      refresh: z
        .boolean()
        .optional()
        .default(false)
        .describe("Force refresh from API"),
    },
    handler: async (args: { refresh?: boolean }) => {
      try {
        const result = await getVoicesCached(args.refresh);

        const summary = result.voices.map((v) => ({
          voice_id: v.voice_id,
          name: v.name,
          labels: v.labels,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  count: result.voices.length,
                  stale: result.stale,
                  fetchedAt: result.fetchedAt,
                  voices: summary,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        // Check if we have any cached data
        const cache = loadVoicesCache();
        if (cache) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    count: cache.voices.length,
                    stale: true,
                    fetchedAt: cache.fetchedAt,
                    error: error instanceof Error ? error.message : "Unknown error",
                    voices: cache.voices.map((v) => ({
                      voice_id: v.voice_id,
                      name: v.name,
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching voices: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  generate_tts: {
    name: "generate_tts",
    title: "Generate TTS",
    description:
      "Generate text-to-speech audio with optional mood-aware voice modulation.",
    inputSchema: {
      voice_id: z.string().describe("ElevenLabs voice ID"),
      text: z.string().describe("Text to synthesize"),
      mood: z.string().optional().describe("Mood for voice modulation (hopeful, tense, etc.)"),
      tension: z.number().optional().describe("Tension level 0-1 (affects stability, speed)"),
      energy: z.number().optional().describe("Energy level 0-1 (affects speed)"),
      model_id: z
        .string()
        .optional()
        .default("eleven_turbo_v2_5")
        .describe("TTS model ID"),
      style: z.number().optional().describe("Style exaggeration 0-1 (higher = more expressive/dramatic)"),
      speed: z.number().optional().describe("Speech speed multiplier (1.0 = normal, >1 = faster, <1 = slower)"),
      filename: z.string().optional().describe("Custom output filename"),
    },
    handler: async (args: {
      voice_id: string;
      text: string;
      mood?: string;
      tension?: number;
      energy?: number;
      model_id?: string;
      style?: number;
      speed?: number;
      filename?: string;
    }) => {
      try {
        const result = await generateTTS(args);

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
              text: `Error generating TTS: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  generate_music: {
    name: "generate_music",
    title: "Generate Music",
    description:
      "Generate music using ElevenLabs. Supports prompt (instrumental), lyrics (vocals), or mood-based auto-prompting.",
    inputSchema: {
      prompt: z.string().optional().describe("Text prompt for instrumental music"),
      lyrics: z.string().optional().describe("Lyrics for vocal music"),
      style: z
        .object({
          positive: z.array(z.string()).optional(),
          negative: z.array(z.string()).optional(),
        })
        .optional()
        .describe("Style tags for lyrics mode"),
      mood: z.string().optional().describe("Mood for auto-prompt generation"),
      tension: z.number().optional().describe("Tension level 0-1"),
      energy: z.number().optional().describe("Energy level 0-1"),
      duration_seconds: z.number().describe("Target duration in seconds"),
    },
    handler: async (args: {
      prompt?: string;
      lyrics?: string;
      style?: { positive?: string[]; negative?: string[] };
      mood?: string;
      tension?: number;
      energy?: number;
      duration_seconds: number;
    }) => {
      try {
        const result = await generateMusic(args);

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
              text: `Error generating music: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  compute_audio_profile: {
    name: "compute_audio_profile",
    title: "Compute Audio Profile",
    description:
      "Compute voice and music profiles from mood/tension/energy without generating audio.",
    inputSchema: {
      mood: z.string().optional().default("peaceful").describe("Mood name"),
      tension: z.number().optional().default(0.5).describe("Tension level 0-1"),
      energy: z.number().optional().default(0.5).describe("Energy level 0-1"),
    },
    handler: async (args: { mood?: string; tension?: number; energy?: number }) => {
      const voiceProfile = computeVoiceSettings(args);
      const musicProfile = computeMusicProfile(args);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ voice_profile: voiceProfile, music_profile: musicProfile }, null, 2),
          },
        ],
      };
    },
  },

  generate_sound_effect: {
    name: "generate_sound_effect",
    title: "Generate Sound Effect",
    description:
      "Generate a sound effect using ElevenLabs. Provide a text description of the sound.",
    inputSchema: {
      text: z.string().describe("Description of the sound effect (e.g., 'dogs barking in the distance')"),
      duration_seconds: z
        .number()
        .optional()
        .describe("Target duration in seconds (0.5-22). If not specified, auto-determined."),
      prompt_influence: z
        .number()
        .optional()
        .default(0.3)
        .describe("How closely to follow the prompt (0-1). Lower = more creative."),
      filename: z.string().optional().describe("Custom output filename"),
    },
    handler: async (args: {
      text: string;
      duration_seconds?: number;
      prompt_influence?: number;
      filename?: string;
    }) => {
      try {
        const result = await generateSoundEffect(args);

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
              text: `Error generating sound effect: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },
};
