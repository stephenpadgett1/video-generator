import { z } from "zod";
/**
 * Projects tools - list, get, save, delete projects
 */
export declare const projectsTools: {
    list_projects: {
        name: string;
        title: string;
        description: string;
        inputSchema: {
            limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        };
        handler: (args: {
            limit?: number;
        }) => Promise<{
            content: {
                type: "text";
                text: string;
            }[];
        }>;
    };
    get_project: {
        name: string;
        title: string;
        description: string;
        inputSchema: {
            projectId: z.ZodString;
        };
        handler: (args: {
            projectId: string;
        }) => Promise<{
            content: {
                type: "text";
                text: string;
            }[];
        }>;
    };
    save_project: {
        name: string;
        title: string;
        description: string;
        inputSchema: {
            projectId: z.ZodString;
            project: z.ZodRecord<z.ZodString, z.ZodAny>;
        };
        handler: (args: {
            projectId: string;
            project: Record<string, unknown>;
        }) => Promise<{
            content: {
                type: "text";
                text: string;
            }[];
        }>;
    };
};
//# sourceMappingURL=projects.d.ts.map