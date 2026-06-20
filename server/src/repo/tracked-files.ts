import { spawn } from "node:child_process";
import { lstat } from "node:fs/promises";
import { basename, extname, join } from "node:path";

export interface TrackedFileInventoryEntry {
  path: string;
  language: string;
  size_bytes: number;
}

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
  [".jsx", "javascript"],
  [".json", "json"],
  [".kt", "kotlin"],
  [".kts", "kotlin"],
  [".mjs", "javascript"],
  [".md", "markdown"],
  [".mdx", "mdx"],
  [".php", "php"],
  [".py", "python"],
  [".rb", "ruby"],
  [".rs", "rust"],
  [".scss", "scss"],
  [".sh", "shell"],
  [".sql", "sql"],
  [".swift", "swift"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".vue", "vue"],
  [".xml", "xml"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
]);

const BASENAME_LANGUAGES = new Map<string, string>([
  [".dockerignore", "dockerignore"],
  [".env", "dotenv"],
  [".gitignore", "gitignore"],
  ["dockerfile", "dockerfile"],
  ["makefile", "makefile"],
]);

function inferLanguage(path: string): string {
  const name = basename(path);
  const basenameLanguage = BASENAME_LANGUAGES.get(name.toLowerCase());
  if (basenameLanguage) return basenameLanguage;

  const extension = extname(name).toLowerCase();
  const extensionLanguage = EXTENSION_LANGUAGES.get(extension);
  if (extensionLanguage) return extensionLanguage;

  if (extension) return extension.slice(1);
  return "unknown";
}

async function gitLsFiles(repoPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", repoPath, "ls-files", "-z"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        reject(new Error(`git ls-files failed${stderr ? `: ${stderr}` : ""}`));
        return;
      }

      const output = Buffer.concat(stdoutChunks).toString("utf8");
      resolve(output.split("\0").filter((path) => path.length > 0).sort());
    });
  });
}

export async function indexTrackedFiles(repoPath: string): Promise<TrackedFileInventoryEntry[]> {
  const paths = await gitLsFiles(repoPath);
  const files: TrackedFileInventoryEntry[] = [];

  for (const path of paths) {
    const stats = await lstat(join(repoPath, path));
    files.push({
      path,
      language: inferLanguage(path),
      size_bytes: stats.size,
    });
  }

  return files;
}
