// Shared types for the Jev pipeline and the dashboard.

export interface Ticker {
  symbol: string;
  name: string;
  /** Query string used for news search (company short name). */
  query: string;
  sector: string;
}

export interface Article {
  id: string; // hash of normalized title
  ticker: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string; // ISO
  ageHours: number;
}

export interface MarketSnapshot {
  ticker: string;
  price: number | null;
  change5dPct: number | null;
  volumeRatio: number | null; // last volume / 5d avg
}

export type CatalystType =
  | "earnings"
  | "product"
  | "regulatory"
  | "macro"
  | "analyst"
  | "ma"
  | "legal"
  | "insider"
  | "other";

export interface Judgment {
  articleId: string;
  ticker: string;
  relevant: number; // 0..1 noul
  bullish: number; // 0..1 noul
  magnitude: number; // 0..1 normalized score
  magnitudeConfidence: number;
  catalyst: CatalystType;
  catalystConfidence: number;
  horizonDays: 7 | 14 | 30 | 60;
  horizonConfidence: number;
}

export type SignalKind = "BUY" | "WATCH" | "RISK";

export interface Signal {
  ticker: string;
  name: string;
  sector: string;
  kind: SignalKind;
  score: number; // 0..100
  confidence: number; // 0..1
  horizonDays: number;
  rationale: string;
  evidence: { title: string; link: string; source: string; catalyst: CatalystType; bullish: number }[];
  market: MarketSnapshot | null;
  articleCount: number;
}

export interface CatalystPattern {
  catalyst: CatalystType;
  count: number;
  avgBullish: number; // 0..1
  avgMagnitude: number; // 0..1
  avgHorizonDays: number;
}

export interface RunResult {
  id: string; // ISO timestamp
  startedAt: string;
  finishedAt: string;
  trigger: "manual" | "cron";
  model: string;
  tickersScanned: number;
  articlesScanned: number;
  judgmentCount: number; // individual typed answers
  costUsd: number;
  articles: Article[];
  judgments: Judgment[];
  patterns: CatalystPattern[];
  signals: Signal[];
}

/** Progress events streamed to the dashboard during a live run. */
export type RunEvent =
  | { type: "stage"; stage: "scan" | "analyse" | "signal" | "done"; }
  | { type: "scan"; ticker: string; articles: Article[]; scanned: number; totalTickers: number }
  | { type: "judgments"; ticker: string; judgments: Judgment[]; judgmentCount: number; costUsd: number }
  | { type: "patterns"; patterns: CatalystPattern[] }
  | { type: "signal"; signal: Signal }
  | { type: "result"; result: RunResult }
  | { type: "error"; message: string };

export type EmitFn = (e: RunEvent) => void | Promise<void>;
