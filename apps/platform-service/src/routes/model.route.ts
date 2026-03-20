import { Router, Request, Response } from "express";
import { getAllLatestUserWeights, saveGlobalWeights } from "../queries/client.queries.js";

const modelRouter = Router();

const MODEL_SERVICE_URL = process.env["MODEL_SERVICE_URL"] ?? "http://localhost:8000";
const ADMIN_SECRET      = process.env["ADMIN_SECRET"];
if (!ADMIN_SECRET) throw new Error("ADMIN_SECRET env variable is not set");

function requireAdminSecret(req: Request, res: Response): boolean {
  const provided = req.headers["x-admin-secret"];
  if (provided !== ADMIN_SECRET) {
    res.status(403).json({ error: "Invalid admin secret." });
    return false;
  }
  return true;
}

// ── FedAvg helpers ────────────────────────────────────────────────────────────

function avgMatrix(matrices: number[][][]): number[][] {
  const n = matrices.length;
  const rows = matrices[0].length;
  const cols = matrices[0][0].length;

  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) =>
      matrices.reduce((sum, m) => sum + m[i][j], 0) / n
    )
  );
}

function avgVector(vectors: number[][]): number[] {
  const n = vectors.length;
  const len = vectors[0].length;

  return Array.from({ length: len }, (_, i) =>
    vectors.reduce((sum, v) => sum + v[i], 0) / n
  );
}

// ── Exported so client.router can call it directly ────────────────────────────

export async function runFedAvg(): Promise<{
  participants: number;
  serialno: number;
  coeff: number[][];
  intercept: number[];
} | null> {
  const rows = await getAllLatestUserWeights();
  if (!rows.length) return null;

  // Uniform FedAvg — average coeff and intercept across all participants
  const coeff     = avgMatrix(rows.map((r) => r.coeff     as number[][]));
  const intercept = avgVector(rows.map((r) => r.intercept as number[]));

  // Persist aggregated weights to globalModelHistory
  const global = await saveGlobalWeights(coeff, intercept);

  // Push aggregated weights to the model-service
  await fetch(`${MODEL_SERVICE_URL}/weights`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ coeff, intercept }),
  });

  return { participants: rows.length, serialno: global.serialno, coeff, intercept };
}

// ── POST /model/aggregate ─────────────────────────────────────────────────────
// Manually trigger a FedAvg round. Can also be called internally.

modelRouter.post("/aggregate", async (_req, res: Response) => {
  const result = await runFedAvg();

  if (!result) {
    res.status(400).json({ error: "No user weights available for aggregation." });
    return;
  }

  res.json({
    participants: result.participants,
    globalModel: {
      serialno:  result.serialno,
      coeff:     result.coeff,
      intercept: result.intercept,
    },
  });
});

// ── POST /model/seed ──────────────────────────────────────────────────────────
// Admin-only. Trains the model-service directly on the bundled dataset.csv,
// then saves the resulting weights to globalModelHistory so clients can
// warm-start from them.
// Requires header:  x-admin-secret: <ADMIN_SECRET>

modelRouter.post("/seed", async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return;

  let msData: {
    n_samples: number;
    n_features: number;
    classes: number[];
    coeff: number[][];
    intercept: number[];
    message: string;
  };

  try {
    const msRes = await fetch(`${MODEL_SERVICE_URL}/train/dataset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!msRes.ok) {
      const body = await msRes.json().catch(() => ({})) as { detail?: string };
      res.status(502).json({ error: `Model service error: ${body.detail ?? msRes.status}` });
      return;
    }

    msData = await msRes.json();
  } catch (err) {
    res.status(502).json({ error: `Could not reach model service: ${(err as Error).message}` });
    return;
  }

  // Persist the freshly trained weights as a new global model snapshot
  const global = await saveGlobalWeights(msData.coeff, msData.intercept);

  res.json({
    message:    msData.message,
    n_samples:  msData.n_samples,
    n_features: msData.n_features,
    classes:    msData.classes,
    globalModel: {
      serialno:  global.serialno,
      timestamp: global.timestamp,
    },
  });
});

// ── POST /model/train ─────────────────────────────────────────────────────────
// Admin-only. Runs FedAvg over all stored user weights, updates the global
// model in the DB, and pushes the aggregated weights to the model-service.
// Requires header:  x-admin-secret: <ADMIN_SECRET>

modelRouter.post("/train", async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return;

  const rows = await getAllLatestUserWeights();

  if (!rows.length) {
    res.status(400).json({ error: "No user weights in the database yet. Have clients run predictions first." });
    return;
  }

  const coeff     = avgMatrix(rows.map((r) => r.coeff     as number[][]));
  const intercept = avgVector(rows.map((r) => r.intercept as number[]));

  // Save aggregated weights to globalModelHistory
  const global = await saveGlobalWeights(coeff, intercept);

  // Push to model-service  POST /weights  (sets weights on the sklearn model)
  let modelServiceOk = false;
  let modelServiceError: string | null = null;

  try {
    const msRes = await fetch(`${MODEL_SERVICE_URL}/weights`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ coeff, intercept }),
    });
    modelServiceOk = msRes.ok;
    if (!msRes.ok) {
      const body = await msRes.json().catch(() => ({})) as { detail?: string };
      modelServiceError = body.detail ?? `HTTP ${msRes.status}`;
    }
  } catch (err) {
    modelServiceError = (err as Error).message;
  }

  res.status(modelServiceOk ? 200 : 207).json({
    participants:    rows.length,
    globalModel: {
      serialno:  global.serialno,
      timestamp: global.timestamp,
    },
    modelService: modelServiceOk
      ? "weights updated"
      : `unreachable — ${modelServiceError}`,
  });
});

export { modelRouter };
