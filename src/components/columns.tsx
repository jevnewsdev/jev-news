"use client";

import type { Article, CatalystPattern, CatalystType, Judgment, Signal } from "@/agent/types";

const CATALYST_LABEL: Record<CatalystType, string> = {
  earnings: "Earnings",
  product: "Product / tech",
  regulatory: "Regulatory",
  macro: "Macro",
  analyst: "Analyst / flows",
  ma: "M&A",
  legal: "Legal",
  insider: "Insider flow",
  other: "Other",
};

export function ColumnHeader({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-4">
      <span className="mono text-[11px] text-[var(--faint)]">{n}</span>
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

export function Counter({
  value,
  label,
  sub,
  accent,
}: {
  value: string;
  label: string;
  sub?: string;
  accent?: "buy" | "risk";
}) {
  const color = accent === "buy" ? "text-[var(--buy)]" : accent === "risk" ? "text-[var(--risk)]" : "metal";
  return (
    <div className="panel px-4 py-3 flex-1 min-w-0">
      <div className={`mono text-[26px] leading-none font-medium ${color}`}>{value}</div>
      <div className="mt-1.5 text-[11px] leading-tight text-[var(--dim)]">
        {label}
        {sub && <span className="block text-[var(--faint)]">{sub}</span>}
      </div>
    </div>
  );
}

/* ---------------- Column 01: scan feed ---------------- */

export function ScanFeed({ articles }: { articles: Article[] }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto scroll-thin pr-1 flex flex-col gap-px">
      {articles.map((a) => (
        <a
          key={a.id}
          href={a.link}
          target="_blank"
          rel="noreferrer"
          className="tick group flex gap-3 px-3 py-2 bg-[var(--panel)] border border-[var(--line)] hover:border-[var(--line-bright)] transition-colors"
        >
          <span className="mono text-[10px] pt-0.5 text-[var(--dim)] w-11 shrink-0">{a.ticker}</span>
          <span className="min-w-0">
            <span className="block text-[12px] leading-snug text-[var(--text)] group-hover:text-white line-clamp-2">
              {a.title}
            </span>
            <span className="mono block mt-0.5 text-[10px] text-[var(--faint)] truncate">
              {a.source} · {a.ageHours < 1 ? "<1h" : `${Math.round(a.ageHours)}h`}
            </span>
          </span>
        </a>
      ))}
      {articles.length === 0 && <div className="text-[12px] text-[var(--faint)] px-3 py-6">No articles yet.</div>}
    </div>
  );
}

/* ---------------- Column 02: scatter + patterns ---------------- */

const H_POS: Record<number, number> = { 7: 0.14, 14: 0.38, 30: 0.63, 60: 0.88 };

function jitter(seed: string, span: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * span;
}

export function JudgmentScatter({ judgments }: { judgments: Judgment[] }) {
  const W = 560;
  const H = 260;
  const pad = { l: 10, r: 10, t: 26, b: 22 };
  const bullishCount = judgments.filter((j) => j.bullish >= 0.6 && j.relevant >= 0.5).length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full panel">
      {/* bullish region box, like the reference's "Proven" region */}
      <rect
        x={pad.l}
        y={pad.t}
        width={W - pad.l - pad.r}
        height={(H - pad.t - pad.b) * 0.4}
        fill="rgba(74,222,128,0.05)"
        stroke="rgba(74,222,128,0.35)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <text x={W - pad.r - 6} y={pad.t + 14} textAnchor="end" className="mono" fontSize="10" fill="var(--buy)">
        Bullish · {bullishCount} headlines
      </text>
      {judgments.map((j) => {
        const x = pad.l + (H_POS[j.horizonDays] + jitter(j.articleId, 0.16)) * (W - pad.l - pad.r);
        const y = pad.t + (1 - j.bullish + jitter(j.articleId + "y", 0.06)) * (H - pad.t - pad.b);
        const r = 1.5 + j.magnitude * 3.5;
        const fill =
          j.relevant < 0.5
            ? "rgba(138,138,148,0.25)"
            : j.bullish >= 0.6
              ? "var(--buy)"
              : j.bullish <= 0.4
                ? "var(--risk)"
                : "#c9c9d2";
        return <circle key={j.articleId + j.ticker} className="tick" cx={x} cy={y} r={r} fill={fill} opacity={0.85} />;
      })}
      {[7, 14, 30, 60].map((d) => (
        <text
          key={d}
          x={pad.l + H_POS[d] * (W - pad.l - pad.r)}
          y={H - 7}
          textAnchor="middle"
          className="mono"
          fontSize="9"
          fill="var(--faint)"
        >
          {d}d
        </text>
      ))}
      <text x={pad.l} y={H - 7} className="mono" fontSize="9" fill="var(--faint)">
        horizon →
      </text>
    </svg>
  );
}

