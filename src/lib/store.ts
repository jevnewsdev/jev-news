import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { RunResult } from "@/agent/types";

// Persistence in Workers KV: one blob per run + an index of run ids.
const INDEX_KEY = "runs:index";
const MAX_RUNS = 40;

export interface RunSummary {
  id: string;
  trigger: "manual" | "cron";
  articlesScanned: number;
  judgmentCount: number;
  costUsd: number;
  buys: number;
  risks: number;
}

export interface KV {
  get(key: string, type: "json"): Promise<unknown>;
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

function kv(): KV | null {
  try {
    const { env } = getCloudflareContext();
    return (env as { JEV_KV?: KV }).JEV_KV ?? null;
  } catch {
    return null;
  }
}

export function getRunEnv(): { apiKey: string; model?: string } {
  let apiKey = process.env.OPENROUTER_API_KEY ?? "";
  let model = process.env.JEV_MODEL;
  try {
    const { env } = getCloudflareContext();
    const e = env as { OPENROUTER_API_KEY?: string; JEV_MODEL?: string };
    apiKey = e.OPENROUTER_API_KEY ?? apiKey;
    model = e.JEV_MODEL ?? model;
  } catch {
    // local dev outside wrangler: fall back to process.env
  }
  return { apiKey, model };
}

export async function saveRun(result: RunResult): Promise<void> {
  return saveRunTo(kv(), result);
}

/** Direct-binding variant for contexts without a request (cron handler). */
export async function saveRunTo(store: KV | null, result: RunResult): Promise<void> {
  if (!store) return;
  const index = ((await store.get(INDEX_KEY, "json")) as RunSummary[] | null) ?? [];
  const summary: RunSummary = {
    id: result.id,
    trigger: result.trigger,
    articlesScanned: result.articlesScanned,
    judgmentCount: result.judgmentCount,
    costUsd: result.costUsd,
    buys: result.signals.filter((s) => s.kind === "BUY").length,
    risks: result.signals.filter((s) => s.kind === "RISK").length,
  };
  const next = [summary, ...index.filter((r) => r.id !== result.id)].slice(0, MAX_RUNS);
  const evicted = index.slice(MAX_RUNS - 1);
  await store.put(`run:${result.id}`, JSON.stringify(result));
  await store.put(INDEX_KEY, JSON.stringify(next));
  for (const old of evicted) {
    if (!next.some((r) => r.id === old.id)) await store.delete(`run:${old.id}`);
  }
}

/**
 * $JEVNEWS contract address. Lives only in KV so the public repo cannot
 * change it; update with:
 * wrangler kv key put --namespace-id <id> --remote "config:ca" "<address>"
 */
export async function getTokenCa(): Promise<string | null> {
  const store = kv();
  if (!store) return null;
  const ca = await store.get("config:ca", "text");
  return ca?.trim() || null;
}

export async function listRuns(): Promise<RunSummary[]> {
  const store = kv();
  if (!store) return [];
  return (((await store.get(INDEX_KEY, "json")) as RunSummary[] | null) ?? []);
}

export async function getRun(id: string): Promise<RunResult | null> {
  const store = kv();
  if (!store) return null;
  return ((await store.get(`run:${id}`, "json")) as RunResult | null) ?? null;
}

export async function getLatestRun(): Promise<RunResult | null> {
  const runs = await listRuns();
  if (runs.length === 0) return null;
  return getRun(runs[0].id);
}
