/**
 * Face Detection MCP Tools
 *
 * Tools for detecting faces in video clips and clustering them into characters.
 */

import { z } from "zod";
import {
  detectFacesForClip,
  batchDetectFaces,
  clusterCharacters,
  searchClipsByCharacter,
  listCharacters,
  getCharacter,
  findCharacterByImage,
  updateCharacter,
} from "../services/face-detection.js";

// ============================================================================
// Tool: detect_faces_in_clip
// ============================================================================

const detectFacesInClipTool = {
  name: "detect_faces_in_clip",
  description: `Detect faces in a clip's extracted frames and compute embeddings.

Requires frames to be extracted first (via extract_clip_metadata with skipExisting: false).
Returns face locations and 128-dimensional embeddings for each detected face.

Note: This uses the Python face_recognition library (dlib-based). Ensure Python dependencies are installed:
  cd scripts/face-detection && pip install -r requirements.txt`,
  inputSchema: {
    clipId: z.string().describe("Clip ID to process"),
    reprocess: z
      .boolean()
      .optional()
      .default(false)
      .describe("Re-detect even if faces already stored"),
  },
  handler: async (args: { clipId: string; reprocess?: boolean }) => {
    const result = await detectFacesForClip(args.clipId, {
      reprocess: args.reprocess,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              clip_id: result.clip_id,
              faces_detected: result.faces_detected,
              faces: result.faces.map((f) => ({
                face_id: f.face_id,
                frame_timestamp: f.frame_timestamp,
                location: f.location,
                character_id: f.character_id,
                // Omit embedding from output (too large)
              })),
              errors: result.errors,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

// ============================================================================
// Tool: batch_detect_faces
// ============================================================================

const batchDetectFacesTool = {
  name: "batch_detect_faces",
  description: `Process multiple clips for face detection.

Detects faces in all clips that have extracted frames.
Use skipExisting: true to only process clips without face data.

Note: Frames must be extracted first. For clips without frames, run:
  extract_clip_metadata(videoPath, { skipExisting: false })`,
  inputSchema: {
    limit: z.number().optional().describe("Max clips to process"),
    skipExisting: z
      .boolean()
      .optional()
      .default(true)
      .describe("Skip clips that already have face data"),
    projectId: z.string().optional().describe("Filter by project ID"),
  },
  handler: async (args: {
    limit?: number;
    skipExisting?: boolean;
    projectId?: string;
  }) => {
    const result = await batchDetectFaces({
      limit: args.limit,
      skipExisting: args.skipExisting,
      projectId: args.projectId,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              processed: result.processed,
              skipped: result.skipped,
              failed: result.failed,
              total_faces: result.total_faces,
              clips: result.clips.slice(0, 50), // Limit output size
              clips_truncated: result.clips.length > 50,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

// ============================================================================
// Tool: cluster_characters
// ============================================================================

const clusterCharactersTool = {
  name: "cluster_characters",
  description: `Cluster detected faces into character groups using DBSCAN.

Should be run after face detection is complete on clips.
Updates clip metadata with character_id assignments and creates/updates characters.json.

Parameters:
- eps: DBSCAN epsilon (distance threshold). Lower = stricter matching. Default 0.5 for ~85% accuracy.
- minSamples: Minimum faces to form a character. Default 2 (a character needs to appear at least twice).`,
  inputSchema: {
    eps: z
      .number()
      .optional()
      .default(0.5)
      .describe("DBSCAN epsilon - distance threshold for same character (0.4-0.6 typical)"),
    minSamples: z
      .number()
      .optional()
      .default(2)
      .describe("Minimum faces to form a character cluster"),
    recluster: z
      .boolean()
      .optional()
      .default(false)
      .describe("Re-cluster even if characters.json exists"),
  },
  handler: async (args: {
    eps?: number;
    minSamples?: number;
    recluster?: boolean;
  }) => {
    const result = await clusterCharacters({
      eps: args.eps,
      minSamples: args.minSamples,
      recluster: args.recluster,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              characters_found: result.characters_found,
              faces_assigned: result.faces_assigned,
              faces_unassigned: result.faces_unassigned,
              characters: result.characters.map((c) => ({
                character_id: c.character_id,
                occurrence_count: c.occurrence_count,
                clip_count: c.clip_ids.length,
                clip_ids: c.clip_ids.slice(0, 10),
                clips_truncated: c.clip_ids.length > 10,
                // Omit centroid from output (too large)
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

// ============================================================================
// Tool: list_characters
// ============================================================================

const listCharactersTool = {
  name: "list_characters",
  description: `List all detected characters with their occurrence counts.`,
  inputSchema: {},
  handler: async () => {
    const characters = listCharacters();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              total_characters: characters.length,
              characters: characters.sort(
                (a, b) => b.occurrence_count - a.occurrence_count
              ),
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

// ============================================================================
// Tool: get_character
// ============================================================================

const getCharacterTool = {
  name: "get_character",
  description: `Get detailed information about a specific character including all clips they appear in.`,
  inputSchema: {
    characterId: z.string().describe("Character ID (e.g., char_001)"),
  },
  handler: async (args: { characterId: string }) => {
    const character = getCharacter(args.characterId);

    if (!character) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: `Character not found: ${args.characterId}` },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              character_id: character.character_id,
              occurrence_count: character.occurrence_count,
              clip_ids: character.clip_ids,
              face_ids: character.face_ids,
              representative_frame: character.representative_frame,
              metadata: character.metadata,
              // User-annotated fields
              name: character.name,
              description: character.description,
              generation_prompt: character.generation_prompt,
              tags: character.tags,
              notes: character.notes,
              // Omit centroid from output
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

// ============================================================================
// Tool: update_character
// ============================================================================

const updateCharacterTool = {
  name: "update_character",
  description: `Update user-annotated metadata for a character.

Use this to add human-readable names, descriptions, generation prompts, and tags.
Only provided fields are updated; omitted fields remain unchanged.`,
  inputSchema: {
    characterId: z.string().describe("Character ID (e.g., char_001)"),
    name: z.string().optional().describe("Human-readable name (e.g., 'Sagittarius Archer')"),
    description: z
      .string()
      .optional()
      .describe("Plain language description of appearance"),
    generation_prompt: z
      .string()
      .optional()
      .describe("Prompt to generate a similar-looking character"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Searchable tags (e.g., ['archer', 'fantasy', 'female'])"),
    notes: z.string().optional().describe("Freeform notes"),
  },
  handler: async (args: {
    characterId: string;
    name?: string;
    description?: string;
    generation_prompt?: string;
    tags?: string[];
    notes?: string;
  }) => {
    try {
      const character = updateCharacter(args.characterId, {
        name: args.name,
        description: args.description,
        generation_prompt: args.generation_prompt,
        tags: args.tags,
        notes: args.notes,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "updated",
                character_id: character.character_id,
                name: character.name,
                description: character.description,
                generation_prompt: character.generation_prompt,
                tags: character.tags,
                notes: character.notes,
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
            text: JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  },
};

// ============================================================================
// Tool: search_clips_by_character
// ============================================================================

const searchClipsByCharacterTool = {
  name: "search_clips_by_character",
  description: `Find all clips containing a specific character.`,
  inputSchema: {
    characterId: z.string().describe("Character ID to search for"),
  },
  handler: async (args: { characterId: string }) => {
    const clipIds = searchClipsByCharacter(args.characterId);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              character_id: args.characterId,
              clip_count: clipIds.length,
              clip_ids: clipIds,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

// ============================================================================
// Tool: find_character_by_image
// ============================================================================

const findCharacterByImageTool = {
  name: "find_character_by_image",
  description: `Find which character(s) match a face in an image.

Detects face in the provided image and compares against known character centroids.
Returns matching characters with distance scores (lower = better match).`,
  inputSchema: {
    imagePath: z.string().describe("Path to image containing a face"),
    threshold: z
      .number()
      .optional()
      .default(0.5)
      .describe("Maximum distance threshold for a match (lower = stricter)"),
  },
  handler: async (args: { imagePath: string; threshold?: number }) => {
    try {
      const matches = await findCharacterByImage(args.imagePath, args.threshold);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                image_path: args.imagePath,
                matches_found: matches.length,
                matches: matches,
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
            text: JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  },
};

// ============================================================================
// Export all tools
// ============================================================================

export const faceDetectionTools = {
  detect_faces_in_clip: detectFacesInClipTool,
  batch_detect_faces: batchDetectFacesTool,
  cluster_characters: clusterCharactersTool,
  list_characters: listCharactersTool,
  get_character: getCharacterTool,
  update_character: updateCharacterTool,
  search_clips_by_character: searchClipsByCharacterTool,
  find_character_by_image: findCharacterByImageTool,
};
