"use client";

import { FormEvent, useMemo, useState } from "react";
import { Activity, CircleAlert, SearchCode } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

interface ApiMetricSnippet {
  latencyMs?: number;
  retrievalLatencyMs?: number;
  completionLatencyMs?: number;
  totalLatencyMs?: number;
  relevanceScore?: number;
  retrievalAccuracyProxy?: number;
  cached?: boolean;
  tokenUsage?: number;
  estimatedCostUsd?: number;
}

interface IngestResponse {
  mode: "repoUrl" | "repoId";
  repoId: string;
  repoUrl: string;
  parsedFiles: number;
  chunkCount: number;
  metrics?: ApiMetricSnippet;
}

interface QueryResponse {
  answer: string;
  contextCount: number;
  metrics?: ApiMetricSnippet;
  entryPoints?: Array<{
    filePath: string;
    folder: string;
    mentionCount: number;
    avgHybridScore: number;
    reason: string;
  }>;
  sources: Array<{
    filePath: string;
    startLine: number;
    endLine: number;
  }>;
}

interface DashboardResponse {
  totalQueries: number;
  totalIngestions: number;
  avgQueryLatencyMs: number;
  avgContextCount: number;
  avgRelevanceScore: number;
  avgRetrievalAccuracyProxy: number;
  avgTokenUsage: number;
  avgEstimatedCostUsd: number;
}

interface EvaluationCase {
  question: string;
  expectedAnswer?: string;
  expectedAnswerRegex?: string;
  expectedSourceFiles?: string[];
}

interface EvaluationResultCase {
  question: string;
  contextCount: number;
  matchedAnswerExpectation: boolean;
  matchedSourceExpectation: boolean;
  groundednessScore: number;
}

interface EvaluationResponse {
  repoId: string;
  totalCases: number;
  exactMatchAccuracy: number;
  contextRelevance: number;
  retrievalAccuracy: number;
  groundedness: number;
  averageContextCount: number;
  cases: EvaluationResultCase[];
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [repoId, setRepoId] = useState("");
  const [question, setQuestion] = useState("");

  const [ingestLoading, setIngestLoading] = useState(false);
  const [reingestLoading, setReingestLoading] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [ingestResult, setIngestResult] = useState<IngestResponse | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [evaluationInput, setEvaluationInput] = useState(
    '[\n  {\n    "question": "Where is routing handled?"\n  }\n]',
  );
  const [evaluationReport, setEvaluationReport] =
    useState<EvaluationResponse | null>(null);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  const readyForQuery = useMemo(() => repoId.trim().length > 0, [repoId]);

