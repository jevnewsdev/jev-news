# Jev for Tokenized Markets

Jev reads the wire for Robinhood tokenized stocks, judges every headline, then issues **BUY / WATCH / RISK** signals with a time horizon.

- **Jev** is [TypeSafe's System One judgment model](https://docs.typesafe.ai), served through OpenRouter's Decisions API (`typesafe/jev-1.13`). It generates no text. Every headline gets 5 calibrated typed judgments (relevance, bullish lean, catalyst type, magnitude, horizon), and signal rationales are composed in code from those numbers.
- A full run over the ~50-ticker universe reads ~400 headlines, makes ~2,000 judgments, takes ~12s, and costs under **$0.01**.
- Runs autonomously every 15 minutes on a Cloudflare Cron Trigger. Visitors get a replay of the latest run, streamed in as if live.

## Stack

Next.js 15 (App Router) → Cloudflare Workers via `@opennextjs/cloudflare`. Persistence in Workers KV (`JEV_KV`). News from Google News RSS, price context from Yahoo Finance's public chart API. No other model or API involved.

```
src/agent/       pipeline: sources → market → jev (judgments) → signals → run (orchestrator)
src/app/api/runs GET: run history / latest (KV)
src/components/  the 3-column live dashboard
worker/index.ts  custom Worker entry: OpenNext fetch + cron `scheduled` handler
```

## Local dev

```bash
npm install
# .dev.vars holds OPENROUTER_API_KEY and JEV_MODEL (gitignored)
npm run dev            # Next dev with Cloudflare bindings (local KV)
npm run test:run 5     # pipeline smoke test on 5 tickers, prints signals + cost
npm run preview        # full Worker build served by wrangler
```

## Deploy

```bash
npx wrangler kv namespace create JEV_KV     # once; put the id in wrangler.jsonc (done)
npx wrangler secret put OPENROUTER_API_KEY  # once
npm run deploy
```

The cron trigger (`*/15 * * * *`) registers automatically on deploy. Tune the universe in `src/config/universe.ts`, thresholds in `src/agent/signals.ts`.

> Research tool, not financial advice. Signals are model output, not recommendations.
