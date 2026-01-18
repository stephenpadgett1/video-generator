import { z } from "zod";
import { lockCharacter, lockEnvironment } from "../services/locking.js";

/**
 * Locking tools - lock character and environment appearances for consistency
 */

export const lockingTools = {
  lock_character: {
    name: "lock_character",
    title: "Lock Character",
    description:
      "Generate a reference image for a character and extract their visual features. Returns a locked description that should be used in all shots featuring this character.",
    inputSchema: {
      character: z
        .object({
          id: z.string().describe("Character ID (snake_case)"),
          description: z.string().describe("Character description for image generation"),
        })
        .describe("Character to lock"),
      style: z
        .string()
        .optional()
        .describe("Optional style guidance for the reference image"),
      userLockedDescription: z
        .string()
        .optional()
        .describe("User-provided locked description (50-80 words). Bypasses automatic Gemini extraction. Use for precise control over specific details like stripe counts, fold positions, etc."),
      userReferenceImagePath: z
        .string()
        .optional()
        .describe("Path to user-provided reference image. Bypasses Imagen generation. Use when you have an existing image with the exact details you want."),
    },
    handler: async (args: {
      character: { id: string; description: string };
      style?: string;
      userLockedDescription?: string;
      userReferenceImagePath?: string;
    }) => {
      try {
        const result = await lockCharacter({
          character: args.character,
          style: args.style,
          userLockedDescription: args.userLockedDescription,
          userReferenceImagePath: args.userReferenceImagePath,
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
              text: `Error locking character: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  lock_environment: {
    name: "lock_environment",
    title: "Lock Environment",
    description:
      "Generate a reference image for an environment and extract its architectural/atmospheric features. Returns a locked description for scene consistency.",
    inputSchema: {
      environment: z
        .object({
          id: z.string().describe("Environment ID (snake_case)"),
          description: z
            .string()
            .describe("Environment description for image generation"),
        })
        .describe("Environment to lock"),
      style: z
        .string()
        .optional()
        .describe("Optional style guidance for the reference image"),
    },
    handler: async (args: {
      environment: { id: string; description: string };
      style?: string;
    }) => {
      try {
        const result = await lockEnvironment({
          environment: args.environment,
          style: args.style,
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
              text: `Error locking environment: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },
};
