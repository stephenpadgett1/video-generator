import { z } from "zod";
import { loadConfig, updateConfig } from "../utils/config.js";
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
        handler: async (args) => {
            const config = loadConfig();
            // Redact API keys unless explicitly requested
            const safeConfig = { ...config };
            if (!args.includeKeys) {
                const keyFields = ["anthropicKey", "googleApiKey", "elevenLabsKey", "openaiKey"];
                for (const field of keyFields) {
                    if (safeConfig[field]) {
                        const value = safeConfig[field];
                        safeConfig[field] = value.slice(0, 8) + "..." + value.slice(-4);
                    }
                }
            }
            return {
                content: [
                    {
                        type: "text",
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
        handler: async (args) => {
            const updated = updateConfig(args.updates);
            // Redact keys in response
            const safeConfig = { ...updated };
            const keyFields = ["anthropicKey", "googleApiKey", "elevenLabsKey", "openaiKey"];
            for (const field of keyFields) {
                if (safeConfig[field]) {
                    const value = safeConfig[field];
                    safeConfig[field] = value.slice(0, 8) + "..." + value.slice(-4);
                }
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `Configuration updated:\n${JSON.stringify(safeConfig, null, 2)}`,
                    },
                ],
            };
        },
    },
};
//# sourceMappingURL=config.js.map