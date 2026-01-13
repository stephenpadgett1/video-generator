import { z } from "zod";
/**
 * Config tools - get and save configuration
 */
export declare const configTools: {
    get_config: {
        name: string;
        title: string;
        description: string;
        inputSchema: {
            includeKeys: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        };
        handler: (args: {
            includeKeys?: boolean;
        }) => Promise<{
            content: {
                type: "text";
                text: string;
            }[];
        }>;
    };
    save_config: {
        name: string;
        title: string;
        description: string;
        inputSchema: {
            updates: z.ZodRecord<z.ZodString, z.ZodAny>;
        };
        handler: (args: {
            updates: Record<string, unknown>;
        }) => Promise<{
            content: {
                type: "text";
                text: string;
            }[];
        }>;
    };
};
//# sourceMappingURL=config.d.ts.map