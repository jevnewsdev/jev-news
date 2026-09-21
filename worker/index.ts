// Custom Worker entry: OpenNext handles fetch; the cron trigger runs the
// same Jev pipeline autonomously every 15 minutes.
import handler from "../.open-next/worker.js";
import { runAgent } from "../src/agent/run";
import { maybePostSignal } from "../src/agent/xpost";
import { saveRunTo, type KV } from "../src/lib/store";

interface Env {
  OPENROUTER_API_KEY: string;
  JEV_MODEL?: string;
  JEV_KV: KV;
  X_CONSUMER_KEY?: string;
  X_CONSUMER_SECRET?: string;
  X_ACCESS_TOKEN?: string;
  X_ACCESS_SECRET?: string;
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
        const creds =
          env.X_CONSUMER_KEY && env.X_CONSUMER_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET
            ? {
                consumerKey: env.X_CONSUMER_KEY,
                consumerSecret: env.X_CONSUMER_SECRET,
                accessToken: env.X_ACCESS_TOKEN,
                accessSecret: env.X_ACCESS_SECRET,
              }
            : null;
        await maybePostSignal(env.JEV_KV, creds, result).catch((e) => console.log("xpost error:", e));
        console.log(
          `cron run ${result.id}: ${result.articlesScanned} articles, ${result.judgmentCount} judgments, $${result.costUsd}`,
        );
      })(),
    );
  },
};

// Re-export Durable Objects used by the OpenNext worker, if any.
export * from "../.open-next/worker.js";
