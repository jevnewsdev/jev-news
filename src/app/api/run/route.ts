import { runAgent } from "@/agent/run";
import { getRunEnv, saveRun } from "@/lib/store";
import type { RunEvent } from "@/agent/types";

export const dynamic = "force-dynamic";

/** Start a run and stream progress as newline-delimited JSON events. */
export async function POST(): Promise<Response> {
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
