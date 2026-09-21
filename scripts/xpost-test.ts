// Posts one real signal from the latest run to X, using the exact same
// compose + OAuth code as the Worker.
// Usage: npx tsx scripts/xpost-test.ts [TICKER | --skip TICKER]
import { composeTweet, postTweet } from "../src/agent/xpost";
import type { RunResult } from "../src/agent/types";

const creds = {
  consumerKey: process.env.X_CONSUMER_KEY!,
  consumerSecret: process.env.X_CONSUMER_SECRET!,
  accessToken: process.env.X_ACCESS_TOKEN!,
  accessSecret: process.env.X_ACCESS_SECRET!,
};
if (!creds.consumerKey || !creds.accessSecret) throw new Error("X_* env vars required");

const arg = process.argv[2];
const skip = process.argv[2] === "--skip" ? process.argv[3]?.toUpperCase() : undefined;
const pick = arg && arg !== "--skip" ? arg.toUpperCase() : undefined;

async function main() {
  const { run } = (await (await fetch("https://jevnews.dev/api/runs?latest=1")).json()) as { run: RunResult };
  const signal = pick
    ? run.signals.find((s) => s.ticker === pick)
    : run.signals.find((s) => s.kind !== "WATCH" && s.ticker !== skip);
  if (!signal) throw new Error("no matching signal in latest run");

  const text = composeTweet(signal);
  console.log(`--- tweet (${text.length} chars):\n${text}\n---`);
  const { ok, detail } = await postTweet(text, creds);
  console.log(ok ? `POSTED: ${detail}` : `FAILED: ${detail}`);
}

main();
