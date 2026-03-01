import {
  CONTEXT_MAX_TOKENS,
  RETRIEVAL_MAX_RESULTS,
  RETRIEVAL_MIN_RESULTS,
  RETRIEVAL_QUERY_CANDIDATES,
} from "@/lib/constants";
import { estimateTokenCount } from "@/lib/chunkFiles";
import { embedTexts } from "@/lib/embedChunks";
import { computeBm25Scores, reciprocalRankFusion } from "@/lib/hybridSearch";
import type { RetrievedChunk } from "@/lib/types";
import { getRepoChunksCollection } from "@/vector/chromaClient";

export interface ContributionEntryPoint {
  filePath: string;
  folder: string;
  mentionCount: number;
  avgHybridScore: number;
  reason: string;
}

function asString(value: unknown, fallback = "unknown"): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function normalizeBm25Scores(
  scores: Array<{ id: string; score: number }>,
): Map<string, number> {
  const maxScore = scores.reduce((max, item) => Math.max(max, item.score), 0);
  const normalized = new Map<string, number>();

  if (maxScore <= 0) {
    return normalized;
  }

  for (const item of scores) {
    normalized.set(item.id, item.score / maxScore);
  }

  return normalized;
}

function diversifyChunks(candidates: RetrievedChunk[]): RetrievedChunk[] {
  const selected: RetrievedChunk[] = [];
  const fileCounts = new Map<string, number>();
  const folderCounts = new Map<string, number>();

  for (const chunk of candidates) {
    if (selected.length >= RETRIEVAL_MAX_RESULTS) {
      break;
    }

    const currentFileCount = fileCounts.get(chunk.filePath) ?? 0;
    const currentFolderCount = folderCounts.get(chunk.folder) ?? 0;

    const shouldInclude =
      selected.length < RETRIEVAL_MIN_RESULTS ||
      (currentFileCount < 2 && currentFolderCount < 3);

    if (!shouldInclude) {
      continue;
    }

    selected.push(chunk);
    fileCounts.set(chunk.filePath, currentFileCount + 1);
    folderCounts.set(chunk.folder, currentFolderCount + 1);
  }

  return selected;
}

function enforceTokenLimit(chunks: RetrievedChunk[]): RetrievedChunk[] {
  let totalTokens = 0;
  const limited: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    const tokenCost = estimateTokenCount(chunk.content);

    if (totalTokens + tokenCost > CONTEXT_MAX_TOKENS) {
      break;
    }

    totalTokens += tokenCost;
    limited.push(chunk);
  }

  return limited;
}

export async function retrieveContext(
  question: string,
  repoId: string,
): Promise<RetrievedChunk[]> {
  const collection = await getRepoChunksCollection();
  const [questionEmbedding] = await embedTexts([question]);

  const vectorResult = await collection.query({
    queryEmbeddings: [questionEmbedding],
    nResults: RETRIEVAL_QUERY_CANDIDATES * 3,
    where: { repoId },
    include: ["metadatas", "documents", "distances"],
  });

  const vectorIds = vectorResult.ids[0] ?? [];
  const vectorMetadatas = vectorResult.metadatas?.[0] ?? [];
  const vectorDocuments = vectorResult.documents?.[0] ?? [];
  const vectorDistances = vectorResult.distances?.[0] ?? [];

  const lexicalCorpusResult = await collection.get({
    where: { repoId },
    include: ["metadatas", "documents"],
  });

  const lexicalCorpusIds = lexicalCorpusResult.ids ?? [];
  const lexicalCorpusMetadatas = lexicalCorpusResult.metadatas ?? [];
  const lexicalCorpusDocuments = lexicalCorpusResult.documents ?? [];

  const lexicalCorpusById = new Map<
    string,
    { metadata: Record<string, unknown>; document: string }
  >();

  lexicalCorpusIds.forEach((id, index) => {
    const document = lexicalCorpusDocuments[index] ?? "";
    if (!document.trim()) {
      return;
    }

    lexicalCorpusById.set(id, {
      metadata: (lexicalCorpusMetadatas[index] ?? {}) as Record<string, unknown>,
      document,
    });
  });

  const byId = new Map<string, RetrievedChunk>();
  const vectorRankedIds: string[] = [];

  vectorIds.forEach((id, index) => {
    const metadata = vectorMetadatas[index] ?? {};
    const document = vectorDocuments[index] ?? "";
    if (!document.trim()) {
      return;
    }

    const chunk: RetrievedChunk = {
      id,
      repoId,
      filePath: asString(metadata.filePath),
      fileName: asString(metadata.fileName),
      language: asString(metadata.language),
      folder: asString(metadata.folder, "/"),
      startLine: asNumber(metadata.startLine, 0),
      endLine: asNumber(metadata.endLine, 0),
      content: document,
      distance: asNumber(vectorDistances[index], 999),
      vectorRank: index + 1,
    };

    byId.set(id, chunk);
    vectorRankedIds.push(id);
  });

  const lexicalScores = computeBm25Scores(
    question,
    Array.from(lexicalCorpusById.entries()).map(([id, record]) => ({
      id,
      content: record.document,
    })),
  ).slice(0, RETRIEVAL_QUERY_CANDIDATES * 3);

  const normalizedBm25Scores = normalizeBm25Scores(lexicalScores);

  const lexicalRankedIds: string[] = [];
  lexicalScores.forEach((item, index) => {
    const existing = byId.get(item.id);
    if (existing) {
      byId.set(item.id, {
        ...existing,
        lexicalRank: index + 1,
        bm25Score: item.score,
      });

      lexicalRankedIds.push(item.id);
      return;
    }

    const lexicalRecord = lexicalCorpusById.get(item.id);
    if (!lexicalRecord) {
      return;
    }

    const metadata = lexicalRecord.metadata;

    byId.set(item.id, {
      id: item.id,
      repoId: asString(metadata.repoId, repoId),
      filePath: asString(metadata.filePath),
      fileName: asString(metadata.fileName),
      language: asString(metadata.language),
      folder: asString(metadata.folder, "/"),
      startLine: asNumber(metadata.startLine, 0),
      endLine: asNumber(metadata.endLine, 0),
      content: lexicalRecord.document,
      distance: 999,
      lexicalRank: index + 1,
      bm25Score: item.score,
    });

    lexicalRankedIds.push(item.id);
  });

  const fusionScores = reciprocalRankFusion(vectorRankedIds, lexicalRankedIds);

  const candidates = Array.from(byId.values())
    .map((chunk) => {
      const vectorScore = chunk.distance >= 999 ? 0 : 1 / (1 + chunk.distance);
      const fusedScore = fusionScores.get(chunk.id) ?? 0;
      const bm25Score = normalizedBm25Scores.get(chunk.id) ?? 0;

      return {
        ...chunk,
        hybridScore: fusedScore * 8 + vectorScore * 0.55 + bm25Score * 0.45,
      };
    })
    .sort((a, b) => (b.hybridScore ?? 0) - (a.hybridScore ?? 0))
    .slice(0, RETRIEVAL_QUERY_CANDIDATES);

  const diverse = diversifyChunks(candidates);
  return enforceTokenLimit(diverse);
}

