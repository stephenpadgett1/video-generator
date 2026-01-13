/**
 * Clip Metadata MCP Tools
 *
 * Tools for extracting, storing, and searching clip metadata.
 */

import { z } from "zod";
import {
  extractClipMetadata,
  completeClipMetadata,
  loadClipMetadata,
  searchClips,
  rebuildClipIndex,
  batchExtractMetadata,
  savePartialMetadata,
  listClipsWithMetadata,
  describeClipFrames,
  listPendingClips,
  type FrameDescription,
  type ClipMetadata,
  type SearchOptions,
} from "../services/clip-metadata.js";

// ============================================================================
// Tool: extract_clip_metadata
// ============================================================================

const extractClipMetadataTool = {
  name: "extract_clip_metadata",
  description: `Extract comprehensive metadata from a video clip.

Returns technical data (duration, resolution, codec), audio analysis (Whisper transcription, speech segments, silences),
visual detection (scene changes, black/freeze frames), and extracted frame paths for Claude to describe.

Workflow:
1. Call this tool to extract metadata and frames
2. View each returned frame path with the Read tool
3. Generate descriptions for each frame
4. Call complete_clip_metadata with the descriptions to save the final metadata`,
  inputSchema: {
    videoPath: z.string().describe("Path to video file (absolute or relative to project root)"),
    includeTranscription: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include Whisper transcription (default: true)"),
    skipExisting: z
      .boolean()
      .optional()
      .default(true)
      .describe("Skip if metadata already exists (default: true)"),
  },
  handler: async (args: {
    videoPath: string;
    includeTranscription?: boolean;
    skipExisting?: boolean;
  }) => {
    const result = await extractClipMetadata(args.videoPath, {
      includeTranscription: args.includeTranscription,
      skipExisting: args.skipExisting,
    });

    if (result.metadata_exists) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "already_exists",
                clip_id: result.partial.clip_id,
                message: "Metadata already exists for this clip",
                technical: result.partial.technical,
                has_speech: result.partial.audio.has_speech,
                transcription_preview: result.partial.audio.transcription?.full_text?.slice(0, 200),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Save partial for later completion
    savePartialMetadata(result.partial);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "pending_descriptions",
              clip_id: result.partial.clip_id,
              filename: result.partial.filename,
              technical: result.partial.technical,
              audio: {
                has_speech: result.partial.audio.has_speech,
                speech_coverage: result.partial.audio.speech_coverage,
                transcription_preview: result.partial.audio.transcription?.full_text?.slice(0, 300),
                word_count: result.partial.audio.transcription?.word_count || 0,
              },
              visual: {
                scene_changes: result.partial.visual.scene_changes.length,
                black_frames: result.partial.visual.black_frames.length,
                freeze_frames: result.partial.visual.freeze_frames.length,
                has_discontinuities: result.partial.visual.has_discontinuities,
              },
              provenance: result.partial.provenance,
              frames_to_describe: result.frame_paths.map((p, i) => ({
                path: p,
                timestamp: result.partial.frame_contexts[i]?.timestamp,
                context: result.partial.frame_contexts[i]?.context,
              })),
              next_steps: [
                "1. View each frame path with the Read tool",
                "2. Generate a 50-100 word description for each frame",
                "3. Call complete_clip_metadata with the descriptions",
              ],
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
// Tool: complete_clip_metadata
// ============================================================================

const completeClipMetadataTool = {
  name: "complete_clip_metadata",
  description: `Complete clip metadata by adding frame descriptions.

Call this after extract_clip_metadata and viewing/describing the extracted frames.
Saves the complete metadata to docs/clip-metadata/clips.json`,
  inputSchema: {
    clipId: z.string().describe("Clip ID from extract_clip_metadata"),
    descriptions: z
      .array(
        z.object({
          timestamp: z.number().describe("Frame timestamp in seconds"),
          description: z.string().describe("50-100 word visual description of the frame"),
          context: z
            .enum(["start", "middle", "end", "pre_discontinuity", "post_discontinuity"])
            .describe("Context of when this frame appears"),
        })
      )
      .describe("Frame descriptions from viewing the extracted frames"),
    overallSummary: z.string().describe("2-3 sentence summary of the entire clip content"),
  },
  handler: async (args: {
    clipId: string;
    descriptions: FrameDescription[];
    overallSummary: string;
  }) => {
    const metadata = await completeClipMetadata(
      args.clipId,
      args.descriptions,
      args.overallSummary
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "completed",
              clip_id: metadata.clip_id,
              path: metadata.path,
              metadata_saved: `docs/clip-metadata/clips/${metadata.clip_id}.json`,
              tags: metadata.tags,
              summary: {
                duration: metadata.technical.duration,
                has_speech: metadata.audio.has_speech,
                frame_count: metadata.frames.descriptions.length,
                overall_summary: metadata.frames.overall_summary,
              },
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
// Tool: get_clip_metadata
// ============================================================================

const getClipMetadataTool = {
  name: "get_clip_metadata",
  description: "Load existing metadata for a clip by ID.",
  inputSchema: {
    clipId: z.string().describe("Clip ID (filename without extension)"),
  },
  handler: async (args: { clipId: string }) => {
    const metadata = loadClipMetadata(args.clipId);

    if (!metadata) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ found: false, clipId: args.clipId }, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ found: true, metadata }, null, 2),
        },
      ],
    };
  },
};

