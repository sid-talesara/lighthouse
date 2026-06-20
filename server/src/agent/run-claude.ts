import { createInterface } from "node:readline";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { spawnCli } from "./cli-spawn.js";
import { getLoginShellEnvironment, resolveCliExecutable } from "./shell-env.js";
import { parseResultFromLine } from "../parser/claude-stream.js";

const AGENT_TIMEOUT_MS = 5 * 60 * 1000;

function killProcessTree(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid) return;

  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

export async function runClaudeAgent(repoPath: string, prompt: string): Promise<string> {
  const env = getLoginShellEnvironment();
  const claudeBin = resolveCliExecutable("claude", env);

  if (!claudeBin) {
    throw new Error("claude binary not found. Install and authenticate Claude Code CLI.");
  }

  const child = spawnCli(
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
    { cwd: repoPath, env },
  );

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
    if (stderrLines.length > 20) stderrLines.shift();
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
      if (extracted === null) return;

      resultJson = extracted;
      if (!child.stdin.destroyed) child.stdin.end();
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

    if (!hasExited) killProcessTree(child);
  } finally {
    if (timeout) clearTimeout(timeout);
    stdout.close();
    stderr.close();
  }

  if (resultJson) return resultJson;

  const tail = stderrLines.length > 0 ? ` Stderr: ${stderrLines.join("\n")}` : "";
  throw new Error(
    `Agent exited without emitting a result event. Exit code: ${exitCode ?? "unknown"}${
      exitSignal ? `, signal: ${exitSignal}` : ""
    }.${tail}`,
  );
}