export function buildContextWindow(chunks: RetrievedChunk[]): string {
  return chunks
    .map((chunk, index) => {
      return [
        `Chunk ${index + 1}`,
        `file: ${chunk.filePath}`,
        `lines: ${chunk.startLine}-${chunk.endLine}`,
        chunk.content,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

export function computeRetrievalAccuracyProxy(chunks: RetrievedChunk[]): number {
  if (chunks.length === 0) {
    return 0;
  }

  const relevanceScore =
    chunks
      .map((chunk) => (chunk.distance >= 999 ? 0 : 1 / (1 + chunk.distance)))
      .reduce((sum, score) => sum + score, 0) / chunks.length;

  const dualSignalCount = chunks.filter(
    (chunk) =>
      typeof chunk.vectorRank === "number" && typeof chunk.lexicalRank === "number",
  ).length;
  const dualSignalScore = dualSignalCount / chunks.length;

  const fileDiversityScore = new Set(chunks.map((chunk) => chunk.filePath)).size / chunks.length;

  return clamp01(relevanceScore * 0.5 + dualSignalScore * 0.35 + fileDiversityScore * 0.15);
}

export function suggestContributionEntryPoints(
  chunks: RetrievedChunk[],
): ContributionEntryPoint[] {
  const aggregate = new Map<
    string,
    {
      filePath: string;
      folder: string;
      mentionCount: number;
      hybridScoreTotal: number;
    }
  >();

  for (const chunk of chunks) {
    const existing = aggregate.get(chunk.filePath);
    const hybridScore = chunk.hybridScore ?? 0;

    if (existing) {
      existing.mentionCount += 1;
      existing.hybridScoreTotal += hybridScore;
      continue;
    }

    aggregate.set(chunk.filePath, {
      filePath: chunk.filePath,
      folder: chunk.folder,
      mentionCount: 1,
      hybridScoreTotal: hybridScore,
    });
  }

  const ranked = Array.from(aggregate.values())
    .map((item) => {
      const avgHybridScore = item.hybridScoreTotal / item.mentionCount;
      const reason =
        item.mentionCount > 1
          ? "Multiple relevant chunks were retrieved from this file."
          : item.folder === "/"
            ? "This top-level file appears central to repository behavior."
            : `Relevant logic was found in the '${item.folder}' folder.`;

      return {
        filePath: item.filePath,
        folder: item.folder,
        mentionCount: item.mentionCount,
        avgHybridScore,
        reason,
      };
    })
    .sort((a, b) => {
      if (b.mentionCount !== a.mentionCount) {
        return b.mentionCount - a.mentionCount;
      }

      return b.avgHybridScore - a.avgHybridScore;
    })
    .slice(0, 3);

  return ranked;
}
