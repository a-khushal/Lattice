import { createHmac, timingSafeEqual } from "node:crypto";
import { buildRepoId } from "@/lib/repoId";
import { ingestRepository, reingestRepositoryByRepoId } from "@/lib/ingestRepo";
import { logIngestMetric } from "@/lib/observability";
import { getRepoRegistrationById } from "@/lib/repoRegistry";

export const runtime = "nodejs";

interface GitHubRepositoryInfo {
  clone_url?: string;
  html_url?: string;
  default_branch?: string;
}

interface GitHubPushPayload {
  ref?: string;
  repository?: GitHubRepositoryInfo;
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function extractRepoInfo(payload: GitHubPushPayload): {
  repoUrl: string;
  defaultBranch: string;
} {
  const repo = payload.repository;
  const repoUrl = repo?.clone_url ?? repo?.html_url;

  if (!repoUrl) {
    throw new Error("Webhook payload is missing repository URL");
  }

  return {
    repoUrl,
    defaultBranch: repo?.default_branch ?? "main",
  };
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();

  try {
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return Response.json(
        { error: "GITHUB_WEBHOOK_SECRET is not configured" },
        { status: 500 },
      );
    }

    const signature = request.headers.get("x-hub-signature-256");
    if (!signature) {
      return Response.json({ error: "Missing webhook signature" }, { status: 401 });
    }

    const rawBody = await request.text();
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const event = request.headers.get("x-github-event") ?? "";
    if (event === "ping") {
      return Response.json({ ok: true, event: "ping" });
    }

    if (event !== "push") {
      return Response.json({ ok: true, ignored: true, event });
    }

    const payload = JSON.parse(rawBody) as GitHubPushPayload;
    const { repoUrl, defaultBranch } = extractRepoInfo(payload);

    const pushedRef = payload.ref ?? "";
    const expectedRef = `refs/heads/${defaultBranch}`;
    if (pushedRef && pushedRef !== expectedRef) {
      return Response.json({
        ok: true,
        ignored: true,
        reason: `Push is on '${pushedRef}', expected '${expectedRef}'`,
      });
    }

    const repoId = buildRepoId(repoUrl);
    const registration = await getRepoRegistrationById(repoId);

    const result = registration
      ? await reingestRepositoryByRepoId(repoId)
      : await ingestRepository(repoUrl, { defaultBranch });

    const latencyMs = Date.now() - startedAt;

    await logIngestMetric({
      repoId: result.repoId,
      repoUrl: result.repoUrl,
      parsedFiles: result.parsedFiles,
      chunkCount: result.chunkCount,
      latencyMs,
      timestamp: new Date().toISOString(),
    }).catch(() => {
      return undefined;
    });

    return Response.json({
      ok: true,
      event,
      mode: registration ? "repoId" : "repoUrl",
      repoId: result.repoId,
      repoUrl: result.repoUrl,
      parsedFiles: result.parsedFiles,
      chunkCount: result.chunkCount,
      metrics: {
        latencyMs,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook handling failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
