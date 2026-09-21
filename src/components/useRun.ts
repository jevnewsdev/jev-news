"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Article, CatalystPattern, Judgment, RunEvent, RunResult, Signal } from "@/agent/types";
import { buildPatterns } from "@/agent/signals";
import type { RunSummary } from "@/lib/store";

export interface View {
  status: "loading" | "idle" | "replaying" | "running" | "empty";
  runId: string | null;
  trigger: "manual" | "cron" | null;
  elapsedS: number;
  tickersScanned: number;
  totalTickers: number;
  articles: Article[];
  judgments: Judgment[];
  judgmentCount: number;
  costUsd: number;
  patterns: CatalystPattern[];
  signals: Signal[];
  finishedAt: string | null;
}

const EMPTY: View = {
  status: "loading",
  runId: null,
  trigger: null,
  elapsedS: 0,
  tickersScanned: 0,
  totalTickers: 0,
  articles: [],
  judgments: [],
  judgmentCount: 0,
  costUsd: 0,
  patterns: [],
  signals: [],
  finishedAt: null,
};

const signalOrder = { BUY: 0, RISK: 1, WATCH: 2 } as const;

function sortSignals(signals: Signal[]): Signal[] {
  return [...signals].sort(
    (a, b) =>
      signalOrder[a.kind] - signalOrder[b.kind] || (a.kind === "RISK" ? a.score - b.score : b.score - a.score),
  );
}

function fromResult(r: RunResult): View {
  return {
    ...EMPTY,
    status: "idle",
    runId: r.id,
    trigger: r.trigger,
    elapsedS: (Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000,
    tickersScanned: r.tickersScanned,
    totalTickers: r.tickersScanned,
    articles: [...r.articles].sort((a, b) => a.ageHours - b.ageHours),
    judgments: r.judgments,
    judgmentCount: r.judgmentCount,
    costUsd: r.costUsd,
    patterns: r.patterns,
    signals: r.signals,
    finishedAt: r.finishedAt,
  };
}

const REPLAY_MS = 9000;

export function useRun() {
  const [view, setView] = useState<View>(EMPTY);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const replayTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopReplay = useCallback(() => {
    if (replayTimer.current) clearInterval(replayTimer.current);
    replayTimer.current = null;
  }, []);

  /**
   * Replays a persisted run as if it were live: per-ticker groups of
   * articles, judgments, patterns and signals stream in over ~9s.
   */
  const replay = useCallback(
    (r: RunResult) => {
      stopReplay();
      const final = fromResult(r);
      const tickers = [...new Set(r.articles.map((a) => a.ticker))];
      const byTicker = (t: string) => ({
        articles: r.articles.filter((a) => a.ticker === t),
        judgments: r.judgments.filter((j) => j.ticker === t),
        signal: r.signals.find((s) => s.ticker === t) ?? null,
      });
      if (tickers.length === 0) {
        setView(final);
        return;
      }
      const stepMs = Math.max(80, REPLAY_MS / tickers.length);
      let i = 0;
      const t0 = Date.now();
      setView({ ...EMPTY, status: "replaying", runId: r.id, trigger: r.trigger, totalTickers: r.tickersScanned });
      replayTimer.current = setInterval(() => {
        i++;
        const revealed = tickers.slice(0, i).map(byTicker);
        const articles = revealed.flatMap((g) => g.articles);
        const judgments = revealed.flatMap((g) => g.judgments);
        if (i >= tickers.length) {
          stopReplay();
          setView(final);
          return;
        }
        setView((v) => ({
          ...v,
          status: "replaying",
          elapsedS: (Date.now() - t0) / 1000,
          tickersScanned: Math.round((i / tickers.length) * r.tickersScanned),
          articles: [...articles].reverse(),
          judgments,
          judgmentCount: Math.round((judgments.length / Math.max(1, r.judgments.length)) * r.judgmentCount),
          costUsd: (judgments.length / Math.max(1, r.judgments.length)) * r.costUsd,
          patterns: buildPatterns(judgments),
          signals: sortSignals(revealed.map((g) => g.signal).filter((s): s is Signal => s !== null)),
        }));
      }, stepMs);
    },
    [stopReplay],
  );

  /** Real live run, key-gated: streams NDJSON events from POST /api/run. */
  const startLive = useCallback(
    async (key: string) => {
      stopReplay();
      const t0 = Date.now();
      setView({ ...EMPTY, status: "running", trigger: "manual" });
      const timer = setInterval(() => {
        setView((v) => (v.status === "running" ? { ...v, elapsedS: (Date.now() - t0) / 1000 } : v));
      }, 100);
      const apply = (e: RunEvent) =>
        setView((v) => {
          switch (e.type) {
            case "scan":
              return { ...v, tickersScanned: e.scanned, totalTickers: e.totalTickers, articles: [...e.articles, ...v.articles] };
            case "judgments":
              return { ...v, judgments: [...v.judgments, ...e.judgments], judgmentCount: e.judgmentCount, costUsd: e.costUsd, patterns: buildPatterns([...v.judgments, ...e.judgments]) };
            case "signal":
              return { ...v, signals: sortSignals([...v.signals, e.signal]) };
            case "result":
              return fromResult(e.result);
            default:
              return v;
          }
        });
      try {
        const res = await fetch("/api/run", { method: "POST", headers: { "x-run-key": key } });
        if (!res.ok || !res.body) throw new Error(`run failed (${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              apply(JSON.parse(line) as RunEvent);
            } catch {
              /* partial line */
            }
          }
        }
      } catch {
        setView((v) => (v.status === "running" ? { ...v, status: "idle" } : v));
      } finally {
        clearInterval(timer);
      }
    },
    [stopReplay],
  );

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/runs");
      const data = (await res.json()) as { runs: RunSummary[] };
      setHistory(data.runs ?? []);
    } catch {
      /* fresh env */
    }
  }, []);

  const loadRun = useCallback(
    async (id?: string, opts?: { replay?: boolean }) => {
      stopReplay();
      setView((v) => ({ ...v, status: "loading" }));
      try {
        const res = await fetch(id ? `/api/runs?id=${encodeURIComponent(id)}` : "/api/runs?latest=1");
        const data = (await res.json()) as { run: RunResult | null };
        if (!data.run) setView({ ...EMPTY, status: "empty" });
        else if (opts?.replay) replay(data.run);
        else setView(fromResult(data.run));
      } catch {
        setView({ ...EMPTY, status: "empty" });
      }
    },
    [replay, stopReplay],
  );

  useEffect(() => {
    const key = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("key") : null;
    if (key) startLive(key);
    else loadRun(undefined, { replay: true });
    loadHistory();
    return stopReplay;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { view, history, loadRun };
}
