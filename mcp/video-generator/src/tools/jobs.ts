import { z } from "zod";
import {
  createVeoJob,
  getJob,
  listJobs as listJobsService,
  type Job,
} from "../services/jobs.js";

/**
 * Jobs tools - create, get, and list generation jobs
 */

export const jobsTools = {
  create_job: {
    name: "create_job",
    title: "Create Job",
    description:
      "Create a new Veo video generation job. Returns immediately with job ID. Poll with get_job to check status.",
    inputSchema: {
      prompt: z.string().describe("Video generation prompt for Veo"),
      aspectRatio: z
        .enum(["16:9", "9:16", "1:1"])
        .optional()
        .default("9:16")
        .describe("Video aspect ratio"),
      durationSeconds: z
        .number()
        .optional()
        .default(8)
        .describe("Target duration (will snap to 4, 6, or 8 seconds)"),
      referenceImagePath: z
        .string()
        .optional()
        .describe("Path to reference image for first frame (image-to-video)"),
      lastFramePath: z
        .string()
        .optional()
        .describe("Path to target last frame image (bookending)"),
    },
    handler: async (args: {
      prompt: string;
      aspectRatio?: "16:9" | "9:16" | "1:1";
      durationSeconds?: number;
      referenceImagePath?: string;
      lastFramePath?: string;
    }) => {
      try {
        const job = await createVeoJob({
          prompt: args.prompt,
          aspectRatio: args.aspectRatio,
          durationSeconds: args.durationSeconds,
          referenceImagePath: args.referenceImagePath,
          lastFramePath: args.lastFramePath,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  jobId: job.id,
                  status: job.status,
                  message: "Job created. Poll with get_job to check status.",
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
              text: `Error creating job: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    },
  },

  get_job: {
    name: "get_job",
    title: "Get Job",
    description: "Get the current status of a generation job by ID.",
    inputSchema: {
      jobId: z.string().describe("Job ID to retrieve"),
    },
    handler: async (args: { jobId: string }) => {
      const job = getJob(args.jobId);

      if (!job) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Job not found: ${args.jobId}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(job, null, 2),
          },
        ],
      };
    },
  },

  list_jobs: {
    name: "list_jobs",
    title: "List Jobs",
    description: "List generation jobs (newest first).",
    inputSchema: {
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of jobs to return"),
    },
    handler: async (args: { limit?: number }) => {
      const jobs = listJobsService(args.limit);

      // Create summary for each job
      const summary = jobs.map((job: Job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        createdAt: job.createdAt,
        prompt: job.input.prompt.slice(0, 100) + (job.input.prompt.length > 100 ? "..." : ""),
        result: job.result?.path || null,
        error: job.error || null,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: jobs.length,
                jobs: summary,
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
