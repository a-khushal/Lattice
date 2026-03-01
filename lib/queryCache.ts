interface CachedQueryPayload {
  answer: string;
  contextCount: number;
  relevanceScore: number;
  retrievalAccuracyProxy: number;
  tokenUsage: number;
  estimatedCostUsd: number;
  sources: Array<{
    filePath: string;
    startLine: number;
    endLine: number;
  }>;
  entryPoints: Array<{
    filePath: string;
    folder: string;
    mentionCount: number;
    avgHybridScore: number;
    reason: string;
  }>;
}

interface CacheEntry {
  storedAt: number;
  payload: CachedQueryPayload;
}

const queryCache = new Map<string, CacheEntry>();

function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildKey(repoId: string, question: string): string {
  return `${repoId}:${normalizeQuestion(question)}`;
}

function getTtlMs(): number {
  const fromEnv = Number.parseInt(process.env.QUERY_CACHE_TTL_MS ?? "", 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 5 * 60 * 1000;
}

function getMaxEntries(): number {
  const fromEnv = Number.parseInt(process.env.QUERY_CACHE_MAX_ENTRIES ?? "", 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 500;
}

function evictIfNeeded(): void {
  const maxEntries = getMaxEntries();
  if (queryCache.size <= maxEntries) {
    return;
  }

  const oldest = queryCache.keys().next().value;
  if (oldest) {
    queryCache.delete(oldest);
  }
}

export function getCachedQuery(
  repoId: string,
  question: string,
): CachedQueryPayload | null {
  const key = buildKey(repoId, question);
  const entry = queryCache.get(key);
  if (!entry) {
    return null;
  }

  const ttlMs = getTtlMs();
  if (Date.now() - entry.storedAt > ttlMs) {
    queryCache.delete(key);
    return null;
  }

  return entry.payload;
}

export function cacheQueryResult(
  repoId: string,
  question: string,
  payload: CachedQueryPayload,
): void {
  const key = buildKey(repoId, question);
  queryCache.set(key, {
    storedAt: Date.now(),
    payload,
  });
  evictIfNeeded();
}

export function invalidateRepoQueryCache(repoId: string): void {
  for (const key of queryCache.keys()) {
    if (key.startsWith(`${repoId}:`)) {
      queryCache.delete(key);
    }
  }
}
