import { Router } from "express";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { z, ZodError } from "zod";

import { AgentCancelledError } from "../agent/agent-types.js";
import { buildQueryPrompt } from "../agent/prompt.js";
import { runAgent } from "../agent/run-agent.js";
import { buildLocalIndexAnswer, buildRankedEvidence, filePathsFromEvidence, highlightsFromEvidence, visualBlocksFromEvidence, wantsDiagram } from "../query/evidence.js";
import type { QueryAnswer, QueryEvidence, QueryVisualBlock } from "../query/types.js";
import { getRepoRoot } from "./file.js";
import { validateRepoPath } from "../utils/path-safety.js";
import { LighthouseDataSchema } from "../validate/schema.js";

const MAX_CODEX_EVIDENCE = 8;
const CODE_RELATED_TERMS =
  /\b(api|auth|build|class|component|database|dependency|endpoint|error|file|flow|function|hook|module|package|pr|pull request|query|route|schema|service|test|worker|where|how)\b/i;
const CODE_PATH_PATTERN = /[A-Za-z0-9_.@-]+\/[A-Za-z0-9_./@-]+|[A-Za-z0-9_-]+\.(ts|tsx|js|jsx|json|css|md|py|go|rs|java|rb|php|yml|yaml)\b/i;
const CHANGE_REVIEW_TERMS = /\b(pr|pull request|change review|review changes|review diff|code review)\b|github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/i;

export const queryRouter = Router();

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

const OptionalStringSchema = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim().length === 0) return undefined;
    return value;
  },
  z.string().trim().min(1).max(500).optional(),
);

const QueryRequestSchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  data: LighthouseDataSchema,
  repoPath: OptionalStringSchema,
  model: OptionalStringSchema,
});

