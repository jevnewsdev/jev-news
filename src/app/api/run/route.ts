import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runAgent } from "@/agent/run";
import { getRunEnv, saveRun } from "@/lib/store";
import type { RunEvent } from "@/agent/types";

export const dynamic = "force-dynamic";

function runKey(): string | null {
  let key = process.env.RUN_KEY ?? null;
  try {
    const { env } = getCloudflareContext();
    key = (env as { RUN_KEY?: string }).RUN_KEY ?? key;
  } catch {
    // local dev outside wrangler
  }
  return key ?? null;
}

/**
 * Key-gated manual run for demos and recordings. The key is a Worker secret,
 * so only the operator can trigger spend; everyone else gets 403.
 * Streams newline-delimited JSON progress events.
 */
export async function POST(req: Request): Promise<Response> {
  const expected = runKey();
  if (!expected || req.headers.get("x-run-key") !== expected) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const env = getRunEnv();
  if (!env.apiKey) {
    return Response.json({ error: "OPENROUTER_API_KEY is not configured" }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: RunEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        const result = await runAgent(env, "manual", emit);
        await saveRun(result);
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
