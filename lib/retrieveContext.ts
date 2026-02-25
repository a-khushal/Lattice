import {
  CONTEXT_MAX_TOKENS,
  MAX_LEXICAL_DOCUMENTS,
  RETRIEVAL_MAX_RESULTS,
  RETRIEVAL_MIN_RESULTS,
  RETRIEVAL_QUERY_CANDIDATES,
} from "@/lib/constants";
import { estimateTokenCount } from "@/lib/chunkFiles";
import { embedTexts } from "@/lib/embedChunks";
import { computeBm25Scores, reciprocalRankFusion } from "@/lib/hybridSearch";
import type { RetrievedChunk } from "@/lib/types";
import { getRepoChunksCollection } from "@/vector/chromaClient";

function asString(value: unknown, fallback = "unknown"): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
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

  const [vectorResult, lexicalCorpus] = await Promise.all([
    collection.query({
      queryEmbeddings: [questionEmbedding],
      nResults: RETRIEVAL_QUERY_CANDIDATES * 2,
      where: { repoId },
      include: ["metadatas", "documents", "distances"],
    }),
    collection.get({
      where: { repoId },
      include: ["metadatas", "documents"],
      limit: MAX_LEXICAL_DOCUMENTS,
    }),
  ]);

  const vectorIds = vectorResult.ids[0] ?? [];
  const vectorMetadatas = vectorResult.metadatas?.[0] ?? [];
  const vectorDocuments = vectorResult.documents?.[0] ?? [];
  const vectorDistances = vectorResult.distances?.[0] ?? [];

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

  const lexicalIds = lexicalCorpus.ids ?? [];
  const lexicalMetadatas = lexicalCorpus.metadatas ?? [];
  const lexicalDocuments = lexicalCorpus.documents ?? [];
  const lexicalIndexById = new Map<string, number>();
  lexicalIds.forEach((id, index) => lexicalIndexById.set(id, index));

  const lexicalScores = computeBm25Scores(
    question,
    lexicalIds.map((id, index) => ({
      id,
      content: lexicalDocuments[index] ?? "",
    })),
  );

  const lexicalRankedIds: string[] = [];
  lexicalScores.forEach((item, index) => {
    const docIndex = lexicalIndexById.get(item.id);
    if (docIndex === undefined) {
      return;
    }

    const metadata = lexicalMetadatas[docIndex] ?? {};
    const document = lexicalDocuments[docIndex] ?? "";
    if (!document.trim()) {
      return;
    }

    const existing = byId.get(item.id);
    const baseChunk =
      existing ??
      ({
        id: item.id,
        repoId,
        filePath: asString(metadata.filePath),
        fileName: asString(metadata.fileName),
        language: asString(metadata.language),
        folder: asString(metadata.folder, "/"),
        startLine: asNumber(metadata.startLine, 0),
        endLine: asNumber(metadata.endLine, 0),
        content: document,
        distance: 999,
      } satisfies RetrievedChunk);

    byId.set(item.id, {
      ...baseChunk,
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
      const bm25Score = chunk.bm25Score ?? 0;

      return {
        ...chunk,
        hybridScore: fusedScore + vectorScore * 0.25 + bm25Score * 0.02,
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
