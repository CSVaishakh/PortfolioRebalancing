import type { PortfolioHolding } from "./portfolioParser";
import type { MarketRow, MarketFeatures } from "./marketData";
import { computeMarketFeatures, daysBetween } from "./marketData";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PortfolioFeatures {
  num_stocks: number;
  max_stock_weight: number;
  top3_concentration: number;
  total_weight_drift: number;
  portfolio_return: number;
  portfolio_volatility: number;
  sector_concentration: number;
}

// Index contract for the 12-element feature vector:
// [0]  num_stocks
// [1]  max_stock_weight
// [2]  top3_concentration
// [3]  total_weight_drift
// [4]  portfolio_return
// [5]  portfolio_volatility
// [6]  sector_concentration
// [7]  days_since_last_rebalance
// [8]  market_return_30d
// [9]  market_volatility_30d
// [10] market_drawdown_90d
// [11] market_trend
export type FeatureVector = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export interface LabeledDataset {
  X: number[][];
  y: number[];
  nRebalance: number;
  nHold: number;
  nDropped: number;
}

// A volatility threshold used in the time_risk condition group.
// Represents the boundary between "low" and "elevated" portfolio volatility.
const VOLATILITY_THRESHOLD = 0.005;

// ── Portfolio feature computation ─────────────────────────────────────────────

export function computePortfolioFeatures(holdings: PortfolioHolding[]): PortfolioFeatures {
  const n = holdings.length;

  // Current market value and portfolio weights
  const currentValues = holdings.map((h) => h.investment_volume * h.current_price);
  const totalValue = currentValues.reduce((a, b) => a + b, 0);
  const weights = currentValues.map((v) => v / totalValue);

  // Individual stock returns: Ri = (currentPrice − avgBuyPrice) / avgBuyPrice
  const stockReturns = holdings.map(
    (h) => (h.current_price - h.avg_buy_price) / h.avg_buy_price
  );

  // Portfolio return: Rp = Σ Wi * Ri
  const portfolio_return = weights.reduce((s, w, i) => s + w * stockReturns[i], 0);

  // Max stock weight
  const max_stock_weight = Math.max(...weights);

  // Top-3 concentration: sum of the three largest weights
  const sortedWeights = [...weights].sort((a, b) => b - a);
  const top3_concentration = sortedWeights.slice(0, Math.min(3, n)).reduce((a, b) => a + b, 0);

  // Total weight drift: Σ |Wi − 1/N|
  const idealWeight = 1 / n;
  const total_weight_drift = weights.reduce((s, w) => s + Math.abs(w - idealWeight), 0);

  // Portfolio volatility: Σ Wi * (Ri − Rp)²
  const portfolio_volatility = weights.reduce(
    (s, w, i) => s + w * (stockReturns[i] - portfolio_return) ** 2,
    0
  );

  // Sector concentration: max of per-sector weight sum
  const sectorWeights: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const sec = holdings[i].sector.trim().toUpperCase();
    sectorWeights[sec] = (sectorWeights[sec] ?? 0) + weights[i];
  }
  const sector_concentration = Math.max(...Object.values(sectorWeights));

  return {
    num_stocks: n,
    max_stock_weight,
    top3_concentration,
    total_weight_drift,
    portfolio_return,
    portfolio_volatility,
    sector_concentration,
  };
}

// ── Feature vector assembly ───────────────────────────────────────────────────

export function buildFeatureVector(
  pf: PortfolioFeatures,
  mf: MarketFeatures,
  days_since_last_rebalance: number
): FeatureVector {
  return [
    pf.num_stocks,
    pf.max_stock_weight,
    pf.top3_concentration,
    pf.total_weight_drift,
    pf.portfolio_return,
    pf.portfolio_volatility,
    pf.sector_concentration,
    days_since_last_rebalance,
    mf.market_return_30d,
    mf.market_volatility_30d,
    mf.market_drawdown_90d,
    mf.market_trend,
  ];
}

// ── Labeling ──────────────────────────────────────────────────────────────────

