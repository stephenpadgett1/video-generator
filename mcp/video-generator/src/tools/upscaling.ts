/**
 * Video Upscaling MCP Tools
 *
 * Tools for upscaling videos using Video2X (Real-ESRGAN, RealCUGAN, Anime4K).
 */

import { z } from "zod";
import {
  upscaleVideo,
  checkVideo2XInstalled,
  getVideo2XVersion,
  listDevices,
} from "../services/upscaling.js";

// ============================================================================
// Tool: upscale_video
// ============================================================================

const upscaleVideoTool = {
  name: "upscale_video",
  description: `Upscale a video to higher resolution using Video2X with AI models.

Supports:
- Real-ESRGAN (default): Best for real/AI-generated content like Veo outputs
- RealCUGAN: Good for anime, produces fewer artifacts
- Anime4K: Fast, optimized for anime

Scale factors: 2x, 3x, or 4x (default: 4x for 4K output)

Output naming: input.mp4 → input_4k.mp4 (or _2x/_3x for other scales)

Requirements:
- Video2X installed from https://github.com/k4yt3x/video2x/releases
- NVIDIA RTX GPU recommended (uses Vulkan acceleration)
- Processing time: ~1-5 min per 8-second clip depending on resolution`,
  inputSchema: {
    inputPath: z.string().describe("Path to input video file"),
    outputPath: z
      .string()
      .optional()
      .describe("Output path (default: auto-named with scale suffix)"),
    scale: z
      .number()
      .refine((n) => [2, 3, 4].includes(n), {
        message: "Scale must be 2, 3, or 4",
      })
      .optional()
      .default(4)
      .describe("Scale factor: 2, 3, or 4 (default: 4 for 4K)"),
    model: z
      .enum(["realesrgan", "realcugan", "anime4k"])
      .optional()
      .default("realesrgan")
      .describe("Upscaling model (default: realesrgan)"),
    gpuId: z
      .number()
      .optional()
      .default(0)
      .describe("GPU index for multi-GPU systems (default: 0)"),
  },
  handler: async (args: {
    inputPath: string;
    outputPath?: string;
    scale?: number;
    model?: "realesrgan" | "realcugan" | "anime4k";
    gpuId?: number;
  }) => {
    const result = await upscaleVideo(args.inputPath, {
      outputPath: args.outputPath,
      scale: (args.scale as 2 | 3 | 4) || 4,
      model: args.model || "realesrgan",
      gpuId: args.gpuId || 0,
    });

    const durationSec = (result.duration / 1000).toFixed(1);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              input: result.inputPath,
              output: result.outputPath,
              scale: result.scale,
              model: result.model,
              gpuId: result.gpuId,
              processingTime: `${durationSec}s`,
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
// Tool: check_video2x
// ============================================================================

const checkVideo2XTool = {
  name: "check_video2x",
  description: `Check if Video2X is installed and get version/GPU information.

Use this to verify Video2X is properly installed before attempting upscaling.
Also lists available Vulkan devices (GPUs) for the gpuId parameter.`,
  inputSchema: {},
  handler: async () => {
    const isInstalled = await checkVideo2XInstalled();
    const version = isInstalled ? await getVideo2XVersion() : null;
    const devices = isInstalled ? await listDevices() : null;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              installed: isInstalled,
              version: version,
              devices: devices,
              message: isInstalled
                ? `Video2X ${version} is installed and ready.`
                : "Video2X not found. Install from https://github.com/k4yt3x/video2x/releases",
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
// Exports
// ============================================================================

export const upscalingTools = {
  upscale_video: upscaleVideoTool,
  check_video2x: checkVideo2XTool,
};
