import { ingestRepository, reingestRepositoryByRepoId } from "@/lib/ingestRepo";
import { logIngestMetric } from "@/lib/observability";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();

  try {
    const payload = (await request.json()) as {
      repoUrl?: unknown;
      repoId?: unknown;
      defaultBranch?: unknown;
    };

    const repoUrl = typeof payload.repoUrl === "string" ? payload.repoUrl.trim() : "";
    const repoId = typeof payload.repoId === "string" ? payload.repoId.trim() : "";
    const defaultBranch =
      typeof payload.defaultBranch === "string"
        ? payload.defaultBranch.trim()
        : undefined;

    if (!repoUrl && !repoId) {
      return Response.json(
        { error: "repoUrl or repoId is required" },
        { status: 400 },
      );
    }

    const result = repoUrl
      ? await ingestRepository(repoUrl, { defaultBranch })
      : await reingestRepositoryByRepoId(repoId);

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
