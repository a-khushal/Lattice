import { runEvaluation } from "@/lib/evaluation";
import { guardApiRequest } from "@/lib/requestGuards";
import type { EvaluationCase } from "@/lib/types";

export const runtime = "nodejs";

function isEvaluationCase(input: unknown): input is EvaluationCase {
  if (!input || typeof input !== "object") {
    return false;
  }

  const value = input as Record<string, unknown>;
  return typeof value.question === "string";
}

export async function POST(request: Request): Promise<Response> {
  const guardFailure = guardApiRequest(request, {
    routeKey: "evaluate",
    maxRequestsPerWindow: 12,
  });
  if (guardFailure) {
    return guardFailure;
  }

  try {
    const payload = (await request.json()) as {
      repoId?: unknown;
      cases?: unknown;
    };

    const repoId = typeof payload.repoId === "string" ? payload.repoId.trim() : "";
    const cases = Array.isArray(payload.cases)
      ? payload.cases.filter(isEvaluationCase)
      : [];

    if (!repoId || cases.length === 0) {
      return Response.json(
        { error: "repoId and at least one evaluation case are required" },
        { status: 400 },
      );
    }

    const report = await runEvaluation({ repoId, cases });
    return Response.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evaluation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
