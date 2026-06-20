import { Router } from "express";
import type { Request } from "express";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z, ZodError } from "zod";

import type { AgentProgressEventType } from "../agent/agent-types.js";
import { AgentCancelledError, AgentTimeoutError } from "../agent/agent-types.js";
import { buildAnalysisPrompt } from "../agent/prompt.js";
import { runAgent } from "../agent/run-agent.js";
import { extractDbTables } from "../repo/db-schema.js";
import { extractPullRequests } from "../repo/git-log.js";
import { indexTrackedFiles } from "../repo/tracked-files.js";
import { writeFileAtomic } from "../utils/atomic-write.js";
import { validateRepoPath } from "../utils/path-safety.js";
import { LighthouseDataSchema } from "../validate/schema.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const GENERATED_DATA_DIR = join(REPO_ROOT, ".lighthouse");
const GENERATED_DATA_PATH = join(GENERATED_DATA_DIR, "data.generated.json");
const JOB_TTL_MS = 15 * 60 * 1000;
const MAX_JOB_EVENTS = 500;
const STATUS_EVENT_INTERVAL_MS = 5_000;

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

type GenerateJobStatus = "queued" | "running" | "done" | "error" | "timeout" | "cancelled";

interface GenerateProgressInput {
  type: AgentProgressEventType;
  message: string;
  codexType?: string;
  elapsedMs?: number;
  phase?: string;
  dataPath?: string;
  error?: string;
}

interface GenerateJobEvent {
  id: number;
  type: AgentProgressEventType;
  phase: string;
  message: string;
  at: string;
  elapsedMs: number;
  codexType?: string;
  dataPath?: string;
  error?: string;
}

interface GenerateJob {
  id: string;
  status: GenerateJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAtMs: number;
  events: GenerateJobEvent[];
  abortController: AbortController;
  error?: string;
  dataPath?: string;
}

const jobs = new Map<string, GenerateJob>();

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
  if (error instanceof AgentCancelledError) return 499;
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

function wantsEventStream(req: { header(name: string): string | undefined; query: Record<string, unknown> }): boolean {
  const accept = req.header("accept") ?? "";
  const acceptsSse = accept.split(",").some((value) => value.trim().startsWith("text/event-stream"));
  return acceptsSse || req.query.stream === "1" || req.query.stream === "true";
}

