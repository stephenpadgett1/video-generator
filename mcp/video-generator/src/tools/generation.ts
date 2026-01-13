import { z } from "zod";
import {
  generateStructure,
  generateVeoPrompt,
  generateFramePrompts,
  breakdownShot,
  generateImage,
  analyzeImage,
  ARC_TYPES,
} from "../services/generation.js";
import { submitVeoGeneration, pollVeoOperation } from "../clients/veo.js";

/**
 * Generation tools - structure, prompts, images, and Veo submission
 */

const dialogueSchema = z.array(
  z.object({
    speaker: z.string(),
    text: z.string(),
    mood: z.string().optional(),
    voiceDescription: z.string().optional(),
  })
);

export const generationTools = {
  generate_structure: {
    name: "generate_structure",
    title: "Generate Structure",
    description:
      "Generate shot structure from a concept. Returns characters, environments, and shots with energy/tension/mood values.",
    inputSchema: {
      concept: z.string().describe("Video concept description"),
      duration: z.number().describe("Total duration in seconds"),
      arc: z
        .enum([
          "linear-build",
          "tension-release",
          "wave",
          "flat-punctuate",
          "bookend",
        ])
        .optional()
        .default("tension-release")
        .describe("Arc type for energy curve"),
      productionRules: z
        .record(z.string(), z.any())
        .optional()
        .describe("Production constraints (camera, visual, continuity)"),
    },
    handler: async (args: {
      concept: string;
      duration: number;
      arc?: keyof typeof ARC_TYPES;
      productionRules?: Record<string, unknown>;
    }) => {
      try {
        const structure = await generateStructure({
          concept: args.concept,
          duration: args.duration,
          arc: args.arc,
          productionRules: args.productionRules,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(structure, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error generating structure: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  generate_veo_prompt: {
    name: "generate_veo_prompt",
    title: "Generate Veo Prompt",
    description:
      "Generate a Veo video prompt from an action description. Supports mood, dialogue, and frame context.",
    inputSchema: {
      description: z.string().describe("Action/scene description"),
      durationSeconds: z.number().optional().describe("Target duration"),
      style: z.string().optional().describe("Visual style guidance"),
      aspectRatio: z
        .enum(["16:9", "9:16", "1:1"])
        .optional()
        .describe("Aspect ratio"),
      firstFrameDescription: z
        .string()
        .optional()
        .describe("Description of starting frame"),
      lastFrameDescription: z
        .string()
        .optional()
        .describe("Description of ending frame"),
      previousTakeDescription: z
        .string()
        .optional()
        .describe("Context from previous take"),
      additionalContext: z
        .string()
        .optional()
        .describe("Additional context (character descriptions, etc.)"),
      mood: z
        .string()
        .optional()
        .describe("Mood for visual atmosphere (hopeful, tense, etc.)"),
      dialogue: dialogueSchema.optional().describe("Dialogue lines to include"),
    },
    handler: async (args: {
      description: string;
      durationSeconds?: number;
      style?: string;
      aspectRatio?: string;
      firstFrameDescription?: string;
      lastFrameDescription?: string;
      previousTakeDescription?: string;
      additionalContext?: string;
      mood?: string;
      dialogue?: Array<{
        speaker: string;
        text: string;
        mood?: string;
        voiceDescription?: string;
      }>;
    }) => {
      try {
        const prompt = await generateVeoPrompt({
          description: args.description,
          durationSeconds: args.durationSeconds,
          style: args.style,
          veoOptions: {
            aspectRatio: args.aspectRatio,
            firstFrameDescription: args.firstFrameDescription,
            lastFrameDescription: args.lastFrameDescription,
            previousTakeDescription: args.previousTakeDescription,
            additionalContext: args.additionalContext,
            mood: args.mood,
            dialogue: args.dialogue,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: prompt,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error generating Veo prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  generate_frame_prompts: {
    name: "generate_frame_prompts",
    title: "Generate Frame Prompts",
    description:
      "Generate first and last frame image prompts from a Veo video prompt.",
    inputSchema: {
      veoPrompt: z.string().describe("The Veo video prompt to decompose"),
      shotContext: z
        .string()
        .optional()
        .describe("Additional context about the shot"),
    },
    handler: async (args: { veoPrompt: string; shotContext?: string }) => {
      try {
        const result = await generateFramePrompts({
          veoPrompt: args.veoPrompt,
          shotContext: args.shotContext,
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
              text: `Error generating frame prompts: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  breakdown_shot: {
    name: "breakdown_shot",
    title: "Breakdown Shot",
    description:
      "Break down a long shot into multiple takes (4, 6, or 8 second segments).",
    inputSchema: {
      description: z.string().describe("Shot description/action"),
      duration: z.number().describe("Total duration needed"),
      firstFramePrompt: z
        .string()
        .optional()
        .describe("Image prompt for starting frame"),
      lastFramePrompt: z
        .string()
        .optional()
        .describe("Image prompt for ending frame"),
      context: z.string().optional().describe("Additional context"),
    },
    handler: async (args: {
      description: string;
      duration: number;
      firstFramePrompt?: string;
      lastFramePrompt?: string;
      context?: string;
    }) => {
      try {
        const takes = await breakdownShot(args);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(takes, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error breaking down shot: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  submit_veo_generation: {
    name: "submit_veo_generation",
    title: "Submit Veo Generation",
    description:
      "Submit a video generation request directly to Veo. Returns operation name for polling.",
    inputSchema: {
      prompt: z.string().describe("Video generation prompt"),
      aspectRatio: z
        .enum(["16:9", "9:16", "1:1"])
        .optional()
        .default("9:16")
        .describe("Video aspect ratio"),
      durationSeconds: z
        .number()
        .optional()
        .default(8)
        .describe("Duration (snaps to 4, 6, or 8)"),
      referenceImagePath: z
        .string()
        .optional()
        .describe("Path to reference image for first frame"),
      lastFramePath: z
        .string()
        .optional()
        .describe("Path to target last frame image"),
    },
    handler: async (args: {
      prompt: string;
      aspectRatio?: "16:9" | "9:16" | "1:1";
      durationSeconds?: number;
      referenceImagePath?: string;
      lastFramePath?: string;
    }) => {
      try {
        const result = await submitVeoGeneration({
          prompt: args.prompt,
          aspectRatio: args.aspectRatio,
          durationSeconds: args.durationSeconds,
          referenceImagePath: args.referenceImagePath,
          lastFramePath: args.lastFramePath,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  operationName: result.operationName,
                  message:
                    "Generation submitted. Use check_veo_status to poll for completion.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error submitting Veo generation: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  check_veo_status: {
    name: "check_veo_status",
    title: "Check Veo Status",
    description: "Poll the status of a Veo generation operation.",
    inputSchema: {
      operationName: z.string().describe("Operation name from submit_veo_generation"),
    },
    handler: async (args: { operationName: string }) => {
      try {
        const result = await pollVeoOperation(args.operationName);

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
              text: `Error checking Veo status: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  generate_image: {
    name: "generate_image",
    title: "Generate Image",
    description: "Generate an image using Imagen 3.0.",
    inputSchema: {
      prompt: z.string().describe("Image generation prompt"),
      aspectRatio: z
        .enum(["16:9", "9:16", "1:1"])
        .optional()
        .default("9:16")
        .describe("Image aspect ratio"),
      outputFilename: z
        .string()
        .optional()
        .describe("Optional filename for output"),
    },
    handler: async (args: {
      prompt: string;
      aspectRatio?: string;
      outputFilename?: string;
    }) => {
      try {
        const result = await generateImage(args);

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
              text: `Error generating image: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  analyze_image: {
    name: "analyze_image",
    title: "Analyze Image",
    description:
      "Analyze an image using Gemini to get a description. Useful for frame context.",
    inputSchema: {
      imagePath: z.string().describe("Path to image file"),
    },
    handler: async (args: { imagePath: string }) => {
      try {
        const description = await analyzeImage(args.imagePath);

        return {
          content: [
            {
              type: "text" as const,
              text: description,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error analyzing image: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },
};
