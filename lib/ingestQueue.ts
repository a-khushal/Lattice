import { randomUUID } from "node:crypto";
import { ingestRepository, reingestRepositoryByRepoId } from "@/lib/ingestRepo";
import { logIngestMetric } from "@/lib/observability";
import { invalidateRepoQueryCache } from "@/lib/queryCache";
import type { IngestResult } from "@/lib/types";

export type IngestJobStatus = "queued" | "running" | "succeeded" | "failed";

interface IngestJobRecord {
  jobId: string;
  status: IngestJobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  repoUrl?: string;
  repoId?: string;
  defaultBranch?: string;
  result?: IngestResult;
  error?: string;
}

interface IngestQueueInput {
  repoUrl?: string;
  repoId?: string;
  defaultBranch?: string;
}

export interface IngestJobResponse {
  jobId: string;
  status: IngestJobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  repoUrl?: string;
  repoId?: string;
  result?: IngestResult;
  error?: string;
}

const jobStore = new Map<string, IngestJobRecord>();
const queue: string[] = [];

let workerRunning = false;

function toResponse(job: IngestJobRecord): IngestJobResponse {
  return {
    jobId: job.jobId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    repoUrl: job.repoUrl,
    repoId: job.repoId,
    result: job.result,
    error: job.error,
  };
}

async function processQueue(): Promise<void> {
  if (workerRunning) {
    return;
  }

  workerRunning = true;

  while (queue.length > 0) {
    const nextJobId = queue.shift();
    if (!nextJobId) {
      continue;
    }

    const job = jobStore.get(nextJobId);
    if (!job || job.status !== "queued") {
      continue;
    }

    const startedAtMs = Date.now();
    job.status = "running";
    job.startedAt = new Date(startedAtMs).toISOString();
    jobStore.set(job.jobId, job);

    try {
      const result = job.repoUrl
        ? await ingestRepository(job.repoUrl, { defaultBranch: job.defaultBranch })
        : await reingestRepositoryByRepoId(job.repoId ?? "");

      job.status = "succeeded";
      job.finishedAt = new Date().toISOString();
      job.result = result;
      job.repoId = result.repoId;
      job.repoUrl = result.repoUrl;

      invalidateRepoQueryCache(result.repoId);

      await logIngestMetric({
        repoId: result.repoId,
        repoUrl: result.repoUrl,
        parsedFiles: result.parsedFiles,
        chunkCount: result.chunkCount,
        latencyMs: Date.now() - startedAtMs,
        timestamp: new Date().toISOString(),
      }).catch(() => {
        return undefined;
      });
    } catch (error) {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : "Ingestion job failed";
    }

    jobStore.set(job.jobId, job);
  }

  workerRunning = false;
}

export function enqueueIngestJob(input: IngestQueueInput): IngestJobResponse {
  const jobId = randomUUID();
  const createdAt = new Date().toISOString();

  const job: IngestJobRecord = {
    jobId,
    status: "queued",
    createdAt,
    repoUrl: input.repoUrl,
    repoId: input.repoId,
    defaultBranch: input.defaultBranch,
  };

  jobStore.set(jobId, job);
  queue.push(jobId);

  void processQueue();

  return toResponse(job);
}

export function getIngestJob(jobId: string): IngestJobResponse | null {
  const job = jobStore.get(jobId);
  if (!job) {
    return null;
  }

  return toResponse(job);
}
