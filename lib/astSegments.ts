import { parse } from "@babel/parser";
import { AST_AWARE_LANGUAGES } from "@/lib/constants";
import type { ParsedFile } from "@/lib/types";

export interface FileSegment {
  content: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
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

function offsetToLine(offset: number, lineStartOffsets: number[]): number {
  let low = 0;
  let high = lineStartOffsets.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const current = lineStartOffsets[middle];
    const next = lineStartOffsets[middle + 1] ?? Number.POSITIVE_INFINITY;

    if (offset >= current && offset < next) {
      return middle + 1;
    }

    if (offset < current) {
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  return lineStartOffsets.length;
}

function segmentFromOffsets(
  content: string,
  lineStartOffsets: number[],
  startOffset: number,
  endOffset: number,
): FileSegment | null {
  if (endOffset <= startOffset) {
    return null;
  }

  const segmentContent = content.slice(startOffset, endOffset).trim();
  if (!segmentContent) {
    return null;
  }

  const localOffset = content.slice(startOffset, endOffset).indexOf(segmentContent);
  const normalizedStart = startOffset + Math.max(localOffset, 0);
  const normalizedEnd = normalizedStart + segmentContent.length;
  const startLine = offsetToLine(normalizedStart, lineStartOffsets);
  const endLine = offsetToLine(Math.max(normalizedEnd - 1, normalizedStart), lineStartOffsets);

  return {
    content: segmentContent,
    startOffset: normalizedStart,
    endOffset: normalizedEnd,
    startLine,
    endLine,
  };
}

export function extractAstAwareSegments(file: ParsedFile): FileSegment[] {
  const fullContent = file.content;
  const lineStartOffsets = buildLineStartOffsets(fullContent);

  const fullFileSegment = segmentFromOffsets(
    fullContent,
    lineStartOffsets,
    0,
    fullContent.length,
  );

  if (!fullFileSegment) {
    return [];
  }

  if (!AST_AWARE_LANGUAGES.has(file.language)) {
    return [fullFileSegment];
  }

  try {
    const ast = parse(fullContent, {
      sourceType: "unambiguous",
      errorRecovery: true,
      plugins: [
        "typescript",
        "jsx",
        "decorators-legacy",
        "classProperties",
        "topLevelAwait",
      ],
    });

    const boundaries = new Set<number>([0, fullContent.length]);

    for (const node of ast.program.body) {
      if (typeof node.start === "number" && typeof node.end === "number") {
        boundaries.add(node.start);
        boundaries.add(node.end);
      }
    }

    const sorted = Array.from(boundaries).sort((a, b) => a - b);
    const segments: FileSegment[] = [];

    for (let index = 0; index < sorted.length - 1; index += 1) {
      const startOffset = sorted[index];
      const endOffset = sorted[index + 1];
      const segment = segmentFromOffsets(
        fullContent,
        lineStartOffsets,
        startOffset,
        endOffset,
      );

      if (segment) {
        segments.push(segment);
      }
    }

    if (segments.length === 0) {
      return [fullFileSegment];
    }

    return segments;
  } catch {
    return [fullFileSegment];
  }
}
