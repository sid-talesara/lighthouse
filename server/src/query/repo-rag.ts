import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

import type { QueryEvidence } from "./types.js";

const MAX_FILE_BYTES = 220_000;
const MAX_INDEXED_FILES = 8_000;
const MAX_QUERY_TERMS = 12;
const CACHE_TTL_MS = 60_000;

const SKIP_PATH_PARTS = new Set([
  ".git",
  ".lighthouse",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "vendor",
]);

const SKIP_BASENAMES = new Set([
  "data.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
]);

const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".graphql",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".json",
  ".kt",
  ".kts",
  ".md",
  ".mdx",
  ".mjs",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".ts",
  ".tsx",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);

const STOP_WORDS = new Set([
  "about",
  "after",
  "are",
  "before",
  "does",
  "from",
  "have",
  "how",
  "into",
  "show",
  "tell",
  "that",
  "the",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "works",
  "you",
]);

interface IndexedDoc {
  path: string;
  pathLower: string;
  text: string;
  textLower: string;
  lines: string[];
}

interface RepoIndexCache {
  expiresAt: number;
  docs: IndexedDoc[];
}

const cache = new Map<string, RepoIndexCache>();

function gitLsFiles(repoPath: string): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoPath,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 5_000,
  });

  return output
    .split("\0")
    .filter(Boolean)
    .sort()
    .slice(0, MAX_INDEXED_FILES);
}

function shouldIndexFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.some((part) => SKIP_PATH_PARTS.has(part))) return false;

  const basename = path.posix.basename(normalized).toLowerCase();
  if (SKIP_BASENAMES.has(basename)) return false;

  const extension = path.posix.extname(normalized).toLowerCase();
  if (!extension) {
    return ["dockerfile", "makefile", ".gitignore", ".env.example"].includes(basename);
  }

  return TEXT_EXTENSIONS.has(extension);
}

function isBinaryLike(value: string): boolean {
  return value.includes("\0");
}

function buildIndex(repoPath: string): IndexedDoc[] {
  const docs: IndexedDoc[] = [];

  for (const filePath of gitLsFiles(repoPath)) {
    if (!shouldIndexFile(filePath)) continue;

    const absolutePath = path.join(repoPath, filePath);
    let size = 0;
    try {
      size = lstatSync(absolutePath).size;
    } catch {
      continue;
    }
    if (size <= 0 || size > MAX_FILE_BYTES) continue;

    let text = "";
    try {
      text = readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }
    if (!text || isBinaryLike(text)) continue;

    docs.push({
      path: filePath,
      pathLower: filePath.toLowerCase(),
      text,
      textLower: text.toLowerCase(),
      lines: text.split(/\r?\n/),
    });
  }

  return docs;
}

function getIndex(repoPath: string): IndexedDoc[] {
  const key = path.resolve(repoPath);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.docs;

  const docs = buildIndex(repoPath);
  cache.set(key, {
    docs,
    expiresAt: now + CACHE_TTL_MS,
  });
  return docs;
}

function termsFromQuestion(question: string): string[] {
  return [...new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9_./-]+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 2 && !STOP_WORDS.has(term)),
  )].slice(0, MAX_QUERY_TERMS);
}

function lineScore(line: string, terms: string[]): number {
  const normalized = line.toLowerCase();
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

function bestSnippet(doc: IndexedDoc, terms: string[]): string {
  let bestLine = 0;
  let bestScore = 0;

  doc.lines.forEach((line, index) => {
    const score = lineScore(line, terms);
    if (score > bestScore) {
      bestScore = score;
      bestLine = index;
    }
  });

  const start = Math.max(0, bestLine - 2);
  const end = Math.min(doc.lines.length, bestLine + 4);
  return doc.lines
    .slice(start, end)
    .map((line, offset) => `${start + offset + 1}: ${line}`)
    .join("\n")
    .trim()
    .slice(0, 1_200);
}

function scoreDoc(doc: IndexedDoc, terms: string[], questionLower: string): number {
  let score = 0;
  let termScore = 0;

  for (const term of terms) {
    if (doc.pathLower.includes(term)) termScore += 10;

    const first = doc.textLower.indexOf(term);
    if (first !== -1) {
      termScore += 2;
      const repeats = doc.textLower.split(term).length - 1;
      termScore += Math.min(8, repeats);
    }
  }

  if (termScore === 0 && !doc.pathLower.includes(questionLower)) return 0;

  score += termScore;
  if (doc.pathLower.includes(questionLower)) score += 20;
  if (/^(apps|packages|server|src)\//.test(doc.pathLower)) score += 16;
  if (doc.pathLower.includes("/src/")) score += 10;
  if (doc.pathLower.includes("/routes/") || doc.pathLower.includes("/plugins/") || doc.pathLower.includes("/services/")) {
    score += 6;
  }
  if (doc.pathLower.includes("/test/") || doc.pathLower.includes(".test.") || doc.pathLower.includes(".spec.")) {
    score -= 8;
  }
  if (/^(\.agents|docs|notes)\//.test(doc.pathLower) || doc.pathLower.includes("/references/")) {
    score -= 18;
  }

  return score;
}

export function buildRepoRagEvidence(input: {
  question: string;
  repoPath: string;
  limit?: number;
}): QueryEvidence[] {
  const terms = termsFromQuestion(input.question);
  if (terms.length === 0) return [];

  const questionLower = input.question.toLowerCase().trim();
  const docs = getIndex(input.repoPath);
  const scored = docs
    .map((doc) => ({
      doc,
      score: scoreDoc(doc, terms, questionLower),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.doc.path.localeCompare(b.doc.path);
    })
    .slice(0, input.limit ?? 8);

  return scored.map(({ doc, score }, index): QueryEvidence => ({
    id: `repo-rag:${index}:${doc.path}`,
    kind: "file",
    title: doc.path,
    summary: `Local repo retrieval match. Relevant snippet:\n${bestSnippet(doc, terms)}`,
    score: score + 1_000,
    highlightIds: [],
    paths: [doc.path],
  }));
}
