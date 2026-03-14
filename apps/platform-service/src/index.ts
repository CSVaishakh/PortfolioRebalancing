import "dotenv/config";
import express from "express";
import cors from "cors";
import { db, users } from "database";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  await db.select().from(users).limit(1);
  res.json({ status: "ok", db: "connected" });
});

const PORT = process.env["PORT"] ?? 3000;
app.listen(PORT, () => {
  console.log(`platform-service running on port ${PORT}`);
});
