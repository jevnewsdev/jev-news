"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Article, CatalystPattern, Judgment, RunEvent, RunResult, Signal } from "@/agent/types";
import type { RunSummary } from "@/lib/store";

export interface View {
  status: "loading" | "idle" | "running" | "empty";
  runId: string | null;
  trigger: "manual" | "cron" | null;
  startedAtMs: number | null;
  elapsedS: number;
  tickersScanned: number;
  totalTickers: number;
  articles: Article[]; // newest first
  judgments: Judgment[];
  judgmentCount: number;
  costUsd: number;
  patterns: CatalystPattern[];
  signals: Signal[];
  errors: string[];
  finishedAt: string | null;
}

const EMPTY: View = {
  status: "loading",
  runId: null,
  trigger: null,
  startedAtMs: null,
  elapsedS: 0,
  tickersScanned: 0,
  totalTickers: 0,
  articles: [],
  judgments: [],
  judgmentCount: 0,
  costUsd: 0,
  patterns: [],
  signals: [],
  errors: [],
  finishedAt: null,
};

function fromResult(r: RunResult): View {
  return {
    ...EMPTY,
    status: "idle",
    runId: r.id,
    trigger: r.trigger,
    startedAtMs: Date.parse(r.startedAt),
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

const signalOrder = { BUY: 0, RISK: 1, WATCH: 2 } as const;

export function useRun() {
  const [view, setView] = useState<View>(EMPTY);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const runningRef = useRef(false);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/runs");
      const data = (await res.json()) as { runs: RunSummary[] };
      setHistory(data.runs ?? []);
    } catch {
      /* KV may be empty in fresh envs */
    }
  }, []);

  const loadRun = useCallback(async (id?: string) => {
    setView((v) => ({ ...v, status: "loading" }));
    try {
      const res = await fetch(id ? `/api/runs?id=${encodeURIComponent(id)}` : "/api/runs?latest=1");
      const data = (await res.json()) as { run: RunResult | null };
      setView(data.run ? fromResult(data.run) : { ...EMPTY, status: "empty" });
    } catch {
      setView({ ...EMPTY, status: "empty" });
    }
  }, []);

  useEffect(() => {
    loadRun();
    loadHistory();
  }, [loadRun, loadHistory]);

  // live elapsed timer
  useEffect(() => {
    if (view.status !== "running") return;
    const t = setInterval(() => {
      setView((v) =>
        v.status === "running" && v.startedAtMs ? { ...v, elapsedS: (Date.now() - v.startedAtMs) / 1000 } : v,
      );
    }, 100);
    return () => clearInterval(t);
  }, [view.status]);

  const apply = useCallback((e: RunEvent) => {
    setView((v) => {
      switch (e.type) {
        case "scan":
          return {
            ...v,
            tickersScanned: e.scanned,
            totalTickers: e.totalTickers,
            articles: [...e.articles, ...v.articles],
          };
        case "judgments":
          return { ...v, judgments: [...v.judgments, ...e.judgments], judgmentCount: e.judgmentCount, costUsd: e.costUsd };
        case "patterns":
          return { ...v, patterns: e.patterns };
        case "signal": {
          const signals = [...v.signals, e.signal].sort(
            (a, b) =>
              signalOrder[a.kind] - signalOrder[b.kind] ||
              (a.kind === "RISK" ? a.score - b.score : b.score - a.score),
          );
          return { ...v, signals };
        }
        case "error":
          return { ...v, errors: [...v.errors, e.message] };
        case "result":
          return { ...fromResult(e.result), status: "idle" };
        default:
          return v;
      }
    });
  }, []);

  const startRun = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setView({ ...EMPTY, status: "running", trigger: "manual", startedAtMs: Date.now() });
    try {
      const res = await fetch("/api/run", { method: "POST" });
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
    } catch (err) {
      apply({ type: "error", message: err instanceof Error ? err.message : String(err) });
      setView((v) => ({ ...v, status: v.runId ? "idle" : "empty" }));
    } finally {
      runningRef.current = false;
      loadHistory();
    }
  }, [apply, loadHistory]);

  return { view, history, startRun, loadRun };
}
