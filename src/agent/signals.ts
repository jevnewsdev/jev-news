import type { Article, CatalystPattern, CatalystType, Judgment, MarketSnapshot, Signal, Ticker } from "./types";

const RELEVANCE_FLOOR = 0.5;
const BUY_THRESHOLD = 65;
const RISK_THRESHOLD = 35;

const CATALYST_LABEL: Record<CatalystType, string> = {
  earnings: "earnings",
  product: "product",
  regulatory: "regulatory",
  macro: "macro",
  analyst: "analyst",
  ma: "M&A",
  legal: "legal",
  insider: "insider-flow",
  other: "mixed",
};

/** Recency decay: an article loses half its weight every ~18 hours. */
function recencyWeight(ageHours: number): number {
  return Math.pow(0.5, ageHours / 18);
}

export function buildSignal(
  ticker: Ticker,
  articles: Article[],
  judgments: Judgment[],
  market: MarketSnapshot | null,
): Signal | null {
  const byId = new Map(articles.map((a) => [a.id, a]));
  const relevant = judgments.filter((j) => j.relevant >= RELEVANCE_FLOOR && byId.has(j.articleId));
  if (relevant.length === 0) return null;

  let weightSum = 0;
  let directionSum = 0;
  let horizonWeight = 0;
  let horizonSum = 0;
  let confidenceSum = 0;
  for (const j of relevant) {
    const a = byId.get(j.articleId)!;
    const w = j.relevant * (0.3 + 0.7 * j.magnitude) * recencyWeight(a.ageHours);
    const direction = (j.bullish - 0.5) * 2; // -1..1
    weightSum += w;
    directionSum += direction * w;
    horizonSum += j.horizonDays * w * j.magnitude;
    horizonWeight += w * j.magnitude;
    confidenceSum += (j.magnitudeConfidence + j.catalystConfidence + j.horizonConfidence) / 3;
  }
  const composite = weightSum > 0 ? directionSum / weightSum : 0; // -1..1

  // Price context: bullish news on a stock that has not moved yet scores
  // higher; news already priced in (big 5d move in the same direction) is
  // dampened. Small, bounded adjustment.
  let priceAdj = 0;
  if (market?.change5dPct != null) {
    const moved = Math.max(-1, Math.min(1, market.change5dPct / 8)); // ±8% caps
    priceAdj = -0.15 * moved * Math.sign(composite || 1) * Math.abs(composite);
  }

  const intensity = Math.min(1, weightSum / 1.5); // few weak articles -> pull toward 50
  const score = Math.round(50 + (composite + priceAdj) * 50 * intensity);
  const clamped = Math.max(0, Math.min(100, score));

  const kind = clamped >= BUY_THRESHOLD && relevant.length >= 2 ? "BUY" : clamped <= RISK_THRESHOLD ? "RISK" : "WATCH";

  const horizonRaw = horizonWeight > 0 ? horizonSum / horizonWeight : 14;
  const horizonDays = [7, 14, 30, 60].reduce((best, h) =>
    Math.abs(h - horizonRaw) < Math.abs(best - horizonRaw) ? h : best,
  );

  const confidence = Math.round((confidenceSum / relevant.length) * Math.min(1, relevant.length / 4) * 100) / 100;

  const evidence = relevant
    .map((j) => ({ j, a: byId.get(j.articleId)! }))
    .sort((x, y) => y.j.relevant * y.j.magnitude - x.j.relevant * x.j.magnitude)
    .slice(0, 3)
    .map(({ j, a }) => ({ title: a.title, link: a.link, source: a.source, catalyst: j.catalyst, bullish: j.bullish }));

  return {
    ticker: ticker.symbol,
    name: ticker.name,
    sector: ticker.sector,
    kind,
    score: clamped,
    confidence,
    horizonDays,
    rationale: composeRationale(ticker, relevant, market, composite, horizonDays),
    evidence,
    market,
    articleCount: relevant.length,
  };
}

/** Rationale composed purely from Jev's judgments, no text model involved. */
function composeRationale(
  ticker: Ticker,
  relevant: Judgment[],
  market: MarketSnapshot | null,
  composite: number,
  horizonDays: number,
): string {
  const bullishCount = relevant.filter((j) => j.bullish >= 0.5).length;
  const topCatalyst = dominantCatalyst(relevant);
  const avgMag = relevant.reduce((s, j) => s + j.magnitude, 0) / relevant.length;
  const magWord = avgMag >= 0.6 ? "strong" : avgMag >= 0.35 ? "moderate" : "mild";
  const lean = composite >= 0.15 ? "bullish" : composite <= -0.15 ? "bearish" : "mixed";

  let priceNote = "";
  if (market?.change5dPct != null) {
    const c = market.change5dPct;
    if (lean === "bullish" && c < 1) priceNote = ` with the stock ${c < 0 ? `down ${Math.abs(c)}%` : "flat"} over 5d, not yet priced in`;
    else if (lean === "bullish" && c > 4) priceNote = ` though the stock already ran +${c}% over 5d`;
    else if (lean === "bearish" && c > -1) priceNote = ` while the stock ${c > 0 ? `is still up ${c}%` : "has barely moved"} over 5d`;
  }

  return `Jev read ${relevant.length} relevant headlines: ${bullishCount} lean bullish, led by ${magWord} ${CATALYST_LABEL[topCatalyst]} catalysts${priceNote}. Net ${lean} over ~${horizonDays} days.`;
}

function dominantCatalyst(judgments: Judgment[]): CatalystType {
  const weights = new Map<CatalystType, number>();
  for (const j of judgments) {
    weights.set(j.catalyst, (weights.get(j.catalyst) ?? 0) + j.magnitude * j.catalystConfidence + 0.01);
  }
  return [...weights.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function buildPatterns(judgments: Judgment[]): CatalystPattern[] {
  const groups = new Map<CatalystType, Judgment[]>();
  for (const j of judgments) {
    if (j.relevant < RELEVANCE_FLOOR) continue;
    const g = groups.get(j.catalyst) ?? [];
    g.push(j);
    groups.set(j.catalyst, g);
  }
  return [...groups.entries()]
    .map(([catalyst, js]) => ({
      catalyst,
      count: js.length,
      avgBullish: round2(js.reduce((s, j) => s + j.bullish, 0) / js.length),
      avgMagnitude: round2(js.reduce((s, j) => s + j.magnitude, 0) / js.length),
      avgHorizonDays: Math.round(js.reduce((s, j) => s + j.horizonDays, 0) / js.length),
    }))
    .sort((a, b) => b.count - a.count);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
