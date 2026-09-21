// Local smoke test: run the pipeline on a few tickers and print the result.
// Usage: OPENROUTER_API_KEY=... npx tsx scripts/test-run.ts [tickerCount]
import { runAgent } from "../src/agent/run";

const count = Number(process.argv[2] ?? 5);

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("OPENROUTER_API_KEY missing");
  process.exit(1);
}

const t0 = Date.now();
runAgent({ apiKey }, "manual", (e) => {
  if (e.type === "scan") console.log(`scan  ${e.ticker}: ${e.articles.length} articles (${e.scanned}/${e.totalTickers})`);
  if (e.type === "judgments") console.log(`judge ${e.ticker}: total ${e.judgmentCount} judgments, $${e.costUsd.toFixed(6)}`);
  if (e.type === "signal") console.log(`SIGNAL ${e.signal.kind} ${e.signal.ticker} score=${e.signal.score} ~${e.signal.horizonDays}d conf=${e.signal.confidence}\n       ${e.signal.rationale}`);
  if (e.type === "error") console.log(`ERROR ${e.message}`);
}, count).then((result) => {
  console.log(`\n--- done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`articles=${result.articlesScanned} judgments=${result.judgmentCount} cost=$${result.costUsd}`);
  console.log("patterns:", result.patterns.map((p) => `${p.catalyst}:${p.count} bull=${p.avgBullish}`).join("  "));
});
