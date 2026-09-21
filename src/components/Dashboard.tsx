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

export default function Dashboard() {
  const { view: v, history, startRun, loadRun } = useRun();
  const running = v.status === "running";
  const buys = v.signals.filter((s) => s.kind === "BUY").length;
  const risks = v.signals.filter((s) => s.kind === "RISK").length;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-4 min-h-screen flex flex-col">
      {/* header */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[var(--line)] pb-4">
        <Image src="/jevnews-logo.png" alt="jevnews" width={40} height={40} className="rounded-sm" />
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold tracking-tight leading-none metal">Jev for Tokenized Markets</h1>
          <p className="mt-1 text-[11.5px] text-[var(--dim)]">
            Reads the wire for Robinhood tokenized stocks, judges every headline, then issues buy / risk signals.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {history.length > 0 && (
            <select
              aria-label="Run history"
              className="mono bg-[var(--panel)] border border-[var(--line)] text-[11px] text-[var(--dim)] px-2 py-1.5 outline-none"
              value={v.runId ?? ""}
              disabled={running}
              onChange={(e) => e.target.value && loadRun(e.target.value)}
            >
              {history.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.id).toLocaleString()} · {r.buys} buy / {r.risks} risk · {r.trigger}
                </option>
              ))}
            </select>
          )}
          <div className="mono text-[11px] text-[var(--dim)] flex items-center gap-2">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${running ? "live-dot bg-[var(--buy)]" : "bg-[var(--faint)]"}`}
            />
            {running ? (
              <>
                Live run · {v.elapsedS.toFixed(1)}s elapsed · <span className="text-[var(--text)]">{fmtMoney(v.costUsd)}</span> spent
              </>
            ) : v.status === "idle" ? (
              <>
                Run {fmtAgo(v.runId)} · {v.elapsedS.toFixed(1)}s · {fmtMoney(v.costUsd)} · every 6h
              </>
            ) : v.status === "loading" ? (
              "Loading…"
            ) : (
              "No runs yet"
            )}
          </div>
          <button
            onClick={startRun}
            disabled={running}
            className="mono text-[11px] px-3.5 py-1.5 border border-[var(--line-bright)] text-[var(--text)] hover:bg-[var(--panel-2)] hover:border-[var(--silver-lo)] disabled:opacity-40 transition-colors"
          >
            {running ? "RUNNING…" : "▶ RUN JEV"}
          </button>
        </div>
      </header>

      {/* columns */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 pt-5">
        <section className="flex flex-col min-h-0 lg:h-[calc(100vh-140px)]">
          <ColumnHeader n="01" title="Jev scans the wire" />
          <div className="flex gap-2 mb-3">
            <Counter value={String(v.articles.length)} label="headlines pulled" sub="last 48h, Google News" />
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
            <Counter value={fmtMoney(v.costUsd)} label="spent so far" sub={v.judgmentCount ? `${fmtMoney(v.costUsd / Math.max(1, v.judgmentCount))}/judgment` : "typesafe/jev"} />
          </div>
          <JudgmentScatter judgments={v.judgments} />
          <PatternTable patterns={v.patterns} />
        </section>

        <section className="flex flex-col min-h-0 lg:h-[calc(100vh-140px)]">
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
                {v.status === "empty" ? "Hit ▶ RUN JEV to start the first run." : "No signals yet."}
              </div>
            )}
          </div>
        </section>
      </main>

      {v.errors.length > 0 && (
        <div className="mono mt-3 text-[10px] text-[var(--risk)]">
          {v.errors.slice(-2).map((e, i) => (
            <div key={i}>⚠ {e}</div>
          ))}
        </div>
      )}

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
