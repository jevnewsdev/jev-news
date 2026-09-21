import type { KV } from "@/lib/store";
import type { RunResult, Signal } from "./types";

// Auto-posts strong signals to X after a cron run. Dormant unless the four
// X_* secrets are configured on the Worker.

export interface XCreds {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessSecret: string;
}

const BUY_MIN = 75;
const RISK_MAX = 25;
const TICKER_COOLDOWN_H = 24;
const MAX_POSTS_PER_DAY = 6;

const pctEncode = (s: string) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

async function hmacSha1(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** OAuth 1.0a signed POST to the X v2 tweets endpoint. */
export async function postTweet(text: string, creds: XCreds): Promise<{ ok: boolean; detail: string }> {
  const url = "https://api.twitter.com/2/tweets";
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(oauth[k])}`)
    .join("&");
  const base = `POST&${pctEncode(url)}&${pctEncode(paramString)}`;
  const signingKey = `${pctEncode(creds.consumerSecret)}&${pctEncode(creds.accessSecret)}`;
  oauth.oauth_signature = await hmacSha1(signingKey, base);
  const header =
    "OAuth " +
    Object.keys(oauth)
      .sort()
      .map((k) => `${pctEncode(k)}="${pctEncode(oauth[k])}"`)
      .join(", ");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: header, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const body = await res.text();
  return { ok: res.ok, detail: `${res.status} ${body.slice(0, 200)}` };
}

function composeTweet(s: Signal): string {
  const head = `${s.kind} $${s.ticker} on @RobinhoodCrypto chain · score ${s.score} · ~${s.horizonDays}d`;
  const tail = "jevnews.dev · not financial advice";
  const budget = 270 - head.length - tail.length - 4;
  let body = s.rationale;
  if (body.length > budget) body = body.slice(0, budget - 1).replace(/\s+\S*$/, "") + "…";
  return `${head}\n\n${body}\n\n${tail}`;
}

/** Picks at most one strong, non-recently-posted signal from the run and tweets it. */
export async function maybePostSignal(kv: KV, creds: XCreds | null, result: RunResult): Promise<void> {
  if (!creds) return;

  const day = result.id.slice(0, 10);
  const dayCount = Number(((await kv.get(`xposted:day:${day}`, "text")) as string | null) ?? "0");
  if (dayCount >= MAX_POSTS_PER_DAY) return;

  const strong = result.signals
    .filter((s) => (s.kind === "BUY" && s.score >= BUY_MIN) || (s.kind === "RISK" && s.score <= RISK_MAX))
    .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));

  for (const signal of strong) {
    const last = (await kv.get(`xposted:${signal.ticker}`, "text")) as string | null;
    if (last && Date.now() - Date.parse(last) < TICKER_COOLDOWN_H * 3_600_000) continue;

    const { ok, detail } = await postTweet(composeTweet(signal), creds);
    console.log(`xpost ${signal.kind} ${signal.ticker} (${signal.score}): ${ok ? "posted" : "FAILED"} ${ok ? "" : detail}`);
    if (ok) {
      await kv.put(`xposted:${signal.ticker}`, new Date().toISOString());
      await kv.put(`xposted:day:${day}`, String(dayCount + 1));
    }
    return; // one attempt per run, success or not
  }
}
