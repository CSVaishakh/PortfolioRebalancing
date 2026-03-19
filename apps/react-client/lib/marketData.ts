export interface MarketRow {
  date: Date;
  close: number;
}

export interface MarketFeatures {
  market_return_30d: number;
  market_volatility_30d: number;
  market_drawdown_90d: number;
  market_trend: number; // 1 = bullish, 0 = bearish
}

const MONTH_INDEX: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4,  JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseNiftyDate(s: string): Date {
  // Format: "27-FEB-2026"
  const [day, mon, year] = s.trim().split("-");
  return new Date(parseInt(year), MONTH_INDEX[mon.toUpperCase()], parseInt(day));
}

export function parseNiftyCSV(text: string): MarketRow[] {
  const lines = text.replace(/^\uFEFF/, "").split("\n");
  const rows: MarketRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",");
    const close = parseFloat(cols[4]);
    if (isNaN(close)) continue;
    rows.push({ date: parseNiftyDate(cols[0]), close });
  }

  // Ensure chronological order (oldest first)
  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Compute all four market features for the trading day at `idx`.
 * Requires idx >= 89 (need 90 days for drawdown and 50 for MA50).
 * Returns null if there is insufficient history.
 */
export function computeMarketFeatures(rows: MarketRow[], idx: number): MarketFeatures | null {
  if (idx < 89) return null;

  const closes = rows.map((r) => r.close);

  // ── Market Return 30d ─────────────────────────────────────────────────────
  // Mr30 = Close[t] / Close[t-30] − 1
  const market_return_30d = closes[idx] / closes[idx - 30] - 1;

  // ── Market Volatility 30d ─────────────────────────────────────────────────
  // Std-dev of daily returns over the last 30 trading days
  const dailyReturns: number[] = [];
  for (let i = idx - 29; i <= idx; i++) {
    dailyReturns.push(closes[i] / closes[i - 1] - 1);
  }
  const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyReturns.length;
  const market_volatility_30d = Math.sqrt(variance);

  // ── Market Drawdown 90d ───────────────────────────────────────────────────
  // Dt = (Close[t] − max(Close[t−89..t])) / max(Close[t−89..t])
  let hc90 = -Infinity;
  for (let i = idx - 89; i <= idx; i++) {
    if (closes[i] > hc90) hc90 = closes[i];
  }
  const market_drawdown_90d = (closes[idx] - hc90) / hc90;

  // ── Market Trend ──────────────────────────────────────────────────────────
  // MA20 vs MA50 — 1 if bullish, 0 if bearish
  const ma20 = closes.slice(idx - 19, idx + 1).reduce((s, c) => s + c, 0) / 20;
  const ma50 = closes.slice(idx - 49, idx + 1).reduce((s, c) => s + c, 0) / 50;
  const market_trend = ma20 > ma50 ? 1 : 0;

  return { market_return_30d, market_volatility_30d, market_drawdown_90d, market_trend };
}

/** Latest (most recent) market features — used for the live prediction row. */
export function getLatestMarketFeatures(rows: MarketRow[]): MarketFeatures | null {
  return computeMarketFeatures(rows, rows.length - 1);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}
