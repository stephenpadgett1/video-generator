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
export declare function loadConfig(): Config;
/**
 * Save configuration to data/config.json
 */
export declare function saveConfig(config: Config): void;
/**
 * Update specific config fields (merge with existing)
 */
export declare function updateConfig(updates: Partial<Config>): Config;
//# sourceMappingURL=config.d.ts.map