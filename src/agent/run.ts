import { fetchUniverse } from "./universe";
import { fetchNews } from "./sources";
import { fetchMarket } from "./market";
import { judgeArticles, DEFAULT_MODEL } from "./jev";
import { buildPatterns, buildSignal } from "./signals";
import type { Article, EmitFn, Judgment, RunResult, Signal } from "./types";

export interface RunEnv {
  apiKey: string;
  model?: string;
}

const CONCURRENCY = 6;

/** Simple promise pool. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * The full Jev run: scan news -> judge with Jev -> emit signals.
 * Per-ticker pipelining: each ticker is judged and signalled as soon as its
 * scan completes, so a live dashboard fills in progressively.
 */
export async function runAgent(
  env: RunEnv,
  trigger: "manual" | "cron",
  emit: EmitFn,
  tickerLimit?: number,
): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const universe = (await fetchUniverse()).slice(0, tickerLimit ?? Infinity);
  const allArticles: Article[] = [];
  const allJudgments: Judgment[] = [];
  const signals: Signal[] = [];
  let scanned = 0;
  let judgmentCount = 0;
  let costUsd = 0;
  let model = env.model ?? DEFAULT_MODEL;

  await emit({ type: "stage", stage: "scan" });

  await pool(universe, CONCURRENCY, async (ticker) => {
    const [articles, market] = await Promise.all([fetchNews(ticker), fetchMarket(ticker.symbol)]);
    scanned++;
    allArticles.push(...articles);
    await emit({ type: "scan", ticker: ticker.symbol, articles, scanned, totalTickers: universe.length });
    if (articles.length === 0) return;

    try {
      const judged = await judgeArticles(ticker, articles, env);
      model = judged.model;
      judgmentCount += judged.judgmentCount;
      costUsd += judged.costUsd;
      allJudgments.push(...judged.judgments);
      await emit({ type: "judgments", ticker: ticker.symbol, judgments: judged.judgments, judgmentCount, costUsd });
      await emit({ type: "patterns", patterns: buildPatterns(allJudgments) });

      const signal = buildSignal(ticker, articles, judged.judgments, market);
      if (signal) {
        signals.push(signal);
        await emit({ type: "signal", signal });
      }
    } catch (err) {
      await emit({ type: "error", message: `${ticker.symbol}: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // BUYs first (highest score first), then RISKs (lowest score = most risk first), then WATCH.
  const order = { BUY: 0, RISK: 1, WATCH: 2 } as const;
  signals.sort(
    (a, b) => order[a.kind] - order[b.kind] || (a.kind === "RISK" ? a.score - b.score : b.score - a.score),
  );

  const result: RunResult = {
    id: startedAt,
    startedAt,
    finishedAt: new Date().toISOString(),
    trigger,
    model,
    tickersScanned: scanned,
    articlesScanned: allArticles.length,
    judgmentCount,
    costUsd: Math.round(costUsd * 1e6) / 1e6,
    articles: allArticles,
    judgments: allJudgments,
    patterns: buildPatterns(allJudgments),
    signals,
  };

  await emit({ type: "stage", stage: "done" });
  await emit({ type: "result", result });
  return result;
}
