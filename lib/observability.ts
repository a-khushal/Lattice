import { randomUUID } from "node:crypto";
import {
  COMPLETION_INPUT_COST_PER_1K_TOKENS,
  COMPLETION_OUTPUT_COST_PER_1K_TOKENS,
  EMBEDDING_COST_PER_1K_TOKENS,
} from "@/lib/constants";
import { estimateTokenCount } from "@/lib/chunkFiles";
import type { IngestMetricEvent, QueryMetricEvent } from "@/lib/types";
import { getMetricsCollection } from "@/vector/metricsClient";

export interface MetricsDashboard {
  totalQueries: number;
  totalIngestions: number;
  avgQueryLatencyMs: number;
  avgContextCount: number;
  avgRelevanceScore: number;
  avgTokenUsage: number;
  avgEstimatedCostUsd: number;
  recentQueries: QueryMetricEvent[];
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function estimateQueryCostUsd(input: {
  embeddingTokens: number;
  completionInputTokens: number;
  completionOutputTokens: number;
}): number {
  const embeddingCost =
    (input.embeddingTokens / 1000) * EMBEDDING_COST_PER_1K_TOKENS;
  const completionInputCost =
    (input.completionInputTokens / 1000) * COMPLETION_INPUT_COST_PER_1K_TOKENS;
  const completionOutputCost =
    (input.completionOutputTokens / 1000) * COMPLETION_OUTPUT_COST_PER_1K_TOKENS;

  return embeddingCost + completionInputCost + completionOutputCost;
}

export async function logIngestMetric(event: IngestMetricEvent): Promise<void> {
  const collection = await getMetricsCollection();
  const document = JSON.stringify(event);

  await collection.add({
    ids: [randomUUID()],
    embeddings: [[0]],
    documents: [document],
    metadatas: [
      {
        eventType: "ingest",
        repoId: event.repoId,
        repoUrl: event.repoUrl,
        parsedFiles: event.parsedFiles,
        chunkCount: event.chunkCount,
        latencyMs: event.latencyMs,
        timestamp: event.timestamp,
      },
    ],
  });
}

export async function logQueryMetric(event: QueryMetricEvent): Promise<void> {
  const collection = await getMetricsCollection();
  const document = JSON.stringify(event);

  await collection.add({
    ids: [randomUUID()],
    embeddings: [[0]],
    documents: [document],
    metadatas: [
      {
        eventType: "query",
        repoId: event.repoId,
        totalLatencyMs: event.totalLatencyMs,
        retrievalLatencyMs: event.retrievalLatencyMs,
        completionLatencyMs: event.completionLatencyMs,
        contextCount: event.contextCount,
        relevanceScore: event.relevanceScore,
        tokenUsage: event.tokenUsage,
        estimatedCostUsd: event.estimatedCostUsd,
        timestamp: event.timestamp,
      },
    ],
  });
}

export async function getMetricsDashboard(
  repoId?: string,
): Promise<MetricsDashboard> {
  const collection = await getMetricsCollection();
  const result = await collection.get({
    include: ["metadatas", "documents"],
    ...(repoId ? { where: { repoId } } : {}),
  });

  const metadatas = result.metadatas ?? [];
  const documents = result.documents ?? [];

  const ingestEvents = metadatas
    .map((metadata, index) => ({
      metadata: metadata ?? {},
      document: documents[index],
    }))
    .filter((item) => asString(item.metadata?.eventType) === "ingest")
    .map((item) => {
      try {
        return JSON.parse(asString(item.document)) as IngestMetricEvent;
      } catch {
        return null;
      }
    })
    .filter((item): item is IngestMetricEvent => item !== null);

  const queryEvents = metadatas
    .map((metadata, index) => ({
      metadata: metadata ?? {},
      document: documents[index],
    }))
    .filter((item) => asString(item.metadata?.eventType) === "query")
    .map((item) => {
      try {
        return JSON.parse(asString(item.document)) as QueryMetricEvent;
      } catch {
        return null;
      }
    })
    .filter((item): item is QueryMetricEvent => item !== null)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    totalQueries: queryEvents.length,
    totalIngestions: ingestEvents.length,
    avgQueryLatencyMs: average(queryEvents.map((event) => event.totalLatencyMs)),
    avgContextCount: average(queryEvents.map((event) => event.contextCount)),
    avgRelevanceScore: average(queryEvents.map((event) => event.relevanceScore)),
    avgTokenUsage: average(queryEvents.map((event) => event.tokenUsage)),
    avgEstimatedCostUsd: average(
      queryEvents.map((event) => event.estimatedCostUsd),
    ),
    recentQueries: queryEvents.slice(0, 10),
  };
}

export function estimateTokenUsage(input: {
  question: string;
  context: string;
  answer: string;
}): {
  embeddingTokens: number;
  completionInputTokens: number;
  completionOutputTokens: number;
  totalTokens: number;
} {
  const embeddingTokens = estimateTokenCount(input.question);
  const completionInputTokens = estimateTokenCount(
    `${input.question}\n${input.context}`,
  );
  const completionOutputTokens = estimateTokenCount(input.answer);

  return {
    embeddingTokens,
    completionInputTokens,
    completionOutputTokens,
    totalTokens: embeddingTokens + completionInputTokens + completionOutputTokens,
  };
}

export function computeRelevanceScore(distances: number[]): number {
  if (distances.length === 0) {
    return 0;
  }

  const normalized = distances.map((distance) => 1 / (1 + Math.max(0, distance)));
  return average(normalized);
}
