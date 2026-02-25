import { createHash } from "node:crypto";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  CHUNK_OVERLAP_CHARACTERS,
  CHUNK_TARGET_CHARACTERS,
} from "@/lib/constants";
import { extractAstAwareSegments } from "@/lib/astSegments";
import type { ParsedFile, RepoChunk } from "@/lib/types";

function estimateTokens(text: string): number {
  const approx = Math.ceil(text.length / 4);
  return Math.max(1, approx);
}

function buildChunkId(
  repoId: string,
  filePath: string,
  startLine: number,
  endLine: number,
): string {
  return createHash("sha256")
    .update(`${repoId}:${filePath}:${startLine}:${endLine}`)
    .digest("hex")
    .slice(0, 24);
}

export async function chunkFiles(
  files: ParsedFile[],
  repoId: string,
): Promise<RepoChunk[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_TARGET_CHARACTERS,
    chunkOverlap: CHUNK_OVERLAP_CHARACTERS,
  });

  const chunks: RepoChunk[] = [];

  for (const file of files) {
    const segments = extractAstAwareSegments(file);
    const lineStarts = buildLineStartOffsets(file.content);

    if (segments.length === 0) {
      continue;
    }

    for (const segment of segments) {
      const splitChunks = await splitter.splitText(segment.content);
      let searchFrom = 0;

      for (const rawChunk of splitChunks) {
        const content = rawChunk.trim();
        if (!content) {
          continue;
        }

        let localStart = segment.content.indexOf(rawChunk, searchFrom);
        if (localStart < 0) {
          localStart = segment.content.indexOf(content, searchFrom);
        }
        if (localStart < 0) {
          localStart = searchFrom;
        }

        const localEnd = localStart + Math.max(rawChunk.length, content.length);
        const globalStartOffset = segment.startOffset + localStart;
        const globalEndOffset = segment.startOffset + Math.max(localEnd - 1, localStart);
        const startLine = offsetToLine(globalStartOffset, lineStarts);
        const endLine = offsetToLine(globalEndOffset, lineStarts);

        chunks.push({
          id: buildChunkId(repoId, file.filePath, startLine, endLine),
          repoId,
          filePath: file.filePath,
          fileName: file.fileName,
          language: file.language,
          folder: file.folder,
          startLine,
          endLine,
          content,
        });

        searchFrom = Math.max(localStart + 1, 0);
      }
    }
  }

  return chunks;
}

export function estimateTokenCount(text: string): number {
  return estimateTokens(text);
}

function buildLineStartOffsets(content: string): number[] {
  const starts = [0];

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      starts.push(index + 1);
    }
  }

  return starts;
}

function offsetToLine(offset: number, lineStarts: number[]): number {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const current = lineStarts[middle];
    const next = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;

    if (offset >= current && offset < next) {
      return middle + 1;
    }

    if (offset < current) {
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  return lineStarts.length;
}