  async function refreshMetrics(activeRepoId: string): Promise<void> {
    if (!activeRepoId.trim()) {
      return;
    }

    setMetricsError(null);
    setMetricsLoading(true);

    try {
      const response = await fetch(
        `/api/metrics?repoId=${encodeURIComponent(activeRepoId)}`,
      );
      const payload = (await response.json()) as DashboardResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load observability metrics");
      }

      setDashboard(payload);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to load observability metrics";
      setMetricsError(message);
    } finally {
      setMetricsLoading(false);
    }
  }

  async function ingestRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setQueryResult(null);
    setIngestLoading(true);

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });

      const payload = (await response.json()) as IngestResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to ingest repository");
      }

      setIngestResult(payload);
      setRepoId(payload.repoId);
      setRepoUrl(payload.repoUrl);
      await refreshMetrics(payload.repoId);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to ingest repository";
      setError(message);
    } finally {
      setIngestLoading(false);
    }
  }

  async function reingestByRepoId(): Promise<void> {
    setError(null);
    setQueryResult(null);
    setReingestLoading(true);

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId }),
      });

      const payload = (await response.json()) as IngestResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to re-ingest repository");
      }

      setIngestResult(payload);
      setRepoId(payload.repoId);
      setRepoUrl(payload.repoUrl);
      await refreshMetrics(payload.repoId);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to re-ingest repository";
      setError(message);
    } finally {
      setReingestLoading(false);
    }
  }

  async function askQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setQueryLoading(true);

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, repoId }),
      });

      const payload = (await response.json()) as QueryResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to answer question");
      }

      setQueryResult(payload);
      await refreshMetrics(repoId);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to answer question";
      setError(message);
    } finally {
      setQueryLoading(false);
    }
  }

  async function runEvaluation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEvaluationError(null);
    setEvaluationLoading(true);

    try {
      const parsed = JSON.parse(evaluationInput) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("Evaluation input must be a JSON array of cases");
      }

      const cases = parsed.filter((item): item is EvaluationCase => {
        return (
          !!item &&
          typeof item === "object" &&
          typeof (item as Record<string, unknown>).question === "string"
        );
      });

      if (cases.length === 0) {
        throw new Error("At least one valid case with a question is required");
      }

      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId, cases }),
      });

      const payload = (await response.json()) as EvaluationResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to run evaluation");
      }

      setEvaluationReport(payload);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to run evaluation";
      setEvaluationError(message);
    } finally {
      setEvaluationLoading(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10 sm:px-8 lg:py-14">
      <main className="fade-up grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader className="space-y-4">
            <Badge variant="outline" className="w-fit px-3 py-1 tracking-[0.16em] uppercase">
              Lattice
            </Badge>
            <CardTitle className="text-3xl leading-tight md:text-4xl">
              AI second brain for repository onboarding
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6 md:text-base">
              Ingest a GitHub repository, build semantic chunks, then ask architecture
              and implementation questions grounded in code context.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <form onSubmit={ingestRepository} className="space-y-3">
              <Label htmlFor="repo-url">Repository URL</Label>
              <Input
                id="repo-url"
                type="url"
                required
                placeholder="https://github.com/org/project"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                className="h-12"
              />
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={ingestLoading || repoUrl.trim().length === 0}
              >
                {ingestLoading ? "Indexing repository..." : "Ingest repository"}
              </Button>
            </form>

            <div className="rounded-2xl border border-border bg-card/80 p-4">
              <Label htmlFor="repo-id">Active Repo ID</Label>
              <Input
                id="repo-id"
                value={repoId}
                onChange={(event) => setRepoId(event.target.value)}
                placeholder="Will appear after ingestion"
                className="mt-2 font-mono text-xs"
              />
              {ingestResult ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  [{ingestResult.mode}] Parsed {ingestResult.parsedFiles} files into{" "}
                  {ingestResult.chunkCount} chunks.
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full"
                onClick={reingestByRepoId}
                disabled={reingestLoading || repoId.trim().length === 0}
              >
                {reingestLoading ? "Re-indexing by Repo ID..." : "Re-ingest by Repo ID"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-[0_14px_60px_rgba(27,31,44,0.12)]">
          <CardHeader>
            <CardTitle className="text-xl">Repository Q&A</CardTitle>
            <CardDescription>
              Ask structural, architectural, or behavioral questions.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <form onSubmit={askQuestion} className="space-y-3">
              <Label htmlFor="question">Question</Label>
              <Textarea
                id="question"
                required
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="How is routing handled in this repo?"
                rows={5}
                className="resize-y"
              />
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                className="w-full"
                disabled={queryLoading || !readyForQuery || question.trim().length === 0}
              >
                <SearchCode className="size-4" />
                {queryLoading ? "Retrieving context..." : "Ask Lattice"}
              </Button>
            </form>

            {error ? (
              <Alert variant="destructive">
                <CircleAlert className="size-4" />
                <AlertTitle>Request failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {queryResult ? (
              <div className="fade-up space-y-4">
                <Card className="rounded-2xl bg-card/80 shadow-none">
                  <CardHeader className="pb-3">
                    <Label>Answer</Label>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-card-foreground">
                      {queryResult.answer}
                    </p>
                    {queryResult.metrics ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {queryResult.metrics.cached ? "Cached response, " : ""}
                        Latency {Math.round(queryResult.metrics.totalLatencyMs ?? 0)}ms,
                        relevance {(queryResult.metrics.relevanceScore ?? 0).toFixed(3)},
                        retrieval proxy {(
                          queryResult.metrics.retrievalAccuracyProxy ?? 0
                        ).toFixed(3)}
                        ,
                        tokens {Math.round(queryResult.metrics.tokenUsage ?? 0)}, cost $
                        {(queryResult.metrics.estimatedCostUsd ?? 0).toFixed(6)}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl bg-card/80 shadow-none">
                  <CardHeader className="pb-3">
                    <Label>Sources ({queryResult.contextCount})</Label>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-xs text-muted-foreground">
                      {queryResult.sources.map((source, index) => (
                        <li
                          key={`${source.filePath}-${index}`}
                          className="rounded-lg border border-border bg-background px-2 py-1.5 font-mono"
                        >
                          {source.filePath}:{source.startLine}-{source.endLine}
                        </li>
                      ))}
                    </ul>

                    {queryResult.entryPoints && queryResult.entryPoints.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        <Label className="text-xs">Contribution entry points</Label>
                        <ul className="space-y-2 text-xs text-muted-foreground">
                          {queryResult.entryPoints.map((entryPoint) => (
                            <li
                              key={entryPoint.filePath}
                              className="rounded-lg border border-border bg-background px-2 py-1.5"
                            >
                              <p className="font-mono text-[11px] text-card-foreground">
                                {entryPoint.filePath}
                              </p>
                              <p>
                                {entryPoint.reason} ({entryPoint.mentionCount} match
                                {entryPoint.mentionCount === 1 ? "" : "es"})
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            ) : null}

            <Card className="rounded-2xl bg-card/80 shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Activity className="size-4 text-primary" />
                    <Label>Observability</Label>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => refreshMetrics(repoId)}
                    disabled={metricsLoading || !readyForQuery}
                  >
                    {metricsLoading ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {metricsError ? (
                  <p className="text-xs text-destructive">{metricsError}</p>
                ) : null}

                {dashboard ? (
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <p className="rounded-lg border border-border bg-background px-2 py-1.5">
                      Queries: {dashboard.totalQueries}
                    </p>
                    <p className="rounded-lg border border-border bg-background px-2 py-1.5">
                      Ingests: {dashboard.totalIngestions}
                    </p>
                    <p className="rounded-lg border border-border bg-background px-2 py-1.5">
                      Avg latency: {Math.round(dashboard.avgQueryLatencyMs)}ms
                    </p>
                    <p className="rounded-lg border border-border bg-background px-2 py-1.5">
                      Avg context: {dashboard.avgContextCount.toFixed(2)}
                    </p>
                    <p className="rounded-lg border border-border bg-background px-2 py-1.5">
                      Avg relevance: {dashboard.avgRelevanceScore.toFixed(3)}
                    </p>
                    <p className="rounded-lg border border-border bg-background px-2 py-1.5">
                      Retrieval proxy: {dashboard.avgRetrievalAccuracyProxy.toFixed(3)}
                    </p>
                    <p className="rounded-lg border border-border bg-background px-2 py-1.5">
                      Avg cost: ${dashboard.avgEstimatedCostUsd.toFixed(6)}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Ingest or query a repository to start collecting metrics.
                  </p>
                )}

                <Separator className="my-4" />
                <p className="text-xs text-muted-foreground">
                  Metrics track latency, retrieval relevance, token usage, and estimated
                  per-query cost for this repo.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl bg-card/80 shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-primary" />
                  <Label>Evaluation</Label>
                </div>
                <CardDescription>
                  Run known architecture/file-location checks against this repo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <form onSubmit={runEvaluation} className="space-y-3">
                  <Label htmlFor="evaluation-cases">Cases JSON</Label>
                  <Textarea
                    id="evaluation-cases"
                    value={evaluationInput}
                    onChange={(event) => setEvaluationInput(event.target.value)}
                    rows={6}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full"
                    disabled={evaluationLoading || !readyForQuery}
                  >
                    {evaluationLoading ? "Running evaluation..." : "Run Evaluation"}
                  </Button>
                </form>

                {evaluationError ? (
                  <p className="text-xs text-destructive">{evaluationError}</p>
                ) : null}

                {evaluationReport ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <p className="rounded-lg border border-border bg-background px-2 py-1.5">
                        Cases: {evaluationReport.totalCases}
                      </p>
                      <p className="rounded-lg border border-border bg-background px-2 py-1.5">
                        Exact match: {(evaluationReport.exactMatchAccuracy * 100).toFixed(1)}%
                      </p>
                      <p className="rounded-lg border border-border bg-background px-2 py-1.5">
                        Context relevance: {(evaluationReport.contextRelevance * 100).toFixed(1)}%
                      </p>
                      <p className="rounded-lg border border-border bg-background px-2 py-1.5">
                        Retrieval accuracy: {(evaluationReport.retrievalAccuracy * 100).toFixed(1)}%
                      </p>
                      <p className="rounded-lg border border-border bg-background px-2 py-1.5">
                        Groundedness: {(evaluationReport.groundedness * 100).toFixed(1)}%
                      </p>
                    </div>

                    <div className="space-y-2">
                      {evaluationReport.cases.slice(0, 5).map((item, index) => (
                        <div
                          key={`${item.question}-${index}`}
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                        >
                          <p className="font-medium text-card-foreground">{item.question}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant={item.matchedAnswerExpectation ? "secondary" : "outline"}>
                              answer {item.matchedAnswerExpectation ? "ok" : "miss"}
                            </Badge>
                            <Badge variant={item.matchedSourceExpectation ? "secondary" : "outline"}>
                              sources {item.matchedSourceExpectation ? "ok" : "miss"}
                            </Badge>
                            <Badge variant="outline">
                              grounded {(item.groundednessScore * 100).toFixed(0)}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
