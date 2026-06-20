/**
 * GET /api/file?path=<relative-path-within-repo>
 *
 * Returns the text content of a file in the analyzed repository.
 * The repo root must be set via setRepoRoot() before any requests can be served.
 *
 * Response shape (200):
 *   { path: string; content: string; language: string; lines: number; size: number; truncated?: true }
 *
 * Error responses:
 *   400 – missing/invalid path, or path traversal detected
 *   404 – file not found, or repo root not configured
 *   500 – read failure
 */

import { Router } from "express";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";

export const fileRouter = Router();

// ── Repo-root state ─────────────────────────────────────────────────────────
// setRepoRoot() is called by index.ts whenever it intercepts a valid
// POST /api/generate request, so the file endpoint always knows which
// repo to serve — without touching generate.ts.

let _repoRoot: string | null = null;

export function setRepoRoot(absolutePath: string): void {
  _repoRoot = absolutePath;
}

export function getRepoRoot(): string | null {
  return _repoRoot;
}

// ── Language inference (mirrors tracked-files.ts) ───────────────────────────

const EXTENSION_LANGUAGES = new Map<string, string>([
  [".c", "c"],
  [".cc", "cpp"],
  [".cpp", "cpp"],
  [".cs", "csharp"],
  [".css", "css"],
  [".go", "go"],
  [".html", "html"],
  [".java", "java"],
  [".js", "javascript"],
  [".jsx", "jsx"],
  [".json", "json"],
  [".kt", "kotlin"],
  [".kts", "kotlin"],
  [".mjs", "javascript"],
  [".md", "markdown"],
  [".mdx", "markdown"],
  [".php", "php"],
  [".py", "python"],
  [".rb", "ruby"],
  [".rs", "rust"],
  [".scss", "scss"],
  [".sh", "shell"],
  [".sql", "sql"],
  [".swift", "swift"],
  [".ts", "typescript"],
  [".tsx", "tsx"],
  [".vue", "vue"],
  [".xml", "xml"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
]);

const BASENAME_LANGUAGES = new Map<string, string>([
  [".dockerignore", "text"],
  [".env", "text"],
  [".gitignore", "text"],
  ["dockerfile", "dockerfile"],
  ["makefile", "makefile"],
]);

function inferLanguage(filePath: string): string {
  const name = basename(filePath);
  const basenameLanguage = BASENAME_LANGUAGES.get(name.toLowerCase());
  if (basenameLanguage) return basenameLanguage;

  const extension = extname(name).toLowerCase();
  const extensionLanguage = EXTENSION_LANGUAGES.get(extension);
  if (extensionLanguage) return extensionLanguage;

  if (extension) return extension.slice(1);
  return "text";
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 500 * 1024; // 500 KB

// ── Route ────────────────────────────────────────────────────────────────────

fileRouter.get("/file", (req, res) => {
  const root = _repoRoot;
  if (!root) {
    res.status(404).json({
      error:
        "Repository root not configured. Run a Generate job first so the server knows which repo to serve.",
    });
    return;
  }

  const rawPath = req.query["path"];
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    res.status(400).json({ error: "Query param 'path' is required." });
    return;
  }

  // ── Path-traversal guard ─────────────────────────────────────────────────
  // Callers must provide repo-relative paths (e.g. "src/lib/utils.ts").
  // We resolve the final absolute path and verify it stays within the root.
  const requestedRelative = rawPath.trim();

  // Reject absolute paths — callers must provide relative paths only.
  if (requestedRelative.startsWith("/") || requestedRelative.startsWith("\\")) {
    res.status(400).json({ error: "Path must be relative (no leading slash)." });
    return;
  }

  const resolvedRoot = resolve(root);
  const resolvedFile = resolve(join(resolvedRoot, requestedRelative));

  // The resolved file must be a strict descendant of the resolved root.
  // Using the separator-suffixed root prevents "rootExtra/..." from matching "/root".
  if (
    resolvedFile !== resolvedRoot &&
    !resolvedFile.startsWith(resolvedRoot + "/")
  ) {
    res.status(400).json({
      error: "Path traversal detected — path must stay within the repo root.",
    });
    return;
  }

  // ── File existence & type check ──────────────────────────────────────────
  if (!existsSync(resolvedFile)) {
    res.status(404).json({ error: `File not found: ${requestedRelative}` });
    return;
  }

  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(resolvedFile);
  } catch {
    res.status(404).json({ error: `Cannot stat file: ${requestedRelative}` });
    return;
  }

  if (!stat.isFile()) {
    res.status(400).json({
      error: "Path must point to a file, not a directory.",
    });
    return;
  }

  // ── Read content (with size cap) ─────────────────────────────────────────
  const sizeBytes = stat.size;
  const truncated = sizeBytes > MAX_FILE_BYTES;

  let content: string;
  try {
    if (truncated) {
      const buf = Buffer.alloc(MAX_FILE_BYTES);
      const fd = openSync(resolvedFile, "r");
      const bytesRead = readSync(fd, buf, 0, MAX_FILE_BYTES, 0);
      closeSync(fd);
      content =
        buf.slice(0, bytesRead).toString("utf8") +
        "\n\n/* [truncated — file exceeds 500 KB] */";
    } else {
      content = readFileSync(resolvedFile, "utf8");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to read file: ${message}` });
    return;
  }

  const lines = content.split("\n").length;
  const language = inferLanguage(requestedRelative);

  res.setHeader("Cache-Control", "private, max-age=30");
  res.json({
    path: requestedRelative,
    content,
    language,
    lines,
    size: sizeBytes,
    ...(truncated ? { truncated: true } : {}),
  });
});
