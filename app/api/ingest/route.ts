import { ingestRepository, reingestRepositoryByRepoId } from "@/lib/ingestRepo";
import { enqueueIngestJob, getIngestJob } from "@/lib/ingestQueue";
import { logIngestMetric } from "@/lib/observability";
import { invalidateRepoQueryCache } from "@/lib/queryCache";
import { guardApiRequest } from "@/lib/requestGuards";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const guardFailure = guardApiRequest(request, {
    routeKey: "ingest",
    maxRequestsPerWindow: 8,
  });
  if (guardFailure) {
    return guardFailure;
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId")?.trim() ?? "";
  if (!jobId) {
    return Response.json({ error: "jobId is required" }, { status: 400 });
  }

  const job = getIngestJob(jobId);
  if (!job) {
    return Response.json({ error: "Ingestion job not found" }, { status: 404 });
  }

  return Response.json(job);
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();

  const guardFailure = guardApiRequest(request, {
    routeKey: "ingest",
    maxRequestsPerWindow: 8,
  });
  if (guardFailure) {
    return guardFailure;
  }

  try {
    const payload = (await request.json()) as {
      repoUrl?: unknown;
      repoId?: unknown;
      defaultBranch?: unknown;
      async?: unknown;
    };

    const repoUrl = typeof payload.repoUrl === "string" ? payload.repoUrl.trim() : "";
    const repoId = typeof payload.repoId === "string" ? payload.repoId.trim() : "";
    const defaultBranch =
      typeof payload.defaultBranch === "string"
        ? payload.defaultBranch.trim()
        : undefined;
    const runAsync = payload.async === true;

    if (!repoUrl && !repoId) {
      return Response.json(
        { error: "repoUrl or repoId is required" },
        { status: 400 },
      );
    }

    if (runAsync) {
      const job = enqueueIngestJob({
        repoUrl: repoUrl || undefined,
        repoId: repoId || undefined,
        defaultBranch,
      });

      return Response.json(
        {
          mode: repoUrl ? "repoUrl" : "repoId",
          async: true,
          job,
        },
        { status: 202 },
      );
    }

    const result = repoUrl
      ? await ingestRepository(repoUrl, { defaultBranch })
      : await reingestRepositoryByRepoId(repoId);

    invalidateRepoQueryCache(result.repoId);

    const latencyMs = Date.now() - startedAt;

    await logIngestMetric({
      repoId: result.repoId,
      repoUrl: result.repoUrl,
      parsedFiles: result.parsedFiles,
      chunkCount: result.chunkCount,
      latencyMs,
      timestamp: new Date().toISOString(),
    }).catch(() => {
      return undefined;
    });

    return Response.json({
      mode: repoUrl ? "repoUrl" : "repoId",
      repoId: result.repoId,
      repoUrl: result.repoUrl,
      parsedFiles: result.parsedFiles,
      chunkCount: result.chunkCount,
      metrics: {
        latencyMs,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed";

    return Response.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