// ============================================================================
// Tool: search_clips
// ============================================================================

const searchClipsTool = {
  name: "search_clips",
  description: `Search clip metadata with flexible queries.

Supports full-text search in transcriptions and descriptions, filtering by speech, duration, aspect ratio, project, and tags.`,
  inputSchema: {
    query: z.string().optional().describe("Full-text search in transcription and descriptions"),
    has_speech: z.boolean().optional().describe("Filter by clips with/without speech"),
    min_duration: z.number().optional().describe("Minimum duration in seconds"),
    max_duration: z.number().optional().describe("Maximum duration in seconds"),
    aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).optional().describe("Filter by aspect ratio"),
    project_id: z.string().optional().describe("Filter by project ID"),
    tags: z.array(z.string()).optional().describe("Filter by tags (match any)"),
    limit: z.number().optional().default(20).describe("Maximum results to return"),
  },
  handler: async (args: SearchOptions) => {
    const results = searchClips(args);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  },
};

// ============================================================================
// Tool: rebuild_clip_index
// ============================================================================

const rebuildClipIndexTool = {
  name: "rebuild_clip_index",
  description: "Rebuild the clip metadata search index from all metadata files.",
  inputSchema: {},
  handler: async () => {
    const index = rebuildClipIndex();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "rebuilt",
              total_clips: index.total_clips,
              projects: Object.keys(index.by_project).length,
              with_speech: index.by_has_speech.with.length,
              without_speech: index.by_has_speech.without.length,
              keywords: Object.keys(index.keywords).length,
              index_path: "docs/clip-metadata/index.json",
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
// Tool: batch_extract_metadata
// ============================================================================

const batchExtractMetadataTool = {
  name: "batch_extract_metadata",
  description: `Extract metadata for multiple clips in a directory.

Runs analysis on each clip and returns frame paths for description.
Use skipExisting: true (default) to only process new clips.

Note: Frame descriptions still need to be added via complete_clip_metadata for each clip.`,
  inputSchema: {
    directory: z
      .string()
      .optional()
      .default("data/video")
      .describe("Directory containing video files"),
    pattern: z.string().optional().default("*.mp4").describe("Glob pattern for files"),
    limit: z.number().optional().describe("Maximum clips to process"),
    skipExisting: z
      .boolean()
      .optional()
      .default(true)
      .describe("Skip clips with existing metadata"),
  },
  handler: async (args: {
    directory?: string;
    pattern?: string;
    limit?: number;
    skipExisting?: boolean;
  }) => {
    const result = await batchExtractMetadata(args);

    // Group by status
    const needsDescriptions = result.clips.filter((c) => !c.skipped && !c.error);
    const errors = result.clips.filter((c) => c.error);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              summary: {
                processed: result.processed,
                skipped: result.skipped,
                failed: result.failed,
                total: result.clips.length,
              },
              needs_descriptions: needsDescriptions.map((c) => ({
                clip_id: c.clip_id,
                frame_count: c.frame_paths.length,
                frame_paths: c.frame_paths,
              })),
              errors: errors.map((c) => ({ clip_id: c.clip_id, error: c.error })),
              next_steps:
                needsDescriptions.length > 0
                  ? [
                      `${needsDescriptions.length} clips need frame descriptions`,
                      "For each clip: view frames with Read tool, then call complete_clip_metadata",
                    ]
                  : ["All clips already have metadata or failed"],
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
// Tool: list_clip_metadata
// ============================================================================

const listClipMetadataTool = {
  name: "list_clip_metadata",
  description: "List all clips that have metadata extracted.",
  inputSchema: {},
  handler: async () => {
    const clipIds = listClipsWithMetadata();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              total: clipIds.length,
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
// Tool: describe_clip_frames
// ============================================================================

const describeClipFramesTool = {
  name: "describe_clip_frames",
  description: `Generate frame descriptions for a single clip using Claude Vision API (Opus 4.5).

Reads partial metadata from data/temp/partial_{clipId}.json, sends extracted frame images to Claude,
and returns structured descriptions.

Use autoComplete=true to automatically save the metadata, or false to review first.`,
  inputSchema: {
    clipId: z.string().describe("Clip ID (filename without extension)"),
    model: z
      .string()
      .optional()
      .default("claude-opus-4-5-20251101")
      .describe("Claude model to use"),
    autoComplete: z
      .boolean()
      .optional()
      .default(false)
      .describe("Automatically save to clips.json (skip review)"),
  },
  handler: async (args: { clipId: string; model?: string; autoComplete?: boolean }) => {
    const result = await describeClipFrames(args.clipId, { model: args.model });

    if (args.autoComplete) {
      const metadata = await completeClipMetadata(
        args.clipId,
        result.descriptions,
        result.overallSummary
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "completed",
                clip_id: metadata.clip_id,
                descriptions: result.descriptions,
                overall_summary: result.overallSummary,
                tags: metadata.tags,
                tokens_used: result.tokensUsed,
              },
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
              status: "pending_review",
              clip_id: args.clipId,
              descriptions: result.descriptions,
              overall_summary: result.overallSummary,
              tokens_used: result.tokensUsed,
              next_step: "Call complete_clip_metadata to save, or edit descriptions first",
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
// Tool: batch_describe_frames
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const batchDescribeFramesTool = {
  name: "batch_describe_frames",
  description: `Process multiple pending clips with Claude Vision API.

Reads all partial_*.json files from data/temp/, generates descriptions for each,
and optionally completes metadata automatically.

Includes rate limiting (2s delay between clips by default, exponential backoff on 429).`,
  inputSchema: {
    limit: z.number().optional().describe("Max clips to process (default: all)"),
    project_id: z.string().optional().describe("Filter by project_id in provenance"),
    autoComplete: z
      .boolean()
      .optional()
      .default(true)
      .describe("Automatically save completed metadata"),
    delayBetweenClips: z
      .number()
      .optional()
      .default(2000)
      .describe("Milliseconds to wait between clips"),
    dryRun: z
      .boolean()
      .optional()
      .default(false)
      .describe("Report what would be processed without calling API"),
  },
  handler: async (args: {
    limit?: number;
    project_id?: string;
    autoComplete?: boolean;
    delayBetweenClips?: number;
    dryRun?: boolean;
  }) => {
    // Find all pending clips
    let candidates = listPendingClips();

    // Filter by project_id if specified
    if (args.project_id) {
      candidates = candidates.filter((c) => c.projectId === args.project_id);
    }

    // Apply limit
    if (args.limit) {
      candidates = candidates.slice(0, args.limit);
    }

    if (args.dryRun) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                mode: "dry_run",
                clips_found: candidates.length,
                clips: candidates.map((c) => ({
                  clip_id: c.clipId,
                  frame_count: c.frameCount,
                  project_id: c.projectId,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const results: Array<{
      clip_id: string;
      status: "completed" | "error";
      tokens_used?: { input: number; output: number };
      error?: string;
    }> = [];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let i = 0; i < candidates.length; i++) {
      const { clipId } = candidates[i];

      try {
        const descResult = await describeClipFrames(clipId);

        if (args.autoComplete) {
          await completeClipMetadata(
            clipId,
            descResult.descriptions,
            descResult.overallSummary
          );
        }

        totalInputTokens += descResult.tokensUsed.input;
        totalOutputTokens += descResult.tokensUsed.output;

        results.push({
          clip_id: clipId,
          status: "completed",
          tokens_used: descResult.tokensUsed,
        });
      } catch (error) {
        results.push({
          clip_id: clipId,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Rate limiting between clips
      if (i < candidates.length - 1) {
        await sleep(args.delayBetweenClips || 2000);
      }
    }

    const completed = results.filter((r) => r.status === "completed").length;
    const failed = results.filter((r) => r.status === "error").length;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              summary: {
                total: candidates.length,
                completed,
                failed,
                total_tokens: {
                  input: totalInputTokens,
                  output: totalOutputTokens,
                },
              },
              results,
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
// Export all tools
// ============================================================================

export const clipMetadataTools = {
  extract_clip_metadata: extractClipMetadataTool,
  complete_clip_metadata: completeClipMetadataTool,
  get_clip_metadata: getClipMetadataTool,
  search_clips: searchClipsTool,
  rebuild_clip_index: rebuildClipIndexTool,
  batch_extract_metadata: batchExtractMetadataTool,
  list_clip_metadata: listClipMetadataTool,
  describe_clip_frames: describeClipFramesTool,
  batch_describe_frames: batchDescribeFramesTool,
};
