import cors from "cors";
import express from "express";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:http";
import { accessSync, constants } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { homedir } from "node:os";
import { ZodError } from "zod";
import { buildAnalysisPrompt } from "./agent/prompt.js";
import { parseResultFromLine } from "./parser/claude-stream.js";
import { writeFileAtomic } from "./utils/atomic-write.js";
import { validateRepoPath } from "./utils/path-safety.js";
import { LighthouseDataSchema } from "./validate/schema.js";

type EnvMap = Record<string, string>;

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);
const HOST = "127.0.0.1";
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DATA_JSON_PATH = join(REPO_ROOT, "public", "data.json");
const AGENT_TIMEOUT_MS = 5 * 60 * 1000;

function parseEnvOutput(output: string): EnvMap {
  const env: EnvMap = {};

  for (const line of output.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0) {
      continue;
    }
    env[line.slice(0, index)] = line.slice(index + 1);
  }

  return env;
}

function appendPathEntries(env: EnvMap): EnvMap {
  const home = env.HOME || homedir();
  const extras = [
    join(home, ".local", "bin"),
    join(home, ".local", "node", "bin"),
    join(home, ".bun", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  const pathEntries = new Set((env.PATH ?? "").split(":").filter(Boolean));

  for (const entry of extras) {
    pathEntries.add(entry);
  }

  return { ...env, PATH: [...pathEntries].join(":") };
}

function getLoginShellEnvironment(): EnvMap {
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    }),
  );
  const shell = baseEnv.SHELL || "/bin/zsh";
  const result = spawnSync(shell, ["-ilc", "env"], {
    encoding: "utf8",
    env: baseEnv,
    timeout: 10_000,
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    console.warn("[companion] could not load login shell environment; using process env");
    return appendPathEntries(baseEnv);
  }

  return appendPathEntries({ ...baseEnv, ...parseEnvOutput(result.stdout) });
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCliExecutable(command: string, env: EnvMap): string | null {
  const home = env.HOME || homedir();
  const candidates = (env.PATH ?? "")
    .split(":")
    .filter(Boolean)
    .map((dir) => join(dir, command))
    .concat([
      join(home, ".local", "bin", command),
      join(home, ".local", "node", "bin", command),
      join(home, ".bun", "bin", command),
      join("/opt/homebrew/bin", command),
      join("/usr/local/bin", command),
    ]);
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

function killProcessTree(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid) {
    return;
  }

  try {
    if (process.platform === "win32") {
      child.kill("SIGKILL");
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    child.kill("SIGKILL");
  }
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }

  return raw.trim();
}

function formatError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "data"}: ${issue.message}`)
      .join("; ");
  }

  if (error instanceof SyntaxError) {
    return `Agent returned invalid JSON: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function runClaudeAgent(repoPath: string, prompt: string): Promise<string> {
  const env = getLoginShellEnvironment();
  const claudeBin = resolveCliExecutable("claude", env);

  if (!claudeBin) {
    throw new Error("claude binary not found. Install and authenticate Claude Code CLI.");
  }

  const child = spawn(
    claudeBin,
    [
      "--verbose",
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--permission-mode",
      "bypassPermissions",
    ],
    {
      cwd: repoPath,
      detached: process.platform !== "win32",
      env,
      stdio: "pipe",
    },
  ) as ChildProcessWithoutNullStreams;

  const stdout = createInterface({ input: child.stdout });
  const stderr = createInterface({ input: child.stderr });
  const stderrLines: string[] = [];
  let resultJson: string | null = null;
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  let hasExited = false;

  child.stdin.on("error", (error) => {
    if ((error as NodeJS.ErrnoException).code !== "EPIPE") {
      console.error("[companion] claude stdin error", error);
    }
  });

  stderr.on("line", (line) => {
    stderrLines.push(line);
    if (stderrLines.length > 20) {
      stderrLines.shift();
    }
    console.warn(`[companion:claude] ${line}`);
  });

  const exitPromise = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      exitCode = code;
      exitSignal = signal;
      hasExited = true;
      resolve();
    });
  });

  const resultPromise = new Promise<void>((resolve) => {
    stdout.on("line", (line) => {
      const extracted = parseResultFromLine(line);
      if (extracted === null) {
        return;
      }

      resultJson = extracted;
      if (!child.stdin.destroyed) {
        child.stdin.end();
      }
      resolve();
    });
  });

  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<void>((_, reject) => {
    timeout = setTimeout(() => {
      killProcessTree(child);
      reject(new Error("Claude agent timed out after 5 minutes"));
    }, AGENT_TIMEOUT_MS);
  });

  const stdinMessage = JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text: prompt }],
    },
    session_id: "default",
    parent_tool_use_id: null,
  });

  child.stdin.write(`${stdinMessage}\n`);

  try {
    await Promise.race([resultPromise, exitPromise, timeoutPromise]);

    await Promise.race([
      exitPromise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, 5000);
      }),
    ]);

    if (!hasExited) {
      killProcessTree(child);
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  stdout.close();
  stderr.close();

  if (resultJson) {
    return resultJson;
  }

  const tail = stderrLines.length > 0 ? ` Stderr: ${stderrLines.join("\n")}` : "";
  throw new Error(
    `Agent exited without emitting a result event. Exit code: ${exitCode ?? "unknown"}${
      exitSignal ? `, signal: ${exitSignal}` : ""
    }.${tail}`,
  );
}

const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  }),
);
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/generate", async (req, res) => {
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
    const status = message.startsWith("repoPath") ? 400 : 500;
    console.error("[companion] generate failed:", message);
    res.status(status).json({ error: message });
  }
});

const httpServer = createServer(app);
httpServer.setTimeout(AGENT_TIMEOUT_MS);
httpServer.listen(PORT, HOST, () => {
  console.log(`[companion] listening on http://${HOST}:${PORT}`);
  console.log("[companion] local-only server; do not expose this port to the internet");
});
