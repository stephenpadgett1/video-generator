import { z } from "zod";
import {
  startEdit,
  createTrimVariation,
  createSpeedVariation,
  selectVariation,
  storeAnalysis,
  listEdits,
  loadManifest,
  getEditDir,
} from "../services/editing.js";
import { analyzeClipUnified } from "../services/analysis.js";
import path from "path";
import fs from "fs";

/**
 * Editing tools - clip variations, trimming, speed adjustment, selection
 */

export const editingTools = {
  edit_start: {
    name: "edit_start",
    title: "Start Edit Session",
    description:
      "Start an edit session for a job. Creates edit folder, copies source video, initializes manifest.",
    inputSchema: {
      job_id: z.string().describe("Job ID to edit"),
      project_id: z.string().optional().describe("Project ID for context"),
      shot_id: z.string().optional().describe("Shot ID for context"),
      take_index: z.number().optional().describe("Take index for multi-take shots"),
      expected_dialogue: z.string().optional().describe("Expected dialogue for validation"),
    },
    handler: async (args: {
      job_id: string;
      project_id?: string;
      shot_id?: string;
      take_index?: number;
      expected_dialogue?: string;
    }) => {
      try {
        const result = await startEdit(args);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  edit_dir: result.editDir,
                  manifest: result.manifest,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error starting edit: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  edit_trim: {
    name: "edit_trim",
    title: "Create Trim Variation",
    description:
      "Create a trimmed variation of the source video. Use precise=true for frame-accurate cuts (slower).",
    inputSchema: {
      job_id: z.string().describe("Job ID"),
      trim_start: z.number().optional().default(0).describe("Start time in seconds"),
      trim_end: z.number().optional().describe("End time in seconds (default: source duration)"),
      notes: z.string().optional().describe("Notes about this variation"),
      precise: z
        .boolean()
        .optional()
        .default(false)
        .describe("Use re-encoding for frame-accurate cuts (slower but precise)"),
    },
    handler: async (args: {
      job_id: string;
      trim_start?: number;
      trim_end?: number;
      notes?: string;
      precise?: boolean;
    }) => {
      try {
        const variation = await createTrimVariation(args);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(variation, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error creating trim variation: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  edit_speed: {
    name: "edit_speed",
    title: "Create Speed Variation",
    description:
      "Create a speed-adjusted variation. Can be applied to source or stacked on a previous variation.",
    inputSchema: {
      job_id: z.string().describe("Job ID"),
      speed: z.number().describe("Speed multiplier (e.g., 1.5 for 1.5x faster, 0.8 for slower)"),
      base_variation: z.string().optional().describe("Variation ID to apply speed to (default: source)"),
      notes: z.string().optional().describe("Notes about this variation"),
    },
    handler: async (args: {
      job_id: string;
      speed: number;
      base_variation?: string;
      notes?: string;
    }) => {
      try {
        const variation = await createSpeedVariation(args);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(variation, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error creating speed variation: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  edit_select: {
    name: "edit_select",
    title: "Select Variation",
    description: "Select a variation for assembly. Marks the edit as approved.",
    inputSchema: {
      job_id: z.string().describe("Job ID"),
      variation_id: z.string().describe("Variation ID to select (e.g., v001)"),
    },
    handler: async (args: { job_id: string; variation_id: string }) => {
      try {
        const manifest = selectVariation(args.job_id, args.variation_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(manifest, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error selecting variation: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  edit_store_analysis: {
    name: "edit_store_analysis",
    title: "Store Analysis Results",
    description: "Store analysis results (from clip analyzer) in the edit manifest.",
    inputSchema: {
      job_id: z.string().describe("Job ID"),
      analysis: z.record(z.unknown()).describe("Analysis results object"),
    },
    handler: async (args: { job_id: string; analysis: Record<string, unknown> }) => {
      try {
        const manifest = storeAnalysis(args.job_id, args.analysis);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(manifest, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error storing analysis: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  edit_auto_analyze: {
    name: "edit_auto_analyze",
    title: "Auto-Analyze and Edit",
    description:
      "Run unified clip analysis and optionally create trim variation from suggestions automatically.",
    inputSchema: {
      job_id: z.string().describe("Job ID"),
      apply_suggestions: z
        .boolean()
        .optional()
        .default(false)
        .describe("Automatically create trim variation from suggestions"),
      context: z
        .object({
          dialogue: z
            .array(
              z.object({
                speaker: z.string(),
                text: z.string(),
              })
            )
            .optional(),
          duration_target: z.number().optional(),
        })
        .optional()
        .describe("Context for validation"),
    },
    handler: async (args: {
      job_id: string;
      apply_suggestions?: boolean;
      context?: { dialogue?: Array<{ speaker: string; text: string }>; duration_target?: number };
    }) => {
      try {
        // Start edit session if not exists
        const { editDir, manifest } = await startEdit({ job_id: args.job_id });

        // Run unified analysis on source
        const sourcePath = path.join(editDir, "source.mp4");
        if (!fs.existsSync(sourcePath)) {
          throw new Error("Source file not found in edit folder");
        }

        const analysis = await analyzeClipUnified(sourcePath, {
          context: args.context,
        });

        // Store analysis in manifest (cast to satisfy Record<string, unknown>)
        storeAnalysis(args.job_id, analysis as unknown as Record<string, unknown>);

        const result: Record<string, unknown> = {
          analysis,
          edit_dir: editDir,
        };

        // Apply trim suggestion if requested
        if (args.apply_suggestions && analysis.summary?.trim_recommendation) {
          const trim = analysis.summary.trim_recommendation;
          if (trim.trim_start !== undefined || trim.trim_end !== undefined) {
            const variation = await createTrimVariation({
              job_id: args.job_id,
              trim_start: trim.trim_start || 0,
              trim_end: trim.trim_end ?? undefined,
              notes: `Auto-trim from unified analysis: ${analysis.summary.recommended_action}`,
              precise: true,
            });
            result.created_variation = variation;
          }
        }

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
              text: `Error in auto-analyze: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  get_edit_manifest: {
    name: "get_edit_manifest",
    title: "Get Edit Manifest",
    description: "Get the edit manifest for a job, including all variations and status.",
    inputSchema: {
      job_id: z.string().describe("Job ID"),
    },
    handler: async (args: { job_id: string }) => {
      try {
        const manifest = loadManifest(args.job_id);
        if (!manifest) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No edit folder found for job ${args.job_id}`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(manifest, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error loading manifest: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  list_edits: {
    name: "list_edits",
    title: "List Edit Sessions",
    description: "List all edit sessions with their status and variation counts.",
    inputSchema: {},
    handler: async () => {
      try {
        const edits = listEdits();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ count: edits.length, edits }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing edits: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },
};
