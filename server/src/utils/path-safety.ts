import { spawnSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, parse, resolve } from "node:path";
import { homedir } from "node:os";

function samePath(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}

function isBroadPath(path: string): boolean {
  const root = parse(path).root;
  const home = realpathSync.native(homedir());
  const homeParent = dirname(home);

  return samePath(path, root) || samePath(path, home) || samePath(path, homeParent);
}

export function validateRepoPath(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("repoPath is required");
  }

  const requestedPath = input.trim();
  if (!isAbsolute(requestedPath)) {
    throw new Error("repoPath must be an absolute path");
  }

  let realPath: string;
  try {
    realPath = realpathSync.native(requestedPath);
  } catch {
    throw new Error("repoPath must exist");
  }

  let stat;
  try {
    stat = statSync(realPath);
  } catch {
    throw new Error("repoPath must be readable");
  }

  if (!stat.isDirectory()) {
    throw new Error("repoPath must be a directory");
  }

  if (isBroadPath(realPath)) {
    throw new Error("repoPath cannot be the filesystem root, home directory, or home parent");
  }

  const git = spawnSync("git", ["-C", realPath, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });

  if (git.status !== 0 || !git.stdout.trim()) {
    throw new Error("repoPath must be an existing git repository");
  }

  const gitRoot = realpathSync.native(git.stdout.trim());
  if (!samePath(realPath, gitRoot)) {
    throw new Error("repoPath must be the git repository root, not a parent or subdirectory");
  }

  return realPath;
}
