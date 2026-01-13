import { z } from "zod";
import { executeProject, type Project } from "../services/execution.js";

/**
 * Execution tools - execute full project pipeline
 */

const dialogueSchema = z.array(
  z.object({
    speaker: z.string(),
    text: z.string(),
    mood: z.string().optional(),
    voiceDescription: z.string().optional(),
  })
);

const characterSchema = z.object({
  id: z.string(),
  description: z.string(),
  locked_description: z.string().optional(),
  base_image_path: z.string().optional(),
  locked: z.boolean().optional(),
});

const environmentSchema = z.object({
  id: z.string(),
  description: z.string(),
  locked_description: z.string().optional(),
  base_image_path: z.string().optional(),
  primary: z.boolean().optional(),
});

const shotSchema = z.object({
  shot_id: z.string(),
  description: z.string(),
  duration_target: z.number(),
  energy: z.number().optional(),
  tension: z.number().optional(),
  mood: z.string().optional(),
  characters: z.array(z.string()).optional(),
  environment: z.string().optional(),
  dialogue: dialogueSchema.optional(),
  vo: z.string().optional(),
});

const projectSchema = z.object({
  project_id: z.string(),
  concept: z.string(),
  duration: z.number(),
  arc: z.string().optional(),
  style: z.string().optional(),
  characters: z.array(characterSchema).optional(),
  environments: z.array(environmentSchema).optional(),
  shots: z.array(shotSchema),
  production_rules: z.record(z.string(), z.any()).optional(),
});

export const executionTools = {
  execute_project: {
    name: "execute_project",
    title: "Execute Project",
    description:
      "Execute a full video project. Generates Veo prompts for each shot (with character/environment context) and submits generation jobs. Returns job IDs for tracking progress.",
    inputSchema: {
      project: projectSchema.describe("Full project object with shots, characters, and environments"),
      style: z.string().optional().describe("Override project style"),
      aspectRatio: z
        .enum(["16:9", "9:16", "1:1"])
        .optional()
        .default("9:16")
        .describe("Video aspect ratio"),
    },
    handler: async (args: {
      project: Project;
      style?: string;
      aspectRatio?: "16:9" | "9:16" | "1:1";
    }) => {
      try {
        const result = await executeProject({
          project: args.project,
          style: args.style,
          aspectRatio: args.aspectRatio,
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
              text: `Error executing project: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },
};
