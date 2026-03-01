export interface ParsedFile {
  absolutePath: string;
  filePath: string;
  fileName: string;
  folder: string;
  language: string;
  content: string;
}

export interface RepoChunk {
  id: string;
  repoId: string;
  filePath: string;
  fileName: string;
  language: string;
  folder: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface RetrievedChunk extends RepoChunk {
  distance: number;
  vectorRank?: number;
  lexicalRank?: number;
  bm25Score?: number;
  hybridScore?: number;
}

export interface IngestResult {
  repoId: string;
  repoUrl: string;
  parsedFiles: number;
  chunkCount: number;
}

export interface QueryMetricEvent {
  repoId: string;
  question: string;
  answer: string;
  retrievalLatencyMs: number;
  completionLatencyMs: number;
  totalLatencyMs: number;
  contextCount: number;
  relevanceScore: number;
  retrievalAccuracyProxy: number;
  tokenUsage: number;
  estimatedCostUsd: number;
  timestamp: string;
}

export interface IngestMetricEvent {
  repoId: string;
  repoUrl: string;
  parsedFiles: number;
  chunkCount: number;
  latencyMs: number;
  timestamp: string;
}

export interface EvaluationCase {
  question: string;
  expectedAnswer?: string;
  expectedAnswerRegex?: string;
  expectedSourceFiles?: string[];
}
