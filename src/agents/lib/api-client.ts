/**
 * API client for video-generator server (localhost:3000)
 */

import type {
  Project,
  Job,
  ExecuteResult,
  AssemblyResult,
  Character,
  Environment,
  ElevenLabsVoice,
  ArcType,
  ProductionStyle
} from '../types.js';

const BASE_URL = 'http://localhost:3000';

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

async function retryFetch<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`  Retry ${i + 1}/${retries} after error: ${err}`);
      await sleep(delay * (i + 1));
    }
  }
  throw new Error('Unreachable');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function generateProject(params: {
  concept: string;
  duration: number;
  arc: ArcType;
  style?: string;
  include_vo?: boolean;
  production_style?: ProductionStyle;
}): Promise<Project> {
  return retryFetch(() =>
    fetchJson<Project>('/api/generate-project-from-structure', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  );
}

export async function lockCharacter(
  character: Character,
  style?: string
): Promise<Character> {
  const result = await retryFetch(() =>
    fetchJson<{ character_id: string; base_image_path: string; locked_description: string }>(
      '/api/lock-character',
      {
        method: 'POST',
        body: JSON.stringify({ character, style }),
      }
    )
  );

  return {
    ...character,
    base_image_path: result.base_image_path,
    locked_description: result.locked_description,
  };
}

export async function lockEnvironment(
  environment: Environment,
  style?: string
): Promise<Environment> {
  const result = await retryFetch(() =>
    fetchJson<{ environment_id: string; base_image_path: string; locked_description: string }>(
      '/api/lock-environment',
      {
        method: 'POST',
        body: JSON.stringify({ environment, style }),
      }
    )
  );

  return {
    ...environment,
    base_image_path: result.base_image_path,
    locked_description: result.locked_description,
  };
}

export async function executeProject(
  project: Project,
  aspectRatio: '9:16' | '16:9' = '9:16'
): Promise<ExecuteResult> {
  return retryFetch(() =>
    fetchJson<ExecuteResult>('/api/execute-project', {
      method: 'POST',
      body: JSON.stringify({ project, aspectRatio }),
    })
  );
}

export async function getJob(jobId: string): Promise<Job> {
  return fetchJson<Job>(`/api/jobs/${jobId}`);
}

export async function waitForJobs(
  jobIds: string[],
  onProgress?: (completed: number, total: number, current?: Job) => void,
  timeoutMs = 600000 // 10 minutes
): Promise<Map<string, Job>> {
  const completed = new Map<string, Job>();
  const startTime = Date.now();

  while (completed.size < jobIds.length) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for jobs after ${timeoutMs / 1000}s`);
    }

    for (const jobId of jobIds) {
      if (completed.has(jobId)) continue;

      const job = await getJob(jobId);

      if (job.status === 'complete') {
        completed.set(jobId, job);
        onProgress?.(completed.size, jobIds.length, job);
      } else if (job.status === 'error') {
        throw new Error(`Job ${jobId} failed: ${job.error}`);
      }
    }

    if (completed.size < jobIds.length) {
      await sleep(5000); // Poll every 5 seconds
    }
  }

  return completed;
}

export async function assemble(params: {
  project_id: string;
  voice_id?: string;
  outputFilename?: string;
}): Promise<AssemblyResult> {
  return retryFetch(() =>
    fetchJson<AssemblyResult>('/api/assemble', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  );
}

export async function getVoices(): Promise<ElevenLabsVoice[]> {
  const result = await fetchJson<{ voices: ElevenLabsVoice[] }>('/api/elevenlabs/voices');
  return result.voices;
}

export async function healthCheck(): Promise<boolean> {
  try {
    await fetchJson('/api/config');
    return true;
  } catch {
    return false;
  }
}
