import { spawn } from "node:child_process";

import type { LighthouseData } from "../validate/schema.js";

type ParsedNode = LighthouseData["nodes"][number];
type PullRequest = NonNullable<LighthouseData["pullRequests"]>[number];
type PullRequestTouch = PullRequest["touched"][number];
type ChangeKind = PullRequestTouch["change"];

const FIELD_SEP = ""; // unit separator
const RECORD_SEP = ""; // record separator
const RECENT_COMMIT_WINDOW = 3;

interface RawCommit {
  hash: string;
  author: string;
  date: string;
  subject: string;
  body: string;
  files: { path: string; status: ChangeKind; additions: number; deletions: number }[];
}

function runGit(repoPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", repoPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`git ${args[0]} failed: ${Buffer.concat(err).toString("utf8").trim()}`));
        return;
      }
      resolve(Buffer.concat(out).toString("utf8"));
    });
  });
}

function mapNumstatStatus(additions: number, deletions: number): ChangeKind {
  if (deletions > 0 && additions === 0) return "removed";
  if (additions > 0 && deletions === 0) return "added";
  return "modified";
}

function parseCommits(raw: string): RawCommit[] {
  const commits: RawCommit[] = [];
  for (const block of raw.split(RECORD_SEP)) {
    const trimmed = block.replace(/^\n+/, "");
    if (!trimmed.trim()) continue;
    // Header fields are newline-free (%h, %an, %ad, %s) joined by FIELD_SEP and
    // terminated by FIELD_SEP. Numstat lines follow on subsequent lines.
    const sepIndex = trimmed.lastIndexOf(FIELD_SEP);
    if (sepIndex === -1) continue;
    const headerPart = trimmed.slice(0, sepIndex);
    const afterHeader = trimmed.slice(sepIndex + FIELD_SEP.length);
    const [hash, author, date, subject] = headerPart.split(FIELD_SEP);
    if (!hash) continue;

    const files: RawCommit["files"] = [];
    for (const line of afterHeader.split("\n")) {
      const cols = line.split("\t");
      if (cols.length < 3) continue;
      const [addStr, delStr, path] = cols;
      const additions = addStr === "-" ? 0 : Number.parseInt(addStr, 10) || 0;
      const deletions = delStr === "-" ? 0 : Number.parseInt(delStr, 10) || 0;
      files.push({ path, status: mapNumstatStatus(additions, deletions), additions, deletions });
    }

    commits.push({
      hash,
      author: author || "unknown",
      date: date || "",
      subject: subject || hash,
      body: subject || hash,
      files,
    });
  }
  return commits;
}

/**
 * Build a lookup from repo-relative file path to the owning node id.
 * A node owns a path if the path matches one of its key_files, or sits
 * under its `path` directory. Longer (more specific) prefixes win.
 */
function buildPathToNode(nodes: ParsedNode[]): (filePath: string) => string | undefined {
  const exact = new Map<string, string>();
  const prefixes: { prefix: string; nodeId: string }[] = [];

  for (const node of nodes) {
    for (const keyFile of node.key_files ?? []) {
      const normalized = keyFile.replace(/^\.\//, "");
      if (normalized) exact.set(normalized, node.id);
    }
    const dir = (node.path ?? "").replace(/^\.\//, "").replace(/\/$/, "");
    if (dir) prefixes.push({ prefix: `${dir}/`, nodeId: node.id });
  }
  // longest prefix first for specificity
  prefixes.sort((a, b) => b.prefix.length - a.prefix.length);

  return (filePath: string) => {
    const normalized = filePath.replace(/^\.\//, "");
    const direct = exact.get(normalized);
    if (direct) return direct;
    for (const { prefix, nodeId } of prefixes) {
      if (normalized.startsWith(prefix)) return nodeId;
    }
    return undefined;
  };
}

export interface ExtractPullRequestsResult {
  pullRequests: PullRequest[];
  /** node ids touched by the most recent commits — caller marks changed_recently. */
  recentlyChangedNodeIds: Set<string>;
}

/**
 * Treat recent git commits as PR records and map their changed files to node ids.
 */
export async function extractPullRequests(
  repoPath: string,
  nodes: ParsedNode[],
  limit = 12,
): Promise<ExtractPullRequestsResult> {
  // Each commit: RECORD_SEP, then header fields joined+terminated by FIELD_SEP,
  // then a newline and numstat lines. Header fields contain no newlines.
  const format = RECORD_SEP + ["%h", "%an", "%ad", "%s"].join(FIELD_SEP) + FIELD_SEP;
  const raw = await runGit(repoPath, [
    "log",
    `-n`,
    String(limit),
    "--date=short",
    `--pretty=format:${format}`,
    "--numstat",
  ]);

  const commits = parseCommits(raw);
  const resolveNode = buildPathToNode(nodes);
  const recentlyChangedNodeIds = new Set<string>();
  const pullRequests: PullRequest[] = [];

  commits.forEach((commit, index) => {
    const touchedByNode = new Map<string, ChangeKind>();
    let additions = 0;
    let deletions = 0;

    for (const file of commit.files) {
      additions += file.additions;
      deletions += file.deletions;
      const nodeId = resolveNode(file.path);
      if (!nodeId) continue;
      // Prefer "modified" if a node has mixed change kinds across files.
      const existing = touchedByNode.get(nodeId);
      if (existing && existing !== file.status) {
        touchedByNode.set(nodeId, "modified");
      } else if (!existing) {
        touchedByNode.set(nodeId, file.status);
      }
    }

    const touched: PullRequestTouch[] = [...touchedByNode.entries()].map(([node_id, change]) => ({
      node_id,
      change,
    }));

    // Skip commits that map to zero nodes — keeps the "what changed" view meaningful.
    if (touched.length === 0) return;

    if (index < RECENT_COMMIT_WINDOW) {
      for (const touch of touched) recentlyChangedNodeIds.add(touch.node_id);
    }

    pullRequests.push({
      id: commit.hash,
      title: commit.subject,
      author: commit.author,
      date: commit.date,
      status: "merged",
      summary: commit.body || commit.subject,
      touched,
      additions,
      deletions,
    });
  });

  return { pullRequests, recentlyChangedNodeIds };
}
