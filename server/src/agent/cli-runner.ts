import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { spawnCli } from "./cli-spawn.js";
import type { EnvMap } from "./shell-env.js";
import { AgentTimeoutError } from "./agent-types.js";

export interface CliExecutionOptions {
  label: string;
  command: string;
  args: string[];
  cwd: string;
  env: EnvMap;
  input?: string;
  timeoutMs: number;
}

export interface CliExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
}

export class CliExitError extends Error {
  constructor(label: string, result: CliExecutionResult) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    const details = [
      `exit code: ${result.exitCode ?? "unknown"}`,
      result.exitSignal ? `signal: ${result.exitSignal}` : null,
      stderr ? `stderr: ${tail(stderr)}` : null,
      stdout ? `stdout: ${tail(stdout)}` : null,
    ].filter(Boolean);

    super(`${label} agent exited unsuccessfully (${details.join("; ")})`);
    this.name = "CliExitError";
  }
}

function tail(value: string): string {
  const lines = value.split(/\r?\n/).filter(Boolean);
  return lines.slice(-20).join("\n");
}

function killProcessTree(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid) return;

  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

export async function executeCli(options: CliExecutionOptions): Promise<CliExecutionResult> {
  const child = spawnCli(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  let settled = false;
  let timeout: NodeJS.Timeout | null = null;

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    stderrChunks.push(buffer);
    const text = buffer.toString("utf8").trim();
    if (text) console.warn(`[companion:${options.label}] ${text}`);
  });
  child.stdin.on("error", (error) => {
    if ((error as NodeJS.ErrnoException).code !== "EPIPE") {
      console.error(`[companion:${options.label}] stdin error`, error);
    }
  });

  const closePromise = new Promise<CliExecutionResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      settled = true;
      exitCode = code;
      exitSignal = signal;
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode,
        exitSignal,
      });
    });
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      if (!settled) killProcessTree(child);
      reject(new AgentTimeoutError(options.label, options.timeoutMs));
    }, options.timeoutMs);
  });

  if (options.input !== undefined) child.stdin.end(options.input);
  else child.stdin.end();

  try {
    const result = await Promise.race([closePromise, timeoutPromise]);
    if (result.exitCode !== 0) throw new CliExitError(options.label, result);
    return result;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
