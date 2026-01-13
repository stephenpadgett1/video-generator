import { z } from "zod";
import fs from "fs";
import path from "path";
import { PROJECTS_DIR } from "../utils/paths.js";
/**
 * Projects tools - list, get, save, delete projects
 */
export const projectsTools = {
    list_projects: {
        name: "list_projects",
        title: "List Projects",
        description: "List all saved projects with basic metadata (title, concept, shot count).",
        inputSchema: {
            limit: z.number().optional().default(20).describe("Maximum number of projects to return"),
        },
        handler: async (args) => {
            const limit = args.limit ?? 20;
            if (!fs.existsSync(PROJECTS_DIR)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No projects directory found. No projects exist yet.",
                        },
                    ],
                };
            }
            const files = fs.readdirSync(PROJECTS_DIR).filter((f) => f.endsWith(".json"));
            const projects = [];
            for (const file of files.slice(0, limit)) {
                try {
                    const filepath = path.join(PROJECTS_DIR, file);
                    const stats = fs.statSync(filepath);
                    const data = JSON.parse(fs.readFileSync(filepath, "utf-8"));
                    projects.push({
                        id: path.basename(file, ".json"),
                        filename: file,
                        title: data.title || data.concept?.slice(0, 50),
                        concept: data.concept?.slice(0, 100),
                        shotCount: data.shots?.length,
                        createdAt: data.createdAt,
                        modifiedAt: stats.mtime.toISOString(),
                    });
                }
                catch (error) {
                    // Skip invalid files
                    console.error(`Error reading project ${file}:`, error);
                }
            }
            // Sort by modified date (newest first)
            projects.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
            if (projects.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No projects found.",
                        },
                    ],
                };
            }
            const summary = projects
                .map((p) => `- **${p.id}**: ${p.title || "(untitled)"}\n  Shots: ${p.shotCount ?? "?"}, Modified: ${p.modifiedAt}`)
                .join("\n\n");
            return {
                content: [
                    {
                        type: "text",
                        text: `Found ${projects.length} project(s):\n\n${summary}`,
                    },
                ],
            };
        },
    },
    get_project: {
        name: "get_project",
        title: "Get Project",
        description: "Load a project by ID and return its full data.",
        inputSchema: {
            projectId: z.string().describe("Project ID (filename without .json extension)"),
        },
        handler: async (args) => {
            const filepath = path.join(PROJECTS_DIR, `${args.projectId}.json`);
            if (!fs.existsSync(filepath)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Project not found: ${args.projectId}`,
                        },
                    ],
                };
            }
            try {
                const data = JSON.parse(fs.readFileSync(filepath, "utf-8"));
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(data, null, 2),
                        },
                    ],
                };
            }
            catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error reading project: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        },
    },
    save_project: {
        name: "save_project",
        title: "Save Project",
        description: "Save a project to disk. Creates new or overwrites existing.",
        inputSchema: {
            projectId: z.string().describe("Project ID (will be used as filename)"),
            project: z.record(z.string(), z.any()).describe("Project data to save"),
        },
        handler: async (args) => {
            if (!fs.existsSync(PROJECTS_DIR)) {
                fs.mkdirSync(PROJECTS_DIR, { recursive: true });
            }
            const filepath = path.join(PROJECTS_DIR, `${args.projectId}.json`);
            const dataToSave = {
                ...args.project,
                id: args.projectId,
                savedAt: new Date().toISOString(),
            };
            fs.writeFileSync(filepath, JSON.stringify(dataToSave, null, 2));
            return {
                content: [
                    {
                        type: "text",
                        text: `Project saved: ${args.projectId}`,
                    },
                ],
            };
        },
    },
};
//# sourceMappingURL=projects.js.map