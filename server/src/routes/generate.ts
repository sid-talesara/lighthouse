import { Router } from "express";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { z, ZodError } from "zod";

import { AgentTimeoutError } from "../agent/agent-types.js";
import { buildAnalysisPrompt } from "../agent/prompt.js";
import { runAgent } from "../agent/run-agent.js";
import { writeFileAtomic } from "../utils/atomic-write.js";
import { validateRepoPath } from "../utils/path-safety.js";
import { LighthouseDataSchema } from "../validate/schema.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DATA_JSON_PATH = join(REPO_ROOT, "public", "data.json");

export const generateRouter = Router();

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

const OptionalModelSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim().length === 0) return undefined;
    return value;
  },
  z.string().trim().min(1).max(200).optional(),
);

const GenerateRequestSchema = z.object({
  repoPath: z.unknown(),
  model: OptionalModelSchema,
});

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) return raw.slice(start, end + 1);

  return raw.trim();
}

function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "data"}: ${issue.message}`)
    .join("; ");
}

function formatError(error: unknown): string {
  if (error instanceof ZodError) {
    return formatZodIssues(error);
  }

  if (error instanceof SyntaxError) return `Agent returned invalid JSON: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

function statusForError(error: unknown, message: string): number {
  if (error instanceof BadRequestError) return 400;
  if (error instanceof AgentTimeoutError) return 504;
  return message.startsWith("repoPath") ? 400 : 500;
}

function parseGenerateRequest(body: unknown): {
  repoPath: string;
  model?: string;
} {
  const parsed = GenerateRequestSchema.safeParse(body ?? {});
  if (!parsed.success) throw new BadRequestError(formatZodIssues(parsed.error));

  return {
    repoPath: validateRepoPath(parsed.data.repoPath),
    model: parsed.data.model,
  };
}

generateRouter.post("/generate", async (req, res) => {
  try {
    const { repoPath, model } = parseGenerateRequest(req.body);
    const rawResult = await runAgent({
      repoPath,
      model,
      prompt: buildAnalysisPrompt(),
    });
    const jsonText = extractJson(rawResult);
    const parsed = JSON.parse(jsonText);
    const validated = LighthouseDataSchema.parse(parsed);

    writeFileAtomic(DATA_JSON_PATH, `${JSON.stringify(validated, null, 2)}\n`);

    res.json({ ok: true, agent: "codex", dataPath: DATA_JSON_PATH });
  } catch (error) {
    const message = formatError(error);
    console.error("[companion] generate failed:", message);
    res.status(statusForError(error, message)).json({ error: message });
  }
});