function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "data"}: ${issue.message}`)
    .join("; ");
}

function formatError(error: unknown): string {
  if (error instanceof ZodError) return formatZodIssues(error);
  if (error instanceof Error) return error.message;
  return String(error);
}

function parseQueryRequest(body: unknown): z.infer<typeof QueryRequestSchema> {
  const parsed = QueryRequestSchema.safeParse(body ?? {});
  if (!parsed.success) throw new BadRequestError(formatZodIssues(parsed.error));
  return parsed.data;
}

function validateOptionalRepoPath(repoPath: string | undefined): {
  repoPath?: string;
  status: QueryAnswer["repo_path_status"];
  error?: string;
} {
  if (!repoPath) return { status: "missing" };

  try {
    return { repoPath: validateRepoPath(repoPath), status: "valid" };
  } catch (error) {
    return { status: "invalid", error: formatError(error) };
  }
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) return raw.slice(start, end + 1);

  return raw.trim();
}

function looksCodeRelated(question: string): boolean {
  return CODE_RELATED_TERMS.test(question) || CODE_PATH_PATTERN.test(question);
}

function looksChangeReview(question: string): boolean {
  return CHANGE_REVIEW_TERMS.test(question);
}

function isSafeRepoRelativePath(repoPath: string | undefined, value: string): boolean {
  if (!repoPath) return false;
  if (path.isAbsolute(value) || value.includes("\0")) return false;

  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  if (normalized === "." || normalized.startsWith("../") || normalized === "..") return false;

  const resolved = path.resolve(repoPath, normalized);
  const root = path.resolve(repoPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return false;

  return existsSync(resolved);
}

function sanitizeMermaidSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const source = value.trim();
  if (source.length === 0 || source.length > 4_000) return null;
  if (/<\/?[a-z][\s\S]*>/i.test(source)) return null;
  if (!/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt)\b/m.test(source)) {
    return null;
  }
  return source;
}

function sanitizeCodexVisualBlocks(
  rawBlocks: unknown,
  options: { repoPath: string; allowChangeReview: boolean },
): QueryVisualBlock[] {
  if (!Array.isArray(rawBlocks)) return [];

  return rawBlocks.flatMap((block): QueryVisualBlock[] => {
    if (!block || typeof block !== "object") return [];
    const raw = block as Record<string, unknown>;

    const title =
      typeof raw.title === "string" && raw.title.trim().length > 0
        ? raw.title.trim().slice(0, 80)
        : "Answer diagram";

    if (raw.type === "diagram") {
      const source = sanitizeMermaidSource(raw.source);
      if (!source) return [];

      return [
        {
          type: "diagram",
          title,
          format: "mermaid",
          source,
          items: [],
        },
      ];
    }

    if (raw.type === "change_review") {
      if (!options.allowChangeReview) return [];

      const rawItems = Array.isArray(raw.items) ? raw.items : [];
      const items = rawItems.flatMap((item): QueryVisualBlock["items"] => {
        if (!item || typeof item !== "object") return [];
        const entry = item as Record<string, unknown>;
        if (typeof entry.label !== "string" || entry.label.trim().length === 0) return [];
        const value = typeof entry.value === "string" ? entry.value.replace(/\s+/g, " ").trim() : "";
        if (!value) return [];
        const pathValue = typeof entry.path === "string" && isSafeRepoRelativePath(options.repoPath, entry.path)
          ? entry.path
          : undefined;
        return [
          {
            label: entry.label.trim().slice(0, 48),
            value: value.slice(0, 700),
            path: pathValue,
          },
        ];
      });

      if (items.length === 0) return [];
      const labels = new Set(items.map((item) => item.label.toLowerCase()));
      if (!labels.has("before") || !labels.has("after")) return [];

      return [
        {
          type: "change_review",
          title: title === "Answer diagram" ? "Change review" : title,
          items: items.slice(0, 8),
        },
      ];
    }

    return [];
  });
}

function runGit(repoPath: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repoPath,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 4_000,
    }).trim();
  } catch {
    return "";
  }
}

function changedPathsFromStatus(status: string): string[] {
  return status
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const value = line.slice(3).trim();
      const renamed = value.split(" -> ");
      return renamed[renamed.length - 1] ?? value;
    })
    .filter((filePath) => filePath.length > 0 && !filePath.startsWith(".."))
    .slice(0, 12);
}

function summarizeChangedSurface(paths: string[]): string {
  const surfaces = new Set<string>();
  for (const filePath of paths) {
    if (filePath === "src/App.tsx") surfaces.add("application shell, onboarding, and top-level query state");
    else if (filePath.startsWith("server/src/routes/")) surfaces.add("backend API routes");
    else if (filePath.startsWith("server/src/agent/")) surfaces.add("local Codex prompt/runtime orchestration");
    else if (filePath.startsWith("server/src/validate/") || filePath.startsWith("src/types/")) surfaces.add("generated map data contract");
    else if (filePath.startsWith("src/components/views/")) surfaces.add("code intelligence views");
    else if (filePath.startsWith("src/components/wiki/")) surfaces.add("module wiki source/details panels");
    else if (filePath.startsWith("src/lib/")) surfaces.add("client data loading and file-content utilities");
    else if (filePath.startsWith("public/")) surfaces.add("generated demo/map data");
    else surfaces.add(filePath.split("/").slice(0, 2).join("/") || filePath);
  }
  return Array.from(surfaces).slice(0, 8).join("; ");
}

function fallbackChangeReviewBlock(markdown: string, repoPath: string): QueryVisualBlock {
  const status = runGit(repoPath, ["status", "--short", "--untracked-files=all"]);
  const stat = runGit(repoPath, ["diff", "--stat", "HEAD"]);
  const changedPaths = changedPathsFromStatus(status);
  const surface = summarizeChangedSurface(changedPaths);
  const pathList = changedPaths.length > 0 ? changedPaths.join(", ") : "no local changed paths were detected";

  return {
    type: "change_review",
    title: "Change review",
    items: [
      {
        label: "Before",
        value: `Before this worktree state, the checked-in app depended on the previous behavior for ${surface || "the inspected repository surfaces"}. Changed paths now under review: ${pathList}.`,
      },
      {
        label: "After",
        value: `After the current changes, Lighthouse should expose the modified behavior in those surfaces. Codex's narrative answer is still shown above; this block is derived from the actual repository diff when the agent response omits structured fields.`,
      },
      {
        label: "Changed surface",
        value: surface || "No categorized changed surface was detected from git status.",
      },
      {
        label: "Risks",
        value: markdown.replace(/\s+/g, " ").trim().slice(0, 700) || "Codex did not return specific risks. Review the changed files and run the relevant UI/API checks before landing.",
      },
      {
        label: "Evidence",
        value: [status, stat].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 700)
          || "git status and git diff --stat did not return local evidence.",
      },
    ],
  };
}

