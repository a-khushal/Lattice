import { chunkFiles } from "@/lib/chunkFiles";
import { cleanupClonedRepo, cloneRepo } from "@/lib/cloneRepo";
import { embedChunks } from "@/lib/embedChunks";
import { parseFiles } from "@/lib/parseFiles";
import { buildRepoId, normalizeRepoUrl } from "@/lib/repoId";
import { getRepoRegistrationById, upsertRepoRegistration } from "@/lib/repoRegistry";
import type { IngestResult, RepoChunk } from "@/lib/types";
import { getRepoChunksCollection } from "@/vector/chromaClient";

const INSERT_BATCH_SIZE = 64;

function toChromaMetadata(chunk: RepoChunk): Record<string, string | number | boolean> {
  return {
    repoId: chunk.repoId,
    filePath: chunk.filePath,
    fileName: chunk.fileName,
    language: chunk.language,
    folder: chunk.folder,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
  };
}

async function performIngestion(
  repoUrl: string,
  options?: {
    repoIdOverride?: string;
    defaultBranch?: string;
  },
): Promise<IngestResult> {
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);
  const repoId = options?.repoIdOverride ?? buildRepoId(normalizedRepoUrl);
  const clonedRepoPath = await cloneRepo(normalizedRepoUrl);

  try {
    const parsedFiles = await parseFiles(clonedRepoPath);
    const chunks = await chunkFiles(parsedFiles, repoId);

    if (chunks.length === 0) {
      throw new Error("No supported source files were found during ingestion");
    }

    const embeddings = await embedChunks(chunks);
    const collection = await getRepoChunksCollection();

    await collection.delete({ where: { repoId } });

    for (let index = 0; index < chunks.length; index += INSERT_BATCH_SIZE) {
      const chunkBatch = chunks.slice(index, index + INSERT_BATCH_SIZE);
      const embeddingBatch = embeddings.slice(index, index + INSERT_BATCH_SIZE);

      await collection.add({
        ids: chunkBatch.map((item) => item.id),
        embeddings: embeddingBatch,
        documents: chunkBatch.map((item) => item.content),
        metadatas: chunkBatch.map((item) => toChromaMetadata(item)),
      });
    }

    await upsertRepoRegistration({
      repoId,
      repoUrl: normalizedRepoUrl,
      defaultBranch: options?.defaultBranch,
    });

    return {
      repoId,
      repoUrl: normalizedRepoUrl,
      parsedFiles: parsedFiles.length,
      chunkCount: chunks.length,
    };
  } finally {
    await cleanupClonedRepo(clonedRepoPath);
  }
}

export async function ingestRepository(
  repoUrl: string,
  options?: { defaultBranch?: string },
): Promise<IngestResult> {
  return performIngestion(repoUrl, { defaultBranch: options?.defaultBranch });
}

export async function reingestRepositoryByRepoId(
  repoId: string,
): Promise<IngestResult> {
  const registration = await getRepoRegistrationById(repoId);
  if (!registration) {
    throw new Error(`Repository not found for repoId '${repoId}'`);
  }

  return performIngestion(registration.repoUrl, {
    repoIdOverride: repoId,
    defaultBranch: registration.defaultBranch,
  });
}
