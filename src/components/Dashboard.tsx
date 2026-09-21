"use client";

import Image from "next/image";
import { useRun } from "./useRun";
import { ColumnHeader, Counter, JudgmentScatter, PatternTable, ScanFeed, SignalCard } from "./columns";

function fmtMoney(n: number): string {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "";
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Next cron fire: every 6h at 00/06/12/18 UTC. */
function fmtNextRun(): string {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(Math.floor(now.getUTCHours() / 6) * 6 + 6);
  const mins = Math.round((next.getTime() - now.getTime()) / 60_000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.5 2h6.4l4.4 5.9L18.9 2zm-1.1 18.1h1.7L7.1 3.8H5.3l12.5 16.3z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.6.5.5 5.6.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C15.3 4.5 16.3 4.8 16.3 4.8c.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.6 18.4.5 12 .5z" />
    </svg>
  );
}

export default function Dashboard() {
  const { view: v, history, loadRun } = useRun();
  const replaying = v.status === "replaying";
  const buys = v.signals.filter((s) => s.kind === "BUY").length;
  const risks = v.signals.filter((s) => s.kind === "RISK").length;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-4 min-h-screen flex flex-col">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-[var(--line)] pb-3.5">
        <Image src="/jevnews-logo.png" alt="jevnews" width={32} height={32} className="rounded-sm shrink-0" />
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight leading-none metal whitespace-nowrap">
            Jev for Tokenized Markets
          </h1>
          <p className="mt-1 text-[10.5px] text-[var(--faint)] truncate hidden sm:block">
            Autonomous. Jev reads the wire every 6h and issues buy / risk signals on Robinhood tokenized stocks.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="mono text-[10.5px] text-[var(--dim)] flex items-center gap-1.5 whitespace-nowrap">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${replaying ? "live-dot bg-[var(--buy)]" : "bg-[var(--buy)]"}`}
            />
            {replaying ? (
              <>replaying · {v.elapsedS.toFixed(1)}s</>
            ) : v.status === "idle" ? (
              <>
                <span className="hidden md:inline">ran {fmtAgo(v.runId)} · </span>next in {fmtNextRun()}
              </>
            ) : v.status === "loading" ? (
              "loading…"
            ) : (
              "first run pending"
            )}
          </span>
          {history.length > 1 && (
            <select
              aria-label="Run history"
              className="mono hidden md:block bg-transparent border-0 text-[10.5px] text-[var(--faint)] outline-none cursor-pointer hover:text-[var(--dim)] max-w-[130px]"
              value={v.runId ?? ""}
              disabled={replaying}
              onChange={(e) => e.target.value && loadRun(e.target.value)}
            >
              {history.map((r) => (
                <option key={r.id} value={r.id} className="bg-[var(--panel)]">
                  {new Date(r.id).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </option>
              ))}
            </select>
          )}
          <span className="w-px h-4 bg-[var(--line)]" />
          <a
            href="https://x.com/JevNewsMarket"
            target="_blank"
            rel="noreferrer"
            aria-label="Jev on X"
            className="text-[var(--dim)] hover:text-[var(--text)] transition-colors"
          >
            <XIcon />
          </a>
          <a
            href="https://github.com/jevnewsdev/jev-news"
            target="_blank"
            rel="noreferrer"
            aria-label="Jev on GitHub"
            className="text-[var(--dim)] hover:text-[var(--text)] transition-colors"
          >
            <GitHubIcon />
          </a>
        </div>
      </header>

      {/* columns */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 pt-5">
        <section className="flex flex-col min-h-0 lg:h-[calc(100vh-130px)]">
          <ColumnHeader n="01" title="Jev scans the wire" />
          <div className="flex gap-2 mb-3">
            <Counter value={String(v.articles.length)} label="headlines pulled" sub="last 48h" />
            <Counter
              value={v.totalTickers ? `${v.tickersScanned}/${v.totalTickers}` : String(v.tickersScanned)}
              label="tokenized stocks"
              sub="Robinhood universe"
            />
          </div>
          <ScanFeed articles={v.articles} />
        </section>

        <section className="flex flex-col min-h-0">
          <ColumnHeader n="02" title="Jev judges every headline" />
          <div className="flex gap-2 mb-3">
            <Counter value={v.judgmentCount.toLocaleString()} label="judgments" sub="5 per headline" />
            <Counter
              value={fmtMoney(v.costUsd)}
              label="spent this run"
              sub={v.judgmentCount ? `${fmtMoney(v.costUsd / Math.max(1, v.judgmentCount))}/judgment` : "typesafe/jev"}
            />
          </div>
          <JudgmentScatter judgments={v.judgments} />
          <PatternTable patterns={v.patterns} />
        </section>

        <section className="flex flex-col min-h-0 lg:h-[calc(100vh-130px)]">
          <ColumnHeader n="03" title="Jev issues signals" />
          <div className="flex gap-2 mb-3">
            <Counter value={String(buys)} label="buy signals" sub="score ≥ 65" accent={buys > 0 ? "buy" : undefined} />
            <Counter value={String(risks)} label="risk signals" sub="score ≤ 35" accent={risks > 0 ? "risk" : undefined} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin pr-1 flex flex-col gap-2">
            {v.signals.map((s) => (
              <SignalCard key={s.ticker} s={s} />
            ))}
            {v.signals.length === 0 && (
              <div className="text-[12px] text-[var(--faint)] px-3 py-6">
                {v.status === "empty" ? "Jev's first scheduled run has not fired yet." : "No signals yet."}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="mt-4 border-t border-[var(--line)] pt-3 pb-1 flex flex-wrap gap-x-4 gap-y-1 items-center">
        <span className="mono text-[10px] text-[var(--faint)]">
          Judged by Jev (TypeSafe System One) via OpenRouter. Typed judgments, no generated text.
        </span>
        <span className="mono text-[10px] text-[var(--faint)] ml-auto">
          Research tool, not financial advice. Signals are model output, not recommendations.
        </span>
      </footer>
    </div>
  );
}
