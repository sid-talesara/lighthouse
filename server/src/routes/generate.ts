import { Router } from "express";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ZodError } from "zod";

import { buildAnalysisPrompt } from "../agent/prompt.js";
import { runClaudeAgent } from "../agent/run-claude.js";
import { writeFileAtomic } from "../utils/atomic-write.js";
import { validateRepoPath } from "../utils/path-safety.js";
import { LighthouseDataSchema } from "../validate/schema.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DATA_JSON_PATH = join(REPO_ROOT, "public", "data.json");

export const generateRouter = Router();

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) return raw.slice(start, end + 1);

  return raw.trim();
}

function formatError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "data"}: ${issue.message}`)
      .join("; ");
  }

  if (error instanceof SyntaxError) return `Agent returned invalid JSON: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

function statusForError(message: string): number {
  return message.startsWith("repoPath") ? 400 : 500;
}

generateRouter.post("/generate", async (req, res) => {
  try {
    const repoPath = validateRepoPath(req.body?.repoPath);
    const rawResult = await runClaudeAgent(repoPath, buildAnalysisPrompt());
    const jsonText = extractJson(rawResult);
    const parsed = JSON.parse(jsonText);
    const validated = LighthouseDataSchema.parse(parsed);

    writeFileAtomic(DATA_JSON_PATH, `${JSON.stringify(validated, null, 2)}\n`);

    res.json({ ok: true, dataPath: DATA_JSON_PATH });
  } catch (error) {
    const message = formatError(error);
    console.error("[companion] generate failed:", message);
    res.status(statusForError(message)).json({ error: message });
  }
});
