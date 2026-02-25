import { getMetricsDashboard } from "@/lib/observability";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
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
