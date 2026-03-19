"use client";

import { useRef, useState } from "react";
import { parsePortfolioFile, type PortfolioHolding } from "@/lib/portfolioParser";
import { parseNiftyCSV, getLatestMarketFeatures } from "@/lib/marketData";
import {
  computePortfolioFeatures,
  buildFeatureVector,
  buildTrainingDataset,
  labelFeatureVector,
  evaluateConditions,
  type PortfolioFeatures,
  type FeatureVector,
  type ConditionResult,
} from "@/lib/featureEngineering";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const MARKET_CSV = "/dataset/NIFTY%20100-01-03-2025-to-01-03-2026.csv";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
  msg: string;
  status: "info" | "ok" | "warn" | "error";
}

interface PredictionResult {
  label: 0 | 1;
  probability: number;
  trainSize: number;
  nRebalance: number;
  nHold: number;
  nDropped: number;
  portfolioFeatures: PortfolioFeatures;
  conditions: ConditionResult[];
  featureVector: FeatureVector;
  weightsUploaded: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(date: string): number {
  const d = new Date(date);
  const now = new Date();
  return Math.max(0, Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function fmt(n: number, decimals = 2): string {
  return (n * 100).toFixed(decimals) + "%";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InteractClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [lastRebalanceDate, setLastRebalanceDate] = useState("");
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<PredictionResult | null>(null);

  function addLog(msg: string, status: LogEntry["status"] = "info") {
    setLog((prev) => [...prev, { msg, status }]);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setFile(dropped); setResult(null); setLog([]); }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked) { setFile(picked); setResult(null); setLog([]); }
  }

  // ── Main pipeline ───────────────────────────────────────────────────────────

  async function runPrediction() {
    if (!file) return;
    setRunning(true);
    setResult(null);
    setLog([]);

    try {
      // ── Step 1: Parse portfolio file ────────────────────────────────────────
      addLog("Parsing portfolio file…");
      const { holdings, errors: parseErrors } = await parsePortfolioFile(file);

      for (const e of parseErrors) addLog(e, parseErrors.some(e => e.startsWith("Missing")) ? "error" : "warn");

      if (!holdings.length) {
        addLog("No valid holdings found. Make sure you are using the provided template.", "error");
        setRunning(false);
        return;
      }
      addLog(`Portfolio parsed — ${holdings.length} holdings loaded.`, "ok");

      // ── Step 2: Load market data ─────────────────────────────────────────────
      addLog("Loading NIFTY 100 market data…");
      const csvText = await fetch(MARKET_CSV).then((r) => r.text());
      const marketRows = parseNiftyCSV(csvText);
      addLog(`Market data loaded — ${marketRows.length} trading days.`, "ok");

      // ── Step 3: Compute portfolio features ───────────────────────────────────
      addLog("Computing portfolio features…");
      const pf = computePortfolioFeatures(holdings);
      addLog(
        `Portfolio features — ${pf.num_stocks} stocks · max weight ${fmt(pf.max_stock_weight)} · drift ${fmt(pf.total_weight_drift)}`,
        "ok"
      );

      // ── Step 4: Build training dataset ───────────────────────────────────────
      addLog("Generating training dataset from historical market data…");
      const { X, y, nRebalance, nHold, nDropped } = buildTrainingDataset(pf, marketRows);

      if (!X.length) {
        addLog("Training dataset is empty — not enough labeled samples.", "error");
        setRunning(false);
        return;
      }
      addLog(
        `Dataset ready — ${X.length} samples (${nRebalance} rebalance · ${nHold} hold · ${nDropped} ambiguous dropped).`,
        "ok"
      );

      const isSingleClass = nRebalance === 0 || nHold === 0;
      if (isSingleClass) {
        addLog(
          `All training samples have the same label (${nRebalance > 0 ? "rebalance" : "hold"}). ` +
          `This usually means portfolio conditions (concentration or drift) dominate every market scenario. ` +
          `The prediction is still valid but reflects a clearly ${nRebalance > 0 ? "unbalanced" : "stable"} portfolio.`,
          "warn"
        );
      }

      // ── Step 5: Load global model weights (optional warm-start) ──────────────
      addLog("Fetching global model weights for warm-start…");
      const token = localStorage.getItem("token");
      let initialCoef: number[][] | null = null;
      let initialIntercept: number[] | null = null;

      if (token) {
        try {
          const res = await fetch(`${API_BASE}/client/model/global`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            initialCoef = data.coef;
            initialIntercept = data.intercept;
            addLog("Global weights loaded — using as warm-start.", "ok");
          } else {
            addLog("No global weights available — training from scratch.", "warn");
          }
        } catch {
          addLog("Could not reach server for global weights — training from scratch.", "warn");
        }
      } else {
        addLog("Not signed in — skipping global weight fetch.", "warn");
      }

      // ── Step 6: Train model locally ──────────────────────────────────────────
      addLog("Training logistic regression model locally…");

      // Dynamic import keeps TF.js out of the SSR bundle
      const { default: LogisticRegression } = await import("@/ts-model/logisticRegression");
      const model = new LogisticRegression({ C: 1.0, max_iter: 200, lr: 0.05 });

      if (initialCoef && initialIntercept) {
        model.setWeights(initialCoef, initialIntercept);
      }

      await model.fit(X, y);

      const trainAccuracy = model.score(X, y);
      addLog(
        isSingleClass
          ? `Model trained — accuracy N/A (single-class training data).`
          : `Model trained — train accuracy ${(trainAccuracy * 100).toFixed(1)}%.`,
        "ok"
      );

      // ── Step 7: Build live prediction feature vector ──────────────────────────
      addLog("Computing live prediction feature vector…");
      const latestMF = getLatestMarketFeatures(marketRows);

      if (!latestMF) {
        addLog("Could not compute latest market features.", "error");
        setRunning(false);
        return;
      }

      const daysRebalance = lastRebalanceDate ? daysSince(lastRebalanceDate) : 0;
      const liveFV = buildFeatureVector(pf, latestMF, daysRebalance) as FeatureVector;

      // ── Step 8: Predict ───────────────────────────────────────────────────────
      addLog("Running prediction…");
      const probas = model.predict_proba([liveFV]);
      const pRebalance = probas[0][1];
      const label = pRebalance >= 0.5 ? 1 : 0;
      const conditions = evaluateConditions(liveFV);

      addLog(
        `Prediction: ${label === 1 ? "REBALANCE" : "HOLD"} (confidence ${(Math.max(pRebalance, 1 - pRebalance) * 100).toFixed(1)}%).`,
        "ok"
      );

      // ── Step 9: Upload weights to server ──────────────────────────────────────
      let weightsUploaded = false;
      if (token) {
        addLog("Uploading model weights to server…");
        try {
          const { coef, intercept } = model.getWeights();
          const res = await fetch(`${API_BASE}/client/model/weights`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ coef, intercept, n_samples: X.length }),
          });
          if (res.ok) {
            weightsUploaded = true;
            addLog("Weights uploaded — contributing to federated model.", "ok");
          } else {
            const body = await res.json().catch(() => ({}));
            addLog(`Weight upload failed (${res.status}): ${body.error ?? "server error"}.`, "warn");
          }
        } catch {
          addLog("Weight upload failed — could not reach server.", "warn");
        }
      } else {
        addLog("Not signed in — weights not uploaded to server.", "warn");
      }

