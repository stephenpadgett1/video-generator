import fs from "fs";
import { CONFIG_PATH } from "./paths.js";

export interface Config {
  anthropicKey?: string;
  googleApiKey?: string;
  elevenLabsKey?: string;
  openaiKey?: string;
  currentProject?: string;
  defaultVoiceId?: string;
  [key: string]: unknown;
}

/**
 * Load configuration from data/config.json
 */
export function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading config:", error);
  }
  return {};
}

/**
 * Save configuration to data/config.json
 */
export function saveConfig(config: Config): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Update specific config fields (merge with existing)
 */
export function updateConfig(updates: Partial<Config>): Config {
  const current = loadConfig();
  const updated = { ...current, ...updates };
  saveConfig(updated);
  return updated;
}
