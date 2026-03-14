import "dotenv/config";
import express from "express";
import cors from "cors";
import { db } from "database";
import { sql } from "drizzle-orm";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  await db.execute(sql`SELECT 1`);
  res.json({ status: "ok", db: "connected" });
});

const PORT = process.env["PORT"] ?? 3000;
app.listen(PORT, () => {
  console.log(`platform-service running on port ${PORT}`);
});