      // ── Done ──────────────────────────────────────────────────────────────────
      setResult({
        label,
        probability: pRebalance,
        trainSize: X.length,
        nRebalance,
        nHold,
        nDropped,
        portfolioFeatures: pf,
        conditions,
        featureVector: liveFV,
        weightsUploaded,
      });
    } catch (err) {
      addLog(`Unexpected error: ${(err as Error).message}`, "error");
    } finally {
      setRunning(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const canRun = !!file && !running;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto border-b border-zinc-800">
        <a href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold text-xs">
            P
          </div>
          <span className="font-semibold tracking-tight">PortfolioIQ</span>
        </a>
        <a href="/auth" className="text-sm text-zinc-400 hover:text-white transition-colors">
          Sign In
        </a>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Portfolio Analysis</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Fill in the template with your holdings, upload it, and get an AI rebalancing recommendation.
          </p>
        </div>

        {/* ── Template download banner ─────────────────────────────────────── */}
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-300">Step 1 — Download the template</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Fill in your holdings using our Excel template. Required columns:{" "}
              <span className="text-zinc-300 font-mono">Symbol · ISIN · Sector · Quantity · Average Buy Price · Current Price</span>
            </p>
          </div>
          <a
            href="/templates/portfolio-template.xlsx"
            download="portfolio-template.xlsx"
            className="shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            Download template
          </a>
        </div>

        {/* ── Upload + Config row ─────────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Upload zone */}
          <div>
            <p className="text-xs font-medium text-zinc-400 mb-2">Step 2 — Upload your filled template</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-xl border-2 border-dashed p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                dragging
                  ? "border-indigo-400 bg-indigo-500/10"
                  : file
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-zinc-700 hover:border-zinc-500"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="text-3xl mb-3">{file ? "📄" : "⬆"}</div>
              {file ? (
                <>
                  <p className="text-sm font-medium text-emerald-400">{file.name}</p>
                  <p className="text-xs text-zinc-500 mt-1">Click to replace</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Drop your filled template here</p>
                  <p className="text-xs text-zinc-500 mt-1">Accepts .xlsx or .csv</p>
                </>
              )}
            </div>
          </div>

          {/* Config */}
          <div>
          <p className="text-xs font-medium text-zinc-400 mb-2">Step 3 — Configure &amp; run</p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-5">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">
                When did you last rebalance?
              </label>
              <input
                type="date"
                value={lastRebalanceDate}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setLastRebalanceDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors [color-scheme:dark]"
              />
              {lastRebalanceDate && (
                <p className="text-xs text-zinc-500 mt-1.5">
                  {daysSince(lastRebalanceDate)} days ago
                </p>
              )}
            </div>

            <button
              onClick={runPrediction}
              disabled={!canRun}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {running ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Running…
                </>
              ) : (
                "Run Prediction"
              )}
            </button>
            {!file && (
              <p className="text-xs text-zinc-600 text-center">Upload your filled template to continue</p>
            )}
          </div>
          </div>
        </div>

        {/* ── Activity Log ────────────────────────────────────────────────── */}
        {log.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Activity Log
            </h2>
            <ul className="space-y-1.5">
              {log.map((entry, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 shrink-0">
                    {entry.status === "ok"    && <span className="text-emerald-400">✓</span>}
                    {entry.status === "warn"  && <span className="text-yellow-400">⚠</span>}
                    {entry.status === "error" && <span className="text-red-400">✗</span>}
                    {entry.status === "info"  && <span className="text-zinc-500">·</span>}
                  </span>
                  <span
                    className={
                      entry.status === "ok"    ? "text-zinc-200"
                      : entry.status === "warn"  ? "text-yellow-300"
                      : entry.status === "error" ? "text-red-300"
                      : "text-zinc-400"
                    }
                  >
                    {entry.msg}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Result ──────────────────────────────────────────────────────── */}
        {result && (
          <div className="space-y-4">
            {/* Main verdict */}
            <div
              className={`rounded-xl border p-6 ${
                result.label === 1
                  ? "border-orange-500/40 bg-orange-500/5"
                  : "border-emerald-500/40 bg-emerald-500/5"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-1">
                    Recommendation
                  </p>
                  <p
                    className={`text-3xl font-bold ${
                      result.label === 1 ? "text-orange-400" : "text-emerald-400"
                    }`}
                  >
                    {result.label === 1 ? "⚖ Rebalance" : "✓ Hold"}
                  </p>
                  <p className="text-sm text-zinc-400 mt-1">
                    Confidence:{" "}
                    <span className="text-white font-medium">
                      {(Math.max(result.probability, 1 - result.probability) * 100).toFixed(1)}%
                    </span>
                    {" "}·{" "}
                    P(rebalance) = {(result.probability * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="text-right text-xs text-zinc-500 space-y-0.5">
                  <p>Trained on {result.trainSize} samples</p>
                  <p>{result.nRebalance} rebalance · {result.nHold} hold</p>
                  <p>{result.nDropped} ambiguous dropped</p>
                  {result.weightsUploaded && (
                    <p className="text-indigo-400">✓ Weights uploaded</p>
                  )}
                </div>
              </div>
            </div>

            {/* Condition groups */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Condition Groups
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {result.conditions.map((c) => (
                  <div
                    key={c.name}
                    className={`rounded-lg p-3 border ${
                      c.triggered
                        ? "border-orange-500/40 bg-orange-500/5"
                        : "border-zinc-700 bg-zinc-800/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={c.triggered ? "text-orange-400" : "text-zinc-500"}>
                        {c.triggered ? "●" : "○"}
                      </span>
                      <span className={`text-sm font-medium ${c.triggered ? "text-orange-300" : "text-zinc-300"}`}>
                        {c.name}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 pl-4">{c.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Portfolio stats */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Portfolio Stats
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Stocks", value: result.portfolioFeatures.num_stocks.toString() },
                  { label: "Max Weight",      value: fmt(result.portfolioFeatures.max_stock_weight) },
                  { label: "Top-3 Concentration", value: fmt(result.portfolioFeatures.top3_concentration) },
                  { label: "Weight Drift",    value: fmt(result.portfolioFeatures.total_weight_drift) },
                  { label: "Portfolio Return", value: fmt(result.portfolioFeatures.portfolio_return) },
                  { label: "Volatility",      value: result.portfolioFeatures.portfolio_volatility.toFixed(5) },
                  { label: "Sector Conc.",    value: fmt(result.portfolioFeatures.sector_concentration) },
                  { label: "Days Since Rebal.", value: result.featureVector[7].toString() },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-xs text-zinc-500">{s.label}</p>
                    <p className="text-sm font-semibold mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Market conditions */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Current Market Conditions (NIFTY 100)
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "30d Return",    value: fmt(result.featureVector[8]) },
                  { label: "30d Volatility", value: fmt(result.featureVector[9]) },
                  { label: "90d Drawdown",  value: fmt(result.featureVector[10]) },
                  {
                    label: "Trend",
                    value: result.featureVector[11] === 1 ? "Bullish" : "Bearish",
                  },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-xs text-zinc-500">{s.label}</p>
                    <p
                      className={`text-sm font-semibold mt-0.5 ${
                        s.label === "Trend"
                          ? result.featureVector[11] === 1
                            ? "text-emerald-400"
                            : "text-red-400"
                          : ""
                      }`}
                    >
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
