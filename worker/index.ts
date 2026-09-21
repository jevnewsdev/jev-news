// Custom Worker entry: OpenNext handles fetch; the cron trigger runs the
// same Jev pipeline autonomously every 6 hours.
import handler from "../.open-next/worker.js";
import { runAgent } from "../src/agent/run";
import { saveRunTo, type KV } from "../src/lib/store";

interface Env {
  OPENROUTER_API_KEY: string;
  JEV_MODEL?: string;
  JEV_KV: KV;
}

export default {
  fetch: handler.fetch,

  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(
      (async () => {
        const result = await runAgent(
          { apiKey: env.OPENROUTER_API_KEY, model: env.JEV_MODEL },
          "cron",
          () => {}, // no live listeners on cron runs
        );
        await saveRunTo(env.JEV_KV, result);
        console.log(
          `cron run ${result.id}: ${result.articlesScanned} articles, ${result.judgmentCount} judgments, $${result.costUsd}`,
        );
      })(),
    );
  },
};

// Re-export Durable Objects used by the OpenNext worker, if any.
export * from "../.open-next/worker.js";