function sanitizeCodexAnswer(input: {
  raw: unknown;
  evidence: QueryEvidence[];
  fallback: QueryAnswer;
  events: QueryAnswer["query_events"];
  repoPath: string;
  directMode: boolean;
  directReason?: string;
  includeDiagram: boolean;
  changeReview: boolean;
}): QueryAnswer {
  const raw = input.raw && typeof input.raw === "object" ? (input.raw as Record<string, unknown>) : {};
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const validHighlightIds = new Set(input.fallback.highlight_ids);
  const validPaths = new Set(input.fallback.file_paths);

  const markdown = typeof raw.markdown === "string" && raw.markdown.trim().length > 0
    ? raw.markdown.trim()
    : input.fallback.markdown;

  const requestedEvidence = Array.isArray(raw.evidence_ids)
    ? raw.evidence_ids.filter((id): id is string => typeof id === "string" && evidenceById.has(id))
    : [];
  const selectedEvidence = requestedEvidence.length > 0
    ? requestedEvidence.map((id) => evidenceById.get(id)).filter((item): item is QueryEvidence => Boolean(item))
    : input.evidence.slice(0, MAX_CODEX_EVIDENCE);

  const requestedHighlights = Array.isArray(raw.highlight_ids)
    ? raw.highlight_ids.filter((id): id is string => typeof id === "string" && validHighlightIds.has(id))
    : [];
  const highlightIds = requestedHighlights.length > 0 ? requestedHighlights : input.fallback.highlight_ids;

  const requestedPaths = Array.isArray(raw.file_paths)
    ? raw.file_paths.filter((filePath): filePath is string => {
      if (typeof filePath !== "string") return false;
      return validPaths.has(filePath) || isSafeRepoRelativePath(input.repoPath, filePath);
    })
    : [];
  const filePaths = requestedPaths.length > 0 ? requestedPaths : filePathsFromEvidence(selectedEvidence);
  const codexVisualBlocks = sanitizeCodexVisualBlocks(raw.visual_blocks, {
    repoPath: input.repoPath,
    allowChangeReview: input.changeReview,
  });
  const hasChangeReviewBlock = codexVisualBlocks.some((block) => block.type === "change_review");
  const needsChangeReviewBlock = Boolean(input.directReason?.toLowerCase().includes("change review"));
  const visualBlocks = needsChangeReviewBlock && !hasChangeReviewBlock
    ? [fallbackChangeReviewBlock(markdown, input.repoPath), ...codexVisualBlocks]
    : codexVisualBlocks;
  const evidenceVisualBlocks = visualBlocksFromEvidence(selectedEvidence, { includeDiagram: input.includeDiagram });

  return {
    source: "local-codex",
    source_reason: input.directMode
      ? input.directReason ?? "Local Codex used direct read-only repository search because the map had no matching evidence."
      : "Local Codex used because a valid repository path was configured and map evidence matched.",
    attempted_codex: true,
    indexing_mode: input.directMode ? "local-codex-direct" : "local-codex-with-map-evidence",
    markdown,
    highlight_ids: highlightIds,
    evidence: selectedEvidence,
    file_paths: filePaths,
    visual_blocks: visualBlocks.length > 0 ? [...visualBlocks, ...evidenceVisualBlocks] : evidenceVisualBlocks,
    query_events: input.events,
    repo_path_status: "valid",
  };
}

async function answerWithCodex(input: {
  question: string;
  repoPath: string;
  model?: string;
  evidence: QueryEvidence[];
  fallback: QueryAnswer;
  signal?: AbortSignal;
  directMode?: boolean;
  directReason?: string;
  includeDiagram?: boolean;
  changeReview?: boolean;
}): Promise<QueryAnswer> {
  const events: QueryAnswer["query_events"] = [];
  const prompt = buildQueryPrompt({
    question: input.question,
    evidenceJson: JSON.stringify(
      input.evidence.slice(0, MAX_CODEX_EVIDENCE).map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        summary: item.summary,
        highlight_ids: item.highlightIds,
        paths: item.paths,
      })),
      null,
      2,
    ),
  });

  const rawResult = await runAgent({
    repoPath: input.repoPath,
    model: input.model,
    signal: input.signal,
    prompt,
    onProgress: (event) => {
      events.push({
        type: event.type,
        message: event.message,
        elapsedMs: event.elapsedMs,
        codexType: event.codexType,
      });
    },
  });
  const parsed = JSON.parse(extractJson(rawResult));
  return sanitizeCodexAnswer({
    raw: parsed,
    evidence: input.evidence,
    fallback: input.fallback,
    events,
    repoPath: input.repoPath,
    directMode: Boolean(input.directMode),
    directReason: input.directReason,
    includeDiagram: Boolean(input.includeDiagram),
    changeReview: Boolean(input.changeReview),
  });
}

