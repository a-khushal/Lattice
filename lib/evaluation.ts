import { generateAnswer } from "@/lib/generateAnswer";
import { retrieveContext } from "@/lib/retrieveContext";
import type { EvaluationCase, RetrievedChunk } from "@/lib/types";

interface EvaluationCaseResult {
  question: string;
  answer: string;
  contextCount: number;
  matchedAnswerExpectation: boolean;
  matchedSourceExpectation: boolean;
  groundednessScore: number;
  sources: Array<{ filePath: string; startLine: number; endLine: number }>;
}

export interface EvaluationReport {
  repoId: string;
  totalCases: number;
  exactMatchAccuracy: number;
  contextRelevance: number;
  groundedness: number;
  averageContextCount: number;
  cases: EvaluationCaseResult[];
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length > 1);
}

function scoreGroundedness(answer: string, chunks: RetrievedChunk[]): number {
  if (answer.trim() === "Not found in repository") {
    return chunks.length === 0 ? 1 : 0.5;
  }

  const answerTokens = tokenize(answer);
  if (answerTokens.length === 0) {
    return 0;
  }

  const contextTokenSet = new Set(
    tokenize(chunks.map((chunk) => chunk.content).join("\n")),
  );

  const overlap = answerTokens.filter((token) => contextTokenSet.has(token)).length;
  return overlap / answerTokens.length;
}

function evaluateExpectedAnswer(answer: string, testCase: EvaluationCase): boolean {
  if (!testCase.expectedAnswer && !testCase.expectedAnswerRegex) {
    return true;
  }

  if (testCase.expectedAnswer) {
    return normalizeText(answer).includes(normalizeText(testCase.expectedAnswer));
  }

  if (testCase.expectedAnswerRegex) {
    const expression = new RegExp(testCase.expectedAnswerRegex, "i");
    return expression.test(answer);
  }

  return true;
}

function evaluateExpectedSources(
  chunks: RetrievedChunk[],
  testCase: EvaluationCase,
): boolean {
  if (!testCase.expectedSourceFiles || testCase.expectedSourceFiles.length === 0) {
    return true;
  }

  return testCase.expectedSourceFiles.some((filePath) =>
    chunks.some((chunk) => chunk.filePath === filePath),
  );
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function runEvaluation(input: {
  repoId: string;
  cases: EvaluationCase[];
}): Promise<EvaluationReport> {
  const results: EvaluationCaseResult[] = [];

  for (const testCase of input.cases) {
    const chunks = await retrieveContext(testCase.question, input.repoId);
    const answer = await generateAnswer(testCase.question, chunks);
    const groundednessScore = scoreGroundedness(answer, chunks);

    results.push({
      question: testCase.question,
      answer,
      contextCount: chunks.length,
      matchedAnswerExpectation: evaluateExpectedAnswer(answer, testCase),
      matchedSourceExpectation: evaluateExpectedSources(chunks, testCase),
      groundednessScore,
      sources: chunks.map((chunk) => ({
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
      })),
    });
  }

  return {
    repoId: input.repoId,
    totalCases: results.length,
    exactMatchAccuracy: average(
      results.map((result) => (result.matchedAnswerExpectation ? 1 : 0)),
    ),
    contextRelevance: average(
      results.map((result) => (result.matchedSourceExpectation ? 1 : 0)),
    ),
    groundedness: average(results.map((result) => result.groundednessScore)),
    averageContextCount: average(results.map((result) => result.contextCount)),
    cases: results,
  };
}
