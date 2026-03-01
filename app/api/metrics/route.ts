import { getMetricsDashboard } from "@/lib/observability";
import { guardApiRequest } from "@/lib/requestGuards";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const guardFailure = guardApiRequest(request, {
    routeKey: "metrics",
    maxRequestsPerWindow: 60,
  });
  if (guardFailure) {
    return guardFailure;
  }

  try {
    const { searchParams } = new URL(request.url);
    const repoId = searchParams.get("repoId")?.trim();

    const dashboard = await getMetricsDashboard(repoId || undefined);
    return Response.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load metrics";
    return Response.json({ error: message }, { status: 500 });
  }
}
