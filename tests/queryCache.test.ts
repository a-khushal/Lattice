import { describe, expect, it } from "vitest";
import {
  cacheQueryResult,
  getCachedQuery,
  invalidateRepoQueryCache,
} from "@/lib/queryCache";

describe("query cache", () => {
  it("stores and returns cached values", () => {
    const repoId = `repo-${Date.now()}-a`;
    const question = "How is routing handled?";

    cacheQueryResult(repoId, question, {
      answer: "Routing is in app/api",
      contextCount: 2,
      relevanceScore: 0.7,
      retrievalAccuracyProxy: 0.75,
      tokenUsage: 120,
      estimatedCostUsd: 0.001,
      entryPoints: [],
      sources: [
        {
          filePath: "app/api/query/route.ts",
          startLine: 1,
          endLine: 20,
        },
      ],
    });

    const cached = getCachedQuery(repoId, question);
    expect(cached).not.toBeNull();
    expect(cached?.answer).toContain("Routing");
    expect(cached?.contextCount).toBe(2);
  });

  it("invalidates cache by repo", () => {
    const repoId = `repo-${Date.now()}-b`;
    const question = "Where is auth handled?";

    cacheQueryResult(repoId, question, {
      answer: "In middleware",
      contextCount: 1,
      relevanceScore: 0.5,
      retrievalAccuracyProxy: 0.55,
      tokenUsage: 80,
      estimatedCostUsd: 0.0004,
      entryPoints: [],
      sources: [
        {
          filePath: "middleware.ts",
          startLine: 1,
          endLine: 18,
        },
      ],
    });

    invalidateRepoQueryCache(repoId);
    expect(getCachedQuery(repoId, question)).toBeNull();
  });
});
