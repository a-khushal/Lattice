interface GuardOptions {
  routeKey: "ingest" | "query" | "evaluate" | "metrics";
  maxRequestsPerWindow: number;
  windowMs?: number;
}

interface RateLimitEntry {
  windowStart: number;
  requestCount: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const DEFAULT_WINDOW_MS = 60_000;

function getClientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();

  return forwardedFor || realIp || cfIp || "unknown-client";
}

function parseEnvNumber(name: string): number | null {
  const value = process.env[name];
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function resolveRateLimitWindowMs(): number {
  return parseEnvNumber("RATE_LIMIT_WINDOW_MS") ?? DEFAULT_WINDOW_MS;
}

function resolveRouteLimit(options: GuardOptions): number {
  const envName = `RATE_LIMIT_MAX_${options.routeKey.toUpperCase()}`;
  return parseEnvNumber(envName) ?? options.maxRequestsPerWindow;
}

function verifyApiKey(request: Request): Response | null {
  const expectedApiKey = process.env.LATTICE_API_KEY?.trim();
  if (!expectedApiKey) {
    return null;
  }

  const providedApiKey = request.headers.get("x-api-key")?.trim() ?? "";
  if (providedApiKey !== expectedApiKey) {
    return Response.json(
      { error: "Unauthorized: invalid or missing API key" },
      { status: 401 },
    );
  }

  return null;
}

function enforceRateLimit(request: Request, options: GuardOptions): Response | null {
  const enabled = (process.env.ENABLE_RATE_LIMIT ?? "true").toLowerCase() !== "false";
  if (!enabled) {
    return null;
  }

  const now = Date.now();
  const windowMs = options.windowMs ?? resolveRateLimitWindowMs();
  const maxRequests = resolveRouteLimit(options);
  const client = getClientIdentifier(request);
  const storeKey = `${options.routeKey}:${client}`;
  const current = rateLimitStore.get(storeKey);

  if (!current || now - current.windowStart >= windowMs) {
    rateLimitStore.set(storeKey, { windowStart: now, requestCount: 1 });
    return null;
  }

  if (current.requestCount >= maxRequests) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (now - current.windowStart)) / 1000),
    );

    return Response.json(
      {
        error: "Rate limit exceeded",
        retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  }

  current.requestCount += 1;
  rateLimitStore.set(storeKey, current);
  return null;
}

export function guardApiRequest(request: Request, options: GuardOptions): Response | null {
  const authFailure = verifyApiKey(request);
  if (authFailure) {
    return authFailure;
  }

  return enforceRateLimit(request, options);
}
