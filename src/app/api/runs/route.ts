import { getLatestRun, getRun, listRuns } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/runs            -> { runs: RunSummary[] }
 * GET /api/runs?latest=1   -> { run: RunResult | null }
 * GET /api/runs?id=<id>    -> { run: RunResult | null }
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get("latest")) {
    return Response.json({ run: await getLatestRun() });
  }
  const id = url.searchParams.get("id");
  if (id) {
    return Response.json({ run: await getRun(id) });
  }
  return Response.json({ runs: await listRuns() });
}
