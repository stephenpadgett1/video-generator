import fs from "fs";
import { CONFIG_PATH } from "./paths.js";
/**
 * Load configuration from data/config.json
 */
export function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, "utf-8");
            return JSON.parse(data);
        }
    }
    catch (error) {
        console.error("Error loading config:", error);
    }
    return {};
}
/**
 * Save configuration to data/config.json
 */
export function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
/**
 * Update specific config fields (merge with existing)
 */
export function updateConfig(updates) {
    const current = loadConfig();
    const updated = { ...current, ...updates };
    saveConfig(updated);
    return updated;
}
//# sourceMappingURL=config.js.map