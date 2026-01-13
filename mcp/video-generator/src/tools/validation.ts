import { z } from "zod";
import {
  validateProject,
  validateProjectStructure,
  validateNarrativeArc,
  validateVeoFeasibility,
  validateAudioSettings,
  validateTransitions,
  validateProductionRules,
  validateDialogue,
  VALID_ARCS,
  VALID_MOODS,
  VALID_ROLES,
  VALID_PRODUCTION_STYLES,
} from "../services/validation.js";
import { loadProject } from "../services/projects.js";

/**
 * Validation tools - project validation with multiple validator options
 */

export const validationTools = {
  validate_project: {
    name: "validate_project",
    title: "Validate Project",
    description:
      "Run validation checks on a project. Can run all validators or specific ones. Returns issues (blocking) and warnings (non-blocking).",
    inputSchema: {
      project: z.record(z.string(), z.any()).describe("Project data to validate"),
      validators: z
        .array(
          z.enum([
            "structure",
            "narrative",
            "feasibility",
            "audio",
            "transitions",
            "production",
            "dialogue",
          ])
        )
        .optional()
        .describe("Specific validators to run (default: all)"),
    },
    handler: async (args: {
      project: Record<string, unknown>;
      validators?: string[];
    }) => {
      try {
        const project = args.project as Parameters<typeof validateProject>[0];

        // If specific validators requested, run only those
        if (args.validators && args.validators.length > 0) {
          const results: Record<string, unknown> = {};

          for (const validator of args.validators) {
            switch (validator) {
              case "structure":
                results.structure = validateProjectStructure(project);
                break;
              case "narrative":
                results.narrative = validateNarrativeArc(project);
                break;
              case "feasibility":
                results.feasibility = validateVeoFeasibility(project);
                break;
              case "audio":
                results.audio = validateAudioSettings(project);
                break;
              case "transitions":
                results.transitions = validateTransitions(project);
                break;
              case "production":
                results.production = validateProductionRules(project);
                break;
              case "dialogue":
                results.dialogue = validateDialogue(project);
                break;
            }
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        // Run all validators
        const result = validateProject(project);
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
              text: `Error validating project: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  validate_project_by_id: {
    name: "validate_project_by_id",
    title: "Validate Project by ID",
    description: "Load a project by ID and run validation checks on it.",
    inputSchema: {
      project_id: z.string().describe("Project ID to validate"),
      validators: z
        .array(
          z.enum([
            "structure",
            "narrative",
            "feasibility",
            "audio",
            "transitions",
            "production",
            "dialogue",
          ])
        )
        .optional()
        .describe("Specific validators to run (default: all)"),
    },
    handler: async (args: { project_id: string; validators?: string[] }) => {
      try {
        const project = loadProject(args.project_id);
        if (!project) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Project not found: ${args.project_id}`,
              },
            ],
          };
        }

        // If specific validators requested, run only those
        if (args.validators && args.validators.length > 0) {
          const results: Record<string, unknown> = {};

          for (const validator of args.validators) {
            switch (validator) {
              case "structure":
                results.structure = validateProjectStructure(project);
                break;
              case "narrative":
                results.narrative = validateNarrativeArc(project);
                break;
              case "feasibility":
                results.feasibility = validateVeoFeasibility(project);
                break;
              case "audio":
                results.audio = validateAudioSettings(project);
                break;
              case "transitions":
                results.transitions = validateTransitions(project);
                break;
              case "production":
                results.production = validateProductionRules(project);
                break;
              case "dialogue":
                results.dialogue = validateDialogue(project);
                break;
            }
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ project_id: args.project_id, ...results }, null, 2),
              },
            ],
          };
        }

        // Run all validators
        const result = validateProject(project);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ project_id: args.project_id, ...result }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error validating project: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  get_validation_constants: {
    name: "get_validation_constants",
    title: "Get Validation Constants",
    description: "Get the validation constants: valid arcs, moods, roles, and production styles.",
    inputSchema: {},
    handler: async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                arcs: VALID_ARCS,
                moods: VALID_MOODS,
                roles: VALID_ROLES,
                production_styles: VALID_PRODUCTION_STYLES.filter(Boolean),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },
};
