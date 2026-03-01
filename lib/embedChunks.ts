import { createHash } from "node:crypto";
import OpenAI from "openai";
import { withRetry } from "@/lib/resilience";
import type { RepoChunk } from "@/lib/types";

const EMBEDDING_BATCH_SIZE = 64;
const EMBEDDING_CACHE_MAX_ENTRIES = 2000;
const EMBEDDING_CACHE_MAX_TEXT_LENGTH = 1200;

const embeddingCache = new Map<string, number[]>();

function toCacheKey(model: string, text: string): string {
  return createHash("sha256").update(`${model}:${text}`).digest("hex");
}

function getCachedEmbedding(model: string, text: string): number[] | null {
  if (text.length > EMBEDDING_CACHE_MAX_TEXT_LENGTH) {
    return null;
  }

  const cacheKey = toCacheKey(model, text);
  return embeddingCache.get(cacheKey) ?? null;
}

function setCachedEmbedding(model: string, text: string, embedding: number[]): void {
  if (text.length > EMBEDDING_CACHE_MAX_TEXT_LENGTH) {
    return;
  }

  const cacheKey = toCacheKey(model, text);
  embeddingCache.set(cacheKey, embedding);

  if (embeddingCache.size > EMBEDDING_CACHE_MAX_ENTRIES) {
    const oldest = embeddingCache.keys().next().value;
    if (oldest) {
      embeddingCache.delete(oldest);
    }
  }
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return new OpenAI({ apiKey });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  const openai = getOpenAIClient();
  const allEmbeddings = Array.from<number[]>({ length: texts.length });

  const uncachedIndexes: number[] = [];
  const uncachedInputs: string[] = [];

  texts.forEach((text, index) => {
    const cached = getCachedEmbedding(model, text);
    if (cached) {
      allEmbeddings[index] = cached;
      return;
    }

    uncachedIndexes.push(index);
    uncachedInputs.push(text);
  });

  for (let index = 0; index < uncachedInputs.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = uncachedInputs.slice(index, index + EMBEDDING_BATCH_SIZE);
    const batchIndexes = uncachedIndexes.slice(index, index + EMBEDDING_BATCH_SIZE);
    const result = await withRetry(() => {
      return openai.embeddings.create({
        model,
        input: batch,
      });
    });

    result.data.forEach((item, batchIndex) => {
      const originalIndex = batchIndexes[batchIndex];
      const sourceText = texts[originalIndex];
      allEmbeddings[originalIndex] = item.embedding;
      setCachedEmbedding(model, sourceText, item.embedding);
    });
  }

  if (allEmbeddings.some((embedding) => !embedding)) {
    throw new Error("Failed to generate embeddings for all inputs");
  }

  return allEmbeddings;
}

export async function embedChunks(chunks: RepoChunk[]): Promise<number[][]> {
  return embedTexts(chunks.map((chunk) => chunk.content));
}