export function labelFeatureVector(fv: FeatureVector): 0 | 1 | null {
  const [
    ,
    max_stock_weight,
    top3_concentration,
    total_weight_drift,
    ,
    portfolio_volatility,
    sector_concentration,
    days_since_last_rebalance,
    ,
    ,
    market_drawdown_90d,
    market_trend,
  ] = fv;

  const drift_crisis  = total_weight_drift > 0.20 && max_stock_weight > 0.35;
  const market_shock  = market_drawdown_90d < -0.15 && market_trend === 0;
  const time_risk     = days_since_last_rebalance > 90 && portfolio_volatility > VOLATILITY_THRESHOLD;
  const concentration = top3_concentration > 0.60 && sector_concentration > 0.50;

  const groups_triggered = [drift_crisis, market_shock, time_risk, concentration].filter(Boolean).length;

  if (groups_triggered >= 2) return 1;   // clear rebalance
  if (groups_triggered === 1) return null; // ambiguous — drop
  return 0;                              // clear hold
}

// ── Training dataset generation ───────────────────────────────────────────────

/**
 * Generates a labeled dataset by combining static portfolio features with
 * historical market features for each trading day in the CSV.
 *
 * `days_since_last_rebalance` for each training row is computed as the
 * number of calendar days between that market row's date and the most
 * recent date in the dataset — simulating "what if the user last rebalanced
 * on that historical date?"
 *
 * The last row of the market data is reserved for the live prediction step.
 */
export function buildTrainingDataset(
  pf: PortfolioFeatures,
  marketRows: MarketRow[]
): LabeledDataset {
  const X: number[][] = [];
  const y: number[] = [];
  let nDropped = 0;

  const latestDate = marketRows[marketRows.length - 1].date;

  // Reserve the last row for prediction; train on rows [89, len-2]
  for (let i = 89; i < marketRows.length - 1; i++) {
    const mf = computeMarketFeatures(marketRows, i);
    if (!mf) continue;

    // Simulated days_since_last_rebalance: days from this historical date to latest
    const simulatedDays = daysBetween(latestDate, marketRows[i].date);

    const fv = buildFeatureVector(pf, mf, simulatedDays);
    const label = labelFeatureVector(fv);

    if (label === null) {
      nDropped++;
      continue;
    }

    X.push([...fv]);
    y.push(label);
  }

  const nRebalance = y.filter((l) => l === 1).length;
  const nHold = y.filter((l) => l === 0).length;

  return { X, y, nRebalance, nHold, nDropped };
}

// ── Condition diagnostics (for result display) ────────────────────────────────

export interface ConditionResult {
  name: string;
  triggered: boolean;
  description: string;
}

export function evaluateConditions(fv: FeatureVector): ConditionResult[] {
  const [
    ,
    max_stock_weight,
    top3_concentration,
    total_weight_drift,
    ,
    portfolio_volatility,
    sector_concentration,
    days_since_last_rebalance,
    ,
    ,
    market_drawdown_90d,
    market_trend,
  ] = fv;

  return [
    {
      name: "Drift Crisis",
      triggered: total_weight_drift > 0.20 && max_stock_weight > 0.35,
      description: `Weight drift ${(total_weight_drift * 100).toFixed(1)}% (>20%) · Max weight ${(max_stock_weight * 100).toFixed(1)}% (>35%)`,
    },
    {
      name: "Market Shock",
      triggered: market_drawdown_90d < -0.15 && market_trend === 0,
      description: `90d drawdown ${(market_drawdown_90d * 100).toFixed(1)}% (<−15%) · Trend ${market_trend === 0 ? "bearish" : "bullish"}`,
    },
    {
      name: "Time Risk",
      triggered: days_since_last_rebalance > 90 && portfolio_volatility > VOLATILITY_THRESHOLD,
      description: `${days_since_last_rebalance} days since rebalance (>90) · Volatility ${portfolio_volatility.toFixed(4)} (>${VOLATILITY_THRESHOLD})`,
    },
    {
      name: "Concentration",
      triggered: top3_concentration > 0.60 && sector_concentration > 0.50,
      description: `Top-3 concentration ${(top3_concentration * 100).toFixed(1)}% (>60%) · Sector ${(sector_concentration * 100).toFixed(1)}% (>50%)`,
    },
  ];
}
