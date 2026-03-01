import { generateAnswer } from "@/lib/generateAnswer";
import {
  retrieveContext,
  buildContextWindow,
  computeRetrievalAccuracyProxy,
  suggestContributionEntryPoints,
} from "@/lib/retrieveContext";
import {
  computeRelevanceScore,
  estimateQueryCostUsd,
  estimateTokenUsage,
  logQueryMetric,
} from "@/lib/observability";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const totalStart = Date.now();

  try {
    const payload = (await request.json()) as {
      question?: unknown;
      repoId?: unknown;
    };

    const question =
      typeof payload.question === "string" ? payload.question.trim() : "";
    const repoId = typeof payload.repoId === "string" ? payload.repoId.trim() : "";

    if (!question || !repoId) {
      return Response.json(
        { error: "question and repoId are required" },
        { status: 400 },
      );
    }

    const retrievalStart = Date.now();
    const chunks = await retrieveContext(question, repoId);
    const retrievalLatencyMs = Date.now() - retrievalStart;

    const completionStart = Date.now();
    const answer = await generateAnswer(question, chunks);
    const completionLatencyMs = Date.now() - completionStart;
    const totalLatencyMs = Date.now() - totalStart;

    const contextWindow = buildContextWindow(chunks);
    const usage = estimateTokenUsage({
      question,
      context: contextWindow,
      answer,
    });

    const estimatedCostUsd = estimateQueryCostUsd({
      embeddingTokens: usage.embeddingTokens,
      completionInputTokens: usage.completionInputTokens,
      completionOutputTokens: usage.completionOutputTokens,
    });

    const relevanceScore = computeRelevanceScore(
      chunks.map((chunk) => chunk.distance),
    );
    const retrievalAccuracyProxy = computeRetrievalAccuracyProxy(chunks);
    const entryPoints = suggestContributionEntryPoints(chunks);

    await logQueryMetric({
      repoId,
      question,
      answer,
      retrievalLatencyMs,
      completionLatencyMs,
      totalLatencyMs,
      contextCount: chunks.length,
      relevanceScore,
      retrievalAccuracyProxy,
      tokenUsage: usage.totalTokens,
      estimatedCostUsd,
      timestamp: new Date().toISOString(),
    }).catch(() => {
      return undefined;
    });

    return Response.json({
      answer,
      contextCount: chunks.length,
      metrics: {
        retrievalLatencyMs,
        completionLatencyMs,
        totalLatencyMs,
        relevanceScore,
        retrievalAccuracyProxy,
        tokenUsage: usage.totalTokens,
        estimatedCostUsd,
      },
      entryPoints,
      sources: chunks.map((chunk) => ({
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";

    return Response.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
