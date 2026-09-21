import { UNIVERSE as FALLBACK } from "@/config/universe";
import type { Ticker } from "./types";

// Robinhood Chain's official stock token registry (public, ~195 active tokens).
const ASSETS_API = "https://api.robinhood.com/rhj/assets";

interface RhAsset {
  tokenSymbol: string;
  tokenName: string;
  status: string;
}

const SECTOR_BY_SYMBOL = new Map(FALLBACK.map((t) => [t.symbol, t.sector]));

function cleanName(tokenName: string, symbol: string): string {
  const name = tokenName.replace(/\s*•\s*Robinhood Token\s*$/i, "").trim();
  return name || symbol;
}

/**
 * The live universe, synced from Robinhood's registry on every run.
 * Falls back to the static top-50 list if the API is unreachable.
 */
export async function fetchUniverse(): Promise<Ticker[]> {
  try {
    const res = await fetch(ASSETS_API, { headers: { "User-Agent": "Mozilla/5.0 (jevnews)" } });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as { assets?: RhAsset[] };
    const assets = (data.assets ?? []).filter((a) => a.status === "ASSET_STATUS_ACTIVE" && a.tokenSymbol);
    if (assets.length < 20) return FALLBACK; // implausibly small payload, trust the fallback
    const seen = new Set<string>();
    const universe: Ticker[] = [];
    for (const a of assets) {
      if (seen.has(a.tokenSymbol)) continue;
      seen.add(a.tokenSymbol);
      const name = cleanName(a.tokenName, a.tokenSymbol);
      universe.push({
        symbol: a.tokenSymbol,
        name,
        query: name,
        sector: SECTOR_BY_SYMBOL.get(a.tokenSymbol) ?? "Robinhood Chain",
      });
    }
    return universe;
  } catch {
    return FALLBACK;
  }
}
