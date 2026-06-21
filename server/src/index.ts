import cors from "cors";
import express from "express";
import { createServer } from "node:http";

import { GENERATE_AGENT_TIMEOUT_MS } from "./agent/agent-types.js";
import { generateRouter } from "./routes/generate.js";
import { fileRouter, setRepoRoot } from "./routes/file.js";
import { queryRouter } from "./routes/query.js";
import { validateRepoPath } from "./utils/path-safety.js";

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);
const HOST = "127.0.0.1";
const SERVER_TIMEOUT_MS = GENERATE_AGENT_TIMEOUT_MS + 60_000;

const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  }),
);
app.use(express.json({ limit: "2mb" }));

// ── Capture repoPath from generate requests ────────────────────────────────
// Intercept POST /api/generate (and /api/generate/jobs) to learn which
// repo is being analyzed. This lets the /api/file endpoint resolve
// relative paths without needing to touch generate.ts.
app.use("/api/generate", (req, res, next) => {
  if (req.method === "POST" && req.body && typeof req.body === "object") {
    const raw = (req.body as Record<string, unknown>)["repoPath"];
    try {
      const validated = validateRepoPath(raw);
      setRepoRoot(validated);
    } catch {
      // Invalid repoPath — let generateRouter return the proper 400.
    }
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api", generateRouter);
app.use("/api", fileRouter);
app.use("/api", queryRouter);

const httpServer = createServer(app);
httpServer.setTimeout(SERVER_TIMEOUT_MS);
httpServer.listen(PORT, HOST, () => {
  console.log(`[companion] listening on http://${HOST}:${PORT}`);
  console.log("[companion] local-only server; do not expose this port to the internet");
});
