import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware.js";
import { runFedAvg } from "./model.route.js";
import {
  getUserById,
  getLatestGlobalModel,
  getLatestUserWeights,
  saveUserWeights,
  getUserModelHistory,
} from "../queries/client.queries.js";

const clientRouter = Router();

// All client routes require a valid JWT
clientRouter.use(authMiddleware);

// ── GET /client/profile ────────────────────────────────────────────────────
// Returns the authenticated user's public profile (no password).
clientRouter.get("/profile", async (req, res: Response) => {
  const userId = (req as AuthRequest).userId;

  const user = await getUserById(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ user });
});

// ── GET /client/model/global ───────────────────────────────────────────────
// Returns the latest global model weights from globalModelHistory.
// The client calls this on app load to warm-start its local TF.js model via
// model.setWeights(coef, intercept).
clientRouter.get("/model/global", async (_req, res: Response) => {
  const row = await getLatestGlobalModel();
  if (!row) {
    res.status(404).json({ error: "No global model available yet" });
    return;
  }

  res.json({
    serialno:  row.serialno,
    coef:      row.coeff,
    intercept: row.intercept,
    timestamp: row.timestamp,
  });
});

// ── GET /client/model/weights ──────────────────────────────────────────────
// Returns the authenticated user's most recent locally-trained weights.
// Used to resume a session without retraining.
clientRouter.get("/model/weights", async (req, res: Response) => {
  const userId = (req as AuthRequest).userId;

  const row = await getLatestUserWeights(userId);
  if (!row) {
    res.status(404).json({ error: "No weights found for this user" });
    return;
  }

  res.json({
    serialno:  row.serialno,
    coef:      row.coeff,
    intercept: row.intercept,
    timestamp: row.timestamp,
  });
});

// ── POST /client/model/weights ─────────────────────────────────────────────
// Submits locally-trained weights after a client-side fit() call.
// Persists a new row in userModelHistory.
// Body: { coef: number[][], intercept: number[], n_samples: number }
// n_samples is validated here but not yet stored — it will be used by the
// aggregation step in model.route.ts once FedAvg is implemented.
clientRouter.post("/model/weights", async (req, res: Response) => {
  const userId = (req as AuthRequest).userId;

  const { coef, intercept, n_samples } = req.body as {
    coef?: number[][];
    intercept?: number[];
    n_samples?: number;
  };

  if (!coef || !intercept || n_samples === undefined) {
    res.status(400).json({ error: "coef, intercept, and n_samples are required" });
    return;
  }

  if (!Array.isArray(coef) || !Array.isArray(intercept)) {
    res.status(400).json({ error: "coef must be number[][] and intercept must be number[]" });
    return;
  }

  const row = await saveUserWeights(userId, coef, intercept);

  // Fire-and-forget: run FedAvg and push aggregated weights to the model-service.
  // Errors are logged but never surface to the client.
  runFedAvg().catch((err) =>
    console.error("[FedAvg] aggregation failed:", (err as Error).message)
  );

  res.status(201).json({
    serialno:  row.serialno,
    coef:      row.coeff,
    intercept: row.intercept,
    timestamp: row.timestamp,
  });
});

// ── GET /client/model/history ──────────────────────────────────────────────
// Paginated list of the user's model snapshots, newest first.
// Query params: page (default 1), limit (default 10, max 50)
clientRouter.get("/model/history", async (req, res: Response) => {
  const userId = (req as AuthRequest).userId;

  const page  = Math.max(1, parseInt(req.query["page"]  as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query["limit"] as string) || 10));
  const offset = (page - 1) * limit;

  const rows = await getUserModelHistory(userId, limit, offset);

  res.json({
    page,
    limit,
    results: rows.map(r => ({
      serialno:  r.serialno,
      coef:      r.coeff,
      intercept: r.intercept,
      timestamp: r.timestamp,
    })),
  });
});

export { clientRouter };
