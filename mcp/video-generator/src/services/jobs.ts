import fs from "fs";
import { JOBS_PATH } from "../utils/paths.js";
import {
  submitVeoGeneration,
  pollVeoOperation,
  downloadVeoVideo,
  VeoSubmitOptions,
} from "../clients/veo.js";

export interface Job {
  id: string;
  type: "veo-generate" | "imagen-generate";
  status: "pending" | "processing" | "complete" | "error";
  input: {
    prompt: string;
    aspectRatio?: string;
    durationSeconds?: number;
    referenceImagePath?: string;
    lastFramePath?: string;
  };
  result?: {
    operationName?: string;
    filename?: string;
    path?: string;
    duration?: number | null;
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const POLL_INTERVAL = 10000; // 10 seconds

/**
 * Load all jobs from jobs.json
 */
export function loadJobs(): Job[] {
  try {
    if (fs.existsSync(JOBS_PATH)) {
      const data = fs.readFileSync(JOBS_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading jobs:", error);
  }
  return [];
}

/**
 * Save jobs to jobs.json
 */
export function saveJobs(jobs: Job[]): void {
  fs.writeFileSync(JOBS_PATH, JSON.stringify(jobs, null, 2));
}

/**
 * Update a specific job
 */
export function updateJob(jobId: string, updates: Partial<Job>): Job | null {
  const jobs = loadJobs();
  const index = jobs.findIndex((j) => j.id === jobId);
  if (index === -1) return null;

  jobs[index] = {
    ...jobs[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveJobs(jobs);
  return jobs[index];
}

/**
 * Get a job by ID
 */
export function getJob(jobId: string): Job | null {
  const jobs = loadJobs();
  return jobs.find((j) => j.id === jobId) || null;
}

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `job_${timestamp}_${random}`;
}

/**
 * Create a new Veo generation job
 * Starts processing asynchronously and returns immediately
 */
export async function createVeoJob(input: VeoSubmitOptions): Promise<Job> {
  const job: Job = {
    id: generateJobId(),
    type: "veo-generate",
    status: "pending",
    input: {
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      durationSeconds: input.durationSeconds,
      referenceImagePath: input.referenceImagePath,
      lastFramePath: input.lastFramePath,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Add to jobs list (newest first)
  const jobs = loadJobs();
  jobs.unshift(job);
  saveJobs(jobs);

  // Start processing asynchronously (don't await)
  processVeoJob(job.id, input).catch((error) => {
    updateJob(job.id, {
      status: "error",
      error: error.message,
    });
  });

  return job;
}

/**
 * Process a Veo job - submit and start polling
 */
async function processVeoJob(jobId: string, input: VeoSubmitOptions): Promise<void> {
  // Update to processing
  updateJob(jobId, { status: "processing" });

  try {
    // Submit to Veo
    const { operationName } = await submitVeoGeneration(input);

    // Store operation name
    updateJob(jobId, {
      result: { operationName },
    });

    // Start polling (don't await - runs in background)
    pollVeoJob(jobId, operationName).catch((error) => {
      updateJob(jobId, {
        status: "error",
        error: error.message,
      });
    });
  } catch (error) {
    updateJob(jobId, {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Poll a Veo operation until complete
 */
async function pollVeoJob(jobId: string, operationName: string): Promise<void> {
  while (true) {
    const result = await pollVeoOperation(operationName);

    if (result.error) {
      updateJob(jobId, {
        status: "error",
        error: result.error,
      });
      return;
    }

    if (result.done && result.video) {
      try {
        // Download video and save to disk
        const download = await downloadVeoVideo(result);

        updateJob(jobId, {
          status: "complete",
          result: {
            operationName,
            filename: download.filename,
            path: download.path,
            duration: download.duration,
          },
        });
        return;
      } catch (error) {
        updateJob(jobId, {
          status: "error",
          error: error instanceof Error ? error.message : "Download failed",
        });
        return;
      }
    }

    // Not done yet - wait and poll again
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * Wait for a job to complete (blocking)
 * Used for frame chaining in multi-take shots
 */
export async function waitForJobComplete(
  jobId: string,
  pollInterval = 2000,
  timeout = 300000
): Promise<Job> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const job = getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status === "complete") {
      return job;
    }

    if (job.status === "error") {
      throw new Error(job.error || "Job failed");
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Job timed out after ${timeout}ms`);
}

/**
 * List jobs with optional limit
 */
export function listJobs(limit = 50): Job[] {
  const jobs = loadJobs();
  return jobs.slice(0, limit);
}
