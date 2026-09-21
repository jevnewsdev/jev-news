import type { Article, CatalystType, Judgment, Ticker } from "./types";

// Jev is TypeSafe's System One judgment model, served through OpenRouter's
// Decisions API. No text generation: state in, calibrated typed answers out.
const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
export const DEFAULT_MODEL = "typesafe/jev-1.13";
export const QUESTIONS_PER_ARTICLE = 5;

const CATALYSTS: Record<CatalystType, string> = {
  earnings: "Earnings report, guidance, or financial results",
  product: "Product launch, technology, or partnership",
  regulatory: "Regulation or government action",
  macro: "Macro-economic or market-wide news",
  analyst: "Analyst rating, price target, or fund flows",
  ma: "Merger, acquisition, or investment stake",
  legal: "Lawsuit or legal ruling",
  insider: "Insider or institutional buying/selling",
  other: "Anything else",
};

type Question =
  | { type: "noul"; instructions: string }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

interface Answer {
  type: string;
  noul?: number;
  choice?: string;
  score?: number;
  probabilities?: Record<string, number>;
  confidence?: number;
}

interface DecisionsResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number; cost: number };
}

export interface JudgeResult {
  judgments: Judgment[];
  judgmentCount: number;
  costUsd: number;
  model: string;
}

/**
 * One Jev call per ticker: all articles go in as numbered state, five typed
 * questions per article come back as calibrated answers.
 */
export async function judgeArticles(
  ticker: Ticker,
  articles: Article[],
  env: { apiKey: string; model?: string },
): Promise<JudgeResult> {
  if (articles.length === 0) return { judgments: [], judgmentCount: 0, costUsd: 0, model: env.model ?? DEFAULT_MODEL };

  const state = {
    company: `${ticker.name} (${ticker.symbol}), sector: ${ticker.sector}`,
    articles: articles.map((a, i) => ({
      n: i,
      headline: a.title,
      source: a.source,
      hours_ago: a.ageHours,
    })),
  };

  const questions: Record<string, Question> = {};
  articles.forEach((a, i) => {
    const about = `article [${i}]`;
    questions[`a${i}_relevant`] = {
      type: "noul",
      instructions: `Is ${about} materially relevant to the stock price of ${ticker.name} (${ticker.symbol})?`,
    };
    questions[`a${i}_bullish`] = {
      type: "noul",
      instructions: `Is ${about} bullish for ${ticker.name} (${ticker.symbol}) stock? (False means bearish or neutral.)`,
    };
    questions[`a${i}_catalyst`] = {
      type: "choice",
      instructions: `What kind of catalyst is ${about} for ${ticker.symbol}?`,
      criteria: CATALYSTS,
    };
    questions[`a${i}_magnitude`] = {
      type: "score",
      instructions: `How strongly could ${about} move ${ticker.symbol} stock over the coming weeks?`,
      criteria: ["Negligible", "Minor", "Moderate", "Strong", "Very strong"],
    };
    questions[`a${i}_horizon`] = {
      type: "choice",
      instructions: `Over what time horizon would ${about} most affect ${ticker.symbol} stock?`,
      criteria: { "7": "About a week", "14": "About two weeks", "30": "About a month", "60": "Two months or more" },
    };
  });

  const res = await fetch(DECISIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: env.model ?? DEFAULT_MODEL, state, questions }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jev decisions call failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as DecisionsResponse;

  const judgments: Judgment[] = articles.map((a, i) => {
    const get = (suffix: string): Answer => data.answers[`a${i}_${suffix}`] ?? { type: "missing" };
    const magnitude = get("magnitude");
    const catalyst = get("catalyst");
    const horizon = get("horizon");
    return {
      articleId: a.id,
      ticker: ticker.symbol,
      relevant: get("relevant").noul ?? 0,
      bullish: get("bullish").noul ?? 0.5,
      magnitude: (magnitude.score ?? 0) / 4, // 0..4 scale -> 0..1
      magnitudeConfidence: magnitude.confidence ?? 0,
      catalyst: (catalyst.choice as CatalystType) ?? "other",
      catalystConfidence: catalyst.confidence ?? 0,
      horizonDays: (Number(horizon.choice ?? 14) as 7 | 14 | 30 | 60) || 14,
      horizonConfidence: horizon.confidence ?? 0,
    };
  });

  return {
    judgments,
    judgmentCount: Object.keys(data.answers).length,
    costUsd: data.usage?.cost ?? 0,
    model: data.model,
  };
}