export function PatternTable({ patterns }: { patterns: CatalystPattern[] }) {
  const max = Math.max(1, ...patterns.map((p) => p.count));
  return (
    <div className="mt-3">
      <div className="mono flex text-[10px] text-[var(--faint)] px-3 pb-1.5">
        <span className="flex-1">Catalyst</span>
        <span className="w-24">Bullish lean</span>
        <span className="w-12 text-right">n</span>
        <span className="w-12 text-right">Days</span>
      </div>
      <div className="flex flex-col gap-px">
        {patterns.slice(0, 7).map((p) => {
          const lean = p.avgBullish;
          const leanColor = lean >= 0.6 ? "var(--buy)" : lean <= 0.4 ? "var(--risk)" : "#c9c9d2";
          return (
            <div key={p.catalyst} className="tick flex items-center px-3 py-2 bg-[var(--panel)] border border-[var(--line)]">
              <span className="flex-1 text-[12px]">{CATALYST_LABEL[p.catalyst]}</span>
              <span className="w-24 flex items-center gap-2">
                <span className="h-[3px] w-12 bg-[var(--panel-2)] overflow-hidden">
                  <span className="block h-full" style={{ width: `${lean * 100}%`, background: leanColor }} />
                </span>
                <span className="mono text-[11px]" style={{ color: leanColor }}>
                  {Math.round(lean * 100)}%
                </span>
              </span>
              <span className="mono w-12 text-right text-[11px] text-[var(--dim)]">
                {p.count}
                <span className="text-[var(--faint)]">/{max}</span>
              </span>
              <span className="mono w-12 text-right text-[11px] text-[var(--dim)]">{p.avgHorizonDays}d</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Column 03: signal cards ---------------- */

export function SignalCard({ s }: { s: Signal }) {
  const color = s.kind === "BUY" ? "var(--buy)" : s.kind === "RISK" ? "var(--risk)" : "var(--dim)";
  const bg = s.kind === "BUY" ? "var(--buy-dim)" : s.kind === "RISK" ? "var(--risk-dim)" : "transparent";
  return (
    <div className="tick panel p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="mono text-[10px] px-1.5 py-0.5 border font-medium"
              style={{ color, borderColor: color, background: bg }}
            >
              {s.kind}
            </span>
            <span className="mono text-[13px] font-semibold">{s.ticker}</span>
            <span className="text-[11px] text-[var(--faint)] truncate">{s.name}</span>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--dim)]">{s.rationale}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="mono text-[30px] leading-none font-medium" style={{ color }}>
            {s.score}
          </div>
          <div className="mono mt-1 text-[10px] text-[var(--faint)]">~{s.horizonDays}d</div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="mono text-[10px] text-[var(--faint)]">confidence</span>
        <span className="h-[3px] flex-1 bg-[var(--panel-2)] overflow-hidden">
          <span className="block h-full" style={{ width: `${s.confidence * 100}%`, background: color }} />
        </span>
        <span className="mono text-[10px] text-[var(--dim)]">{Math.round(s.confidence * 100)}%</span>
        {s.market?.change5dPct != null && (
          <span className="mono text-[10px] text-[var(--faint)]">
            5d {s.market.change5dPct >= 0 ? "+" : ""}
            {s.market.change5dPct}%
          </span>
        )}
      </div>
      <div className="mt-2.5 border-t border-[var(--line)] pt-2 flex flex-col gap-1">
        {s.evidence.map((e) => (
          <a
            key={e.link}
            href={e.link}
            target="_blank"
            rel="noreferrer"
            className="group flex items-baseline gap-2 min-w-0"
          >
            <span className="mono text-[9px] shrink-0 text-[var(--faint)]">{CATALYST_LABEL[e.catalyst]}</span>
            <span className="text-[11px] text-[var(--dim)] group-hover:text-[var(--text)] truncate transition-colors">
              {e.title}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
