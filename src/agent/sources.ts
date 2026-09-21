import type { Article, Ticker } from "./types";

const MAX_ARTICLES_PER_TICKER = 8;
const MAX_AGE_HOURS = 48;

/** Minimal edge-safe RSS <item> extractor, no XML libraries. */
function parseRssItems(xml: string): { title: string; link: string; pubDate: string; source: string }[] {
  const items: { title: string; link: string; pubDate: string; source: string }[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const tag = (name: string) => {
      const r = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`).exec(block);
      return r ? r[1].trim() : "";
    };
    const decode = (s: string) =>
      s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&nbsp;/g, " ")
        .trim();
    items.push({
      title: decode(tag("title")),
      link: decode(tag("link")),
      pubDate: tag("pubDate"),
      source: decode(tag("source")),
    });
  }
  return items;
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
}

async function hashId(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Google News titles end with " - Source"; strip it and use it as source. */
function splitTitleSource(title: string, fallback: string): { title: string; source: string } {
  const i = title.lastIndexOf(" - ");
  if (i > 20) return { title: title.slice(0, i).trim(), source: title.slice(i + 3).trim() };
  return { title, source: fallback };
}

async function fetchFeed(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (jevnews)" } });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Yahoo Finance per-ticker RSS is the primary feed (reachable from Cloudflare's
 * edge). Google News is merged in when reachable (it 503s from datacenter IPs,
 * so in production it usually contributes nothing).
 */
export async function fetchNews(ticker: Ticker): Promise<Article[]> {
  const ySymbol = ticker.symbol.replace(".", "-");
  const yahooUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ySymbol}&region=US&lang=en-US`;
  const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${ticker.query}" stock when:2d`)}&hl=en-US&gl=US&ceid=US:en`;

  const [yahooXml, googleXml] = await Promise.all([fetchFeed(yahooUrl), fetchFeed(googleUrl)]);

  const raw = [
    ...parseRssItems(yahooXml).map((it) => ({ ...it, fallbackSource: "Yahoo Finance" })),
    ...parseRssItems(googleXml).map((it) => ({ ...it, fallbackSource: "Google News" })),
  ];

  const now = Date.now();
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const item of raw) {
    if (!item.title) continue;
    const { title, source } = splitTitleSource(item.title, item.source || item.fallbackSource);
    const norm = normalizeTitle(title);
    if (seen.has(norm)) continue;
    seen.add(norm);
    const published = item.pubDate ? new Date(item.pubDate) : new Date();
    const ageHours = (now - published.getTime()) / 3_600_000;
    if (ageHours > MAX_AGE_HOURS || ageHours < -1) continue;
    out.push({
      id: await hashId(ticker.symbol + norm),
      ticker: ticker.symbol,
      title,
      link: item.link,
      source,
      publishedAt: published.toISOString(),
      ageHours: Math.max(0, Math.round(ageHours * 10) / 10),
    });
    if (out.length >= MAX_ARTICLES_PER_TICKER) break;
  }
  return out;
}