queryRouter.post("/query", async (req, res) => {
  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abortController.abort();
  });

  try {
    const { question, data, repoPath, model } = parseQueryRequest(req.body);
    const evidence = buildRankedEvidence({ question, data });
    const repo = validateOptionalRepoPath(repoPath ?? data.repo.path ?? getRepoRoot() ?? undefined);
    const includeDiagram = wantsDiagram(question);
    const codeRelated = looksCodeRelated(question);
    const changeReview = looksChangeReview(question);
    const fallback = buildLocalIndexAnswer(
      question,
      data,
      undefined,
      repo.status,
      repo.status === "invalid"
        ? `Local Codex skipped because the repository path is invalid: ${repo.error}`
        : changeReview
          ? "Local Codex skipped because no valid repository path is configured for PR/change review."
          : "No matching map evidence was found. Local Codex was not used because the question did not appear to ask about repository code.",
    );

    if (repo.repoPath && changeReview) {
      try {
        const changeReviewAnswer = await answerWithCodex({
          question,
          repoPath: repo.repoPath,
          model,
          evidence,
          signal: abortController.signal,
          directMode: true,
          directReason: "Local Codex used direct PR/change review mode and inspected repository changes.",
          includeDiagram,
          changeReview: true,
          fallback: {
            ...fallback,
            attempted_codex: true,
            repo_path_status: "valid",
            source_reason: "Local Codex used direct PR/change review mode and inspected repository changes.",
            indexing_mode: "local-codex-direct",
            highlight_ids: highlightsFromEvidence(evidence, data),
            file_paths: filePathsFromEvidence(evidence),
          },
        });
        res.json(changeReviewAnswer);
        return;
      } catch (error) {
        if (error instanceof AgentCancelledError) {
          res.status(499).json({ error: "Query stopped by user." });
          return;
        }

        res.json(
          buildLocalIndexAnswer(
            question,
            data,
            formatError(error),
            "valid",
            "Local Codex PR/change review failed, so deterministic map evidence is shown instead.",
          ),
        );
        return;
      }
    }

    if (evidence.length === 0) {
      if (repo.repoPath) {
        try {
          const directAnswer = await answerWithCodex({
            question,
            repoPath: repo.repoPath,
            model,
            evidence,
            signal: abortController.signal,
            directMode: true,
            directReason: codeRelated
              ? "Local Codex used direct read-only repository search because the map had no matching evidence."
              : "Local Codex used direct read-only repository search because a valid repository path is configured.",
            includeDiagram,
            fallback: {
              ...fallback,
              attempted_codex: true,
              repo_path_status: "valid",
              source_reason: codeRelated
                ? "Local Codex used direct read-only repository search because the map had no matching evidence."
                : "Local Codex used direct read-only repository search because a valid repository path is configured.",
              indexing_mode: "local-codex-direct",
            },
          });
          res.json(directAnswer);
          return;
        } catch (error) {
          if (error instanceof AgentCancelledError) {
            res.status(499).json({ error: "Query stopped by user." });
            return;
          }

          res.json(
            buildLocalIndexAnswer(
              question,
              data,
              formatError(error),
              "valid",
              "Local Codex direct search failed, and the map had no matching evidence.",
            ),
          );
          return;
        }
      }

      res.json({
        ...fallback,
        codex_error: repo.error,
        repo_path_status: repo.status,
      });
      return;
    }

    if (!repo.repoPath) {
      res.json({
        ...fallback,
        codex_error: repo.error,
        repo_path_status: repo.status,
        source_reason: repo.status === "invalid"
          ? `Local Codex skipped because the repository path is invalid: ${repo.error}`
          : "Local Codex skipped because no repository path is configured.",
      });
      return;
    }

    try {
      const codexAnswer = await answerWithCodex({
        question,
        repoPath: repo.repoPath,
        model,
        evidence,
        signal: abortController.signal,
        includeDiagram,
        fallback: {
          ...fallback,
          repo_path_status: "valid",
          source_reason: "Local Codex used because a valid repository path was configured and map evidence matched.",
          highlight_ids: highlightsFromEvidence(evidence, data),
          file_paths: filePathsFromEvidence(evidence),
        },
      });
      res.json(codexAnswer);
    } catch (error) {
      if (error instanceof AgentCancelledError) {
        res.status(499).json({ error: "Query stopped by user." });
        return;
      }
      res.json(
        buildLocalIndexAnswer(
          question,
          data,
          formatError(error),
          "valid",
          "Local Codex failed, so this answer fell back to deterministic map evidence.",
        ),
      );
    }
  } catch (error) {
    const message = formatError(error);
    const status = error instanceof BadRequestError ? 400 : 500;
    res.status(status).json({ error: message });
  }
});
