import { z } from "zod";
import { loadConfig, updateConfig, type Config } from "../utils/config.js";

/**
 * Config tools - get and save configuration
 */

export const configTools = {
  get_config: {
    name: "get_config",
    title: "Get Configuration",
    description: "Load current configuration including API keys (redacted) and settings.",
    inputSchema: {
      includeKeys: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include API keys in response (default: false, keys are redacted)"),
    },
    handler: async (args: { includeKeys?: boolean }) => {
      const config = loadConfig();

      // Redact API keys unless explicitly requested
      const safeConfig: Config = { ...config };
      if (!args.includeKeys) {
        const keyFields = ["anthropicKey", "googleApiKey", "elevenLabsKey", "openaiKey"];
        for (const field of keyFields) {
          if (safeConfig[field]) {
            const value = safeConfig[field] as string;
            safeConfig[field] = value.slice(0, 8) + "..." + value.slice(-4);
          }
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(safeConfig, null, 2),
          },
        ],
      };
    },
  },

  save_config: {
    name: "save_config",
    title: "Save Configuration",
    description: "Update configuration fields. Merges with existing config.",
    inputSchema: {
      updates: z
        .record(z.string(), z.any())
        .describe("Configuration fields to update (key-value pairs)"),
    },
    handler: async (args: { updates: Record<string, unknown> }) => {
      const updated = updateConfig(args.updates);

      // Redact keys in response
      const safeConfig: Config = { ...updated };
      const keyFields = ["anthropicKey", "googleApiKey", "elevenLabsKey", "openaiKey"];
      for (const field of keyFields) {
        if (safeConfig[field]) {
          const value = safeConfig[field] as string;
          safeConfig[field] = value.slice(0, 8) + "..." + value.slice(-4);
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Configuration updated:\n${JSON.stringify(safeConfig, null, 2)}`,
          },
        ],
      };
    },
  },
};