function sanitizeMessage(message: string, maxLength = 1_200): string {
  const redacted = message.replace(
    /\b(api[_-]?key|authorization|bearer|password|secret|token)\b\s*[:=]\s*("[^"]+"|'[^']+'|\S+)/gi,
    "$1=[redacted]",
  );
  const compact = redacted.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}...`;
}

function phaseForProgress(type: AgentProgressEventType, codexType?: string): string {
  if (type === "codex") {
    const normalized = codexType?.toLowerCase() ?? "";
    if (normalized.includes("reason")) return "reasoning";
    if (normalized.includes("message") || normalized.includes("response")) return "model";
    if (normalized.includes("error")) return "error";
    return "status";
  }

  if (type === "stdout" || type === "stderr") return "log";
  return type;
}

function appendJobEvent(
  job: GenerateJob,
  event: GenerateProgressInput,
): GenerateJobEvent {
  const at = new Date().toISOString();
  const next: GenerateJobEvent = {
    id: job.events.length === 0 ? 1 : job.events[job.events.length - 1].id + 1,
    type: event.type,
    phase: event.phase ?? phaseForProgress(event.type, event.codexType),
    message: sanitizeMessage(event.message),
    at,
    elapsedMs: event.elapsedMs ?? Date.now() - job.startedAtMs,
    codexType: event.codexType,
    dataPath: event.dataPath,
    error: event.error,
  };

  job.events.push(next);
  if (job.events.length > MAX_JOB_EVENTS) job.events.splice(0, job.events.length - MAX_JOB_EVENTS);
  job.updatedAt = at;
  return next;
}

function cleanupJobs(): void {
  const now = Date.now();
  for (const [jobId, job] of jobs) {
    if (now - Date.parse(job.updatedAt) > JOB_TTL_MS) jobs.delete(jobId);
  }
}

function writeSseEvent(res: Response, eventName: string, data: unknown): void {
  const record = data && typeof data === "object" ? (data as { id?: unknown }) : null;
  if (typeof record?.id === "number") {
    res.write(`id: ${record.id}\n`);
  }
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function runGeneration(options: {
  repoPath: string;
  model?: string;
  signal?: AbortSignal;
  onProgress?: (event: GenerateProgressInput) => void;
}): Promise<void> {
  const startedAtMs = Date.now();
  let phase = "command";
  const statusTimer = setInterval(() => {
    options.onProgress?.({
      type: "status",
      phase,
      message: `Generate is still ${phase}.`,
      elapsedMs: Date.now() - startedAtMs,
    });
  }, STATUS_EVENT_INTERVAL_MS);

  options.onProgress?.({
    type: "command",
    phase: "command",
    message: "Launching Codex CLI in JSON mode.",
  });

  try {
    const rawResult = await runAgent({
      repoPath: options.repoPath,
      model: options.model,
      signal: options.signal,
      prompt: buildAnalysisPrompt(),
      onProgress: (event) => {
        options.onProgress?.({
          type: event.type,
          message: event.message,
          elapsedMs: event.elapsedMs,
          codexType: event.codexType,
        });
      },
    });

    phase = "validation";
    options.onProgress?.({
      type: "validation",
      phase,
      message: "Extracting and validating Lighthouse JSON.",
    });
    const jsonText = extractJson(rawResult);
    const parsed = JSON.parse(jsonText);

    phase = "indexing";
    options.onProgress?.({
      type: "status",
      phase,
      message: "Indexing tracked repository files.",
    });
    const indexedFiles = await indexTrackedFiles(options.repoPath);
    options.onProgress?.({
      type: "status",
      phase,
      message: `Indexed ${indexedFiles.length} tracked files.`,
    });

    phase = "enriching";
    options.onProgress?.({
      type: "status",
      phase,
      message: "Extracting changes, database tables, and call graph.",
    });

    const parsedNodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];

    // pullRequests — derived deterministically from git history, mapped to nodes.
    let pullRequests: unknown[] | undefined;
    try {
      const result = await extractPullRequests(options.repoPath, parsedNodes);
      pullRequests = result.pullRequests;
      // Mutate parsed nodes so changed_recently aligns with the recent commits.
      for (const node of parsedNodes) {
        if (result.recentlyChangedNodeIds.has(node?.id)) {
          node.changed_recently = true;
        }
      }
      options.onProgress?.({
        type: "status",
        phase,
        message: `Derived ${pullRequests.length} change records from git history.`,
      });
    } catch (error) {
      console.error("[companion] pullRequests extraction failed:", formatError(error));
    }

    // dbTables — derived deterministically by scanning Drizzle schema files.
    let dbTables: unknown[] | undefined;
    try {
      dbTables = await extractDbTables(options.repoPath, indexedFiles, parsedNodes);
      options.onProgress?.({
        type: "status",
        phase,
        message: `Found ${dbTables.length} database tables.`,
      });
    } catch (error) {
      console.error("[companion] dbTables extraction failed:", formatError(error));
    }

    const validated = LighthouseDataSchema.parse({
      ...parsed,
      files: indexedFiles,
      ...(pullRequests ? { pullRequests } : {}),
      ...(dbTables ? { dbTables } : {}),
    });

    phase = "write";
    options.onProgress?.({
      type: "write",
      phase,
      dataPath: GENERATED_DATA_PATH,
      message: "Writing validated generated data file.",
    });
    mkdirSync(GENERATED_DATA_DIR, { recursive: true });
    writeFileAtomic(GENERATED_DATA_PATH, `${JSON.stringify(validated, null, 2)}\n`);
  } finally {
    clearInterval(statusTimer);
  }
}

function startGenerateJob(repoPath: string, model?: string): GenerateJob {
  cleanupJobs();

  const now = new Date().toISOString();
  const job: GenerateJob = {
    id: randomUUID(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    startedAtMs: Date.now(),
    events: [],
    abortController: new AbortController(),
  };
  jobs.set(job.id, job);
  appendJobEvent(job, {
    type: "queued",
    phase: "queued",
    message: "Generation job queued.",
  });

  void (async () => {
    job.status = "running";
    appendJobEvent(job, {
      type: "starting",
      phase: "starting",
      message: "Generation job started.",
    });

    try {
      await runGeneration({
        repoPath,
        model,
        signal: job.abortController.signal,
        onProgress: (event) => appendJobEvent(job, event),
      });
      job.status = "done";
      job.dataPath = GENERATED_DATA_PATH;
      appendJobEvent(job, {
        type: "done",
        phase: "done",
        dataPath: GENERATED_DATA_PATH,
        message: "Generation complete.",
      });
    } catch (error) {
      const message = formatError(error);
      job.status = error instanceof AgentCancelledError ? "cancelled" : error instanceof AgentTimeoutError ? "timeout" : "error";
      job.error = message;
      appendJobEvent(job, {
        type: error instanceof AgentCancelledError ? "cancelled" : error instanceof AgentTimeoutError ? "timeout" : "error",
        phase: error instanceof AgentCancelledError ? "cancelled" : error instanceof AgentTimeoutError ? "timeout" : "error",
        error: message,
        message,
      });
      console.error("[companion] generate job failed:", message);
    }
  })();

  return job;
}

async function streamGenerationResponse(
  req: Request,
  res: Response,
  options: { repoPath: string; model?: string },
): Promise<void> {
  const abortController = new AbortController();
  const streamId = randomUUID();
  const startedAtMs = Date.now();
  let nextEventId = 1;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const emit = (event: GenerateProgressInput) => {
    const eventId = nextEventId;
    nextEventId += 1;
    const payload = {
      id: eventId,
      jobId: streamId,
      type: event.type,
      phase: event.phase ?? phaseForProgress(event.type, event.codexType),
      message: sanitizeMessage(event.message),
      at: new Date().toISOString(),
      elapsedMs: event.elapsedMs ?? Date.now() - startedAtMs,
      codexType: event.codexType,
      dataPath: event.dataPath,
      error: event.error,
    };
    writeSseEvent(res, event.type, payload);
  };

  emit({
    type: "starting",
    phase: "starting",
    message: "Streaming generation started.",
  });

  req.on("close", () => {
    abortController.abort();
  });

  try {
    await runGeneration({
      repoPath: options.repoPath,
      model: options.model,
      signal: abortController.signal,
      onProgress: emit,
    });
    emit({
      type: "done",
      phase: "done",
      dataPath: GENERATED_DATA_PATH,
      message: "Generation complete.",
    });
  } catch (error) {
    const message = formatError(error);
    const timedOut = error instanceof AgentTimeoutError;
    const cancelled = error instanceof AgentCancelledError;
    emit({
      type: cancelled ? "cancelled" : timedOut ? "timeout" : "error",
      phase: cancelled ? "cancelled" : timedOut ? "timeout" : "error",
      error: message,
      message,
    });
    console.error("[companion] generate stream failed:", message);
  } finally {
    res.end();
  }
}

generateRouter.post("/generate", async (req, res) => {
  try {
    const { repoPath, model } = parseGenerateRequest(req.body);
    if (wantsEventStream(req)) {
      await streamGenerationResponse(req, res, { repoPath, model });
      return;
    }

    const abortController = new AbortController();
    req.on("close", () => abortController.abort());
    await runGeneration({ repoPath, model, signal: abortController.signal });
    res.json({ ok: true, agent: "codex", dataPath: GENERATED_DATA_PATH });
  } catch (error) {
    const message = formatError(error);
    console.error("[companion] generate failed:", message);
    res.status(statusForError(error, message)).json({ error: message });
  }
});

generateRouter.post("/generate/jobs/:jobId/cancel", (req, res) => {
  cleanupJobs();
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Generation job not found or expired." });
    return;
  }

  if (job.status === "done" || job.status === "error" || job.status === "timeout" || job.status === "cancelled") {
    res.json({ ok: true, jobId: job.id, status: job.status });
    return;
  }

  job.abortController.abort();
  job.status = "cancelled";
  job.error = "Generation stopped by user.";
  appendJobEvent(job, {
    type: "cancelled",
    phase: "cancelled",
    error: job.error,
    message: job.error,
  });
  res.json({ ok: true, jobId: job.id, status: job.status });
});

generateRouter.get("/data", (_req, res) => {
  if (!existsSync(GENERATED_DATA_PATH)) {
    res.status(404).json({
      error: "Generated data has not been created yet. Run Generate to create local analysis data.",
    });
    return;
  }

  try {
    const raw = readFileSync(GENERATED_DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const validated = LighthouseDataSchema.parse(parsed);
    res.setHeader("Cache-Control", "no-store");
    res.json(validated);
  } catch (error) {
    const message = formatError(error);
    res.status(500).json({
      generatedData: true,
      error: `Generated data is invalid: ${message}`,
    });
  }
});

generateRouter.post("/generate/jobs", (req, res) => {
  try {
    const { repoPath, model } = parseGenerateRequest(req.body);
    const job = startGenerateJob(repoPath, model);
    res.status(202).json({
      ok: true,
      jobId: job.id,
      status: job.status,
      eventsUrl: `/api/generate/jobs/${job.id}/events`,
      statusUrl: `/api/generate/jobs/${job.id}`,
      cancelUrl: `/api/generate/jobs/${job.id}/cancel`,
    });
  } catch (error) {
    const message = formatError(error);
    res.status(statusForError(error, message)).json({ error: message });
  }
});

generateRouter.get("/generate/jobs/:jobId", (req, res) => {
  cleanupJobs();
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Generation job not found or expired." });
    return;
  }

  res.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    dataPath: job.dataPath,
    error: job.error,
    events: job.events,
  });
});

generateRouter.get("/generate/jobs/:jobId/events", (req, res) => {
  cleanupJobs();
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Generation job not found or expired." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  writeSseEvent(res, "snapshot", {
    jobId: job.id,
    status: job.status,
    dataPath: job.dataPath,
    error: job.error,
    events: job.events,
  });

  let lastEventId = job.events.at(-1)?.id ?? 0;
  const interval = setInterval(() => {
    const currentJob = jobs.get(job.id);
    if (!currentJob) {
      writeSseEvent(res, "error", { error: "Generation job expired." });
      res.end();
      return;
    }

    for (const event of currentJob.events) {
      if (event.id > lastEventId) {
        writeSseEvent(res, "progress", event);
        lastEventId = event.id;
      }
    }

    if (
      currentJob.status === "done" ||
      currentJob.status === "error" ||
      currentJob.status === "timeout" ||
      currentJob.status === "cancelled"
    ) {
      writeSseEvent(res, currentJob.status, {
        jobId: currentJob.id,
        status: currentJob.status,
        dataPath: currentJob.dataPath,
        error: currentJob.error,
      });
      res.end();
    }
  }, 500);

  req.on("close", () => {
    clearInterval(interval);
  });
});
