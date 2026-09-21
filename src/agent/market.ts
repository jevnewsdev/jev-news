import type { MarketSnapshot } from "./types";

/** 5-day price/volume snapshot from Yahoo Finance's public chart API (no key). */
export async function fetchMarket(symbol: string): Promise<MarketSnapshot> {
  const empty: MarketSnapshot = { ticker: symbol, price: null, change5dPct: null, volumeRatio: null };
  try {
    const ySymbol = symbol.replace(".", "-"); // BRK.B -> BRK-B
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ySymbol}?range=5d&interval=1d`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (jevnews)" } });
    if (!res.ok) return empty;
    const data = (await res.json()) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number }; indicators?: { quote?: { close?: (number | null)[]; volume?: (number | null)[] }[] } }[] };
    };
    const r = data.chart?.result?.[0];
    if (!r) return empty;
    const closes = (r.indicators?.quote?.[0]?.close ?? []).filter((v): v is number => v != null);
    const volumes = (r.indicators?.quote?.[0]?.volume ?? []).filter((v): v is number => v != null && v > 0);
    const price = r.meta?.regularMarketPrice ?? closes.at(-1) ?? null;
    const change5dPct =
      closes.length >= 2 && closes[0] !== 0 ? ((closes.at(-1)! - closes[0]) / closes[0]) * 100 : null;
    const volumeRatio =
      volumes.length >= 2
        ? volumes.at(-1)! / (volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1))
        : null;
    return {
      ticker: symbol,
      price: price != null ? Math.round(price * 100) / 100 : null,
      change5dPct: change5dPct != null ? Math.round(change5dPct * 100) / 100 : null,
      volumeRatio: volumeRatio != null ? Math.round(volumeRatio * 100) / 100 : null,
    };
  } catch {
    return empty;
  }
}
