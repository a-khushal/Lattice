import OpenAI from "openai";
import type { RepoChunk } from "@/lib/types";

const EMBEDDING_BATCH_SIZE = 64;

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
  const allEmbeddings: number[][] = [];

  for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(index, index + EMBEDDING_BATCH_SIZE);
    const result = await openai.embeddings.create({
      model,
      input: batch,
    });

    allEmbeddings.push(...result.data.map((item) => item.embedding));
  }

  return allEmbeddings;
}

export async function embedChunks(chunks: RepoChunk[]): Promise<number[][]> {
  return embedTexts(chunks.map((chunk) => chunk.content));
}
