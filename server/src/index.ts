import cors from "cors";
import express from "express";
import { createServer } from "node:http";

import { generateRouter } from "./routes/generate.js";
import { queryRouter } from "./routes/query.js";

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);
const HOST = "127.0.0.1";
const AGENT_TIMEOUT_MS = 5 * 60 * 1000;

const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api", generateRouter);
app.use("/api", queryRouter);

const httpServer = createServer(app);
httpServer.setTimeout(AGENT_TIMEOUT_MS);
httpServer.listen(PORT, HOST, () => {
  console.log(`[companion] listening on http://${HOST}:${PORT}`);
  console.log("[companion] local-only server; do not expose this port to the internet");
});
