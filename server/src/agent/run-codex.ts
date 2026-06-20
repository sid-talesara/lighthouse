import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentRunner, RunAgentOptions } from "./agent-types.js";
import {
  AGENT_TIMEOUT_MS,
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_REASONING_EFFORT,
  type AgentProgressEvent,
  type AgentProgressHandler,
} from "./agent-types.js";
import { executeCli } from "./cli-runner.js";
import { getLoginShellEnvironment, resolveCliExecutable, type EnvMap } from "./shell-env.js";

const REQUIRED_CODEX_GLOBAL_FLAGS = ["--ask-for-approval"];

const REQUIRED_CODEX_EXEC_FLAGS = [
  "Run Codex non-interactively",
  "--model",
  "--cd",
  "--sandbox",
  "--ephemeral",
  "--json",
  "--output-last-message",
];

let codexFlagCheck: Promise<void> | null = null;

async function ensureCodexExecSupportsRequiredFlags(
  codexBin: string,
  env: EnvMap,
  cwd: string,
): Promise<void> {
  codexFlagCheck ??= Promise.all([
    executeCli({
      label: "codex-help",
      command: codexBin,
      args: ["--help"],
      cwd,
      env,
      timeoutMs: 10_000,
    }),
    executeCli({
      label: "codex-exec-help",
      command: codexBin,
      args: ["exec", "--help"],
      cwd,
      env,
      timeoutMs: 10_000,
    }),
  ]).then(([globalHelp, execHelp]) => {
    const globalHelpText = `${globalHelp.stdout}\n${globalHelp.stderr}`;
    const missingGlobal = REQUIRED_CODEX_GLOBAL_FLAGS.filter(
      (flag) => !globalHelpText.includes(flag),
    );
    if (missingGlobal.length > 0) {
      throw new Error(
        `codex does not expose required non-interactive flags: ${missingGlobal.join(", ")}`,
      );
    }

    const execHelpText = `${execHelp.stdout}\n${execHelp.stderr}`;
    const missingExec = REQUIRED_CODEX_EXEC_FLAGS.filter(
      (flag) => !execHelpText.includes(flag),
    );
    if (missingExec.length > 0) {
      throw new Error(
        `codex exec does not expose required non-interactive flags: ${missingExec.join(", ")}`,
      );
    }
  });

  return codexFlagCheck;
}

function buildCodexArgs(repoPath: string, outputPath: string, model?: string): string[] {
  const args = [
    "--ask-for-approval",
    "never",
    "exec",
    "--cd",
    repoPath,
    "--model",
    model || DEFAULT_CODEX_MODEL,
    "--config",
    `model_reasoning_effort="${DEFAULT_CODEX_REASONING_EFFORT}"`,
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--color",
    "never",
    "--json",
    "--output-last-message",
    outputPath,
  ];

  args.push("-");
  return args;
}

function nowIso(): string {
  return new Date().toISOString();
}

function emitProgress(
  onProgress: AgentProgressHandler | undefined,
  startedAt: number,
  event: Omit<AgentProgressEvent, "elapsedMs" | "at">,
): void {
  onProgress?.({
    ...event,
    elapsedMs: Date.now() - startedAt,
    at: nowIso(),
  });
}

function redactSensitiveText(value: string): string {
  return value.replace(
    /\b(api[_-]?key|authorization|bearer|password|secret|token)\b\s*[:=]\s*("[^"]+"|'[^']+'|\S+)/gi,
    "$1=[redacted]",
  );
}

function compactText(value: string, maxLength = 1_200): string {
  const text = redactSensitiveText(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textFromUnknown(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => textFromUnknown(entry))
      .filter(Boolean)
      .join(" ");
  }

  const record = asRecord(value);
  if (!record) return null;

  for (const key of ["text", "message", "delta", "content", "summary"]) {
    const candidate = textFromUnknown(record[key]);
    if (candidate) return candidate;
  }

  return null;
}

function extractCodexMessage(event: Record<string, unknown>): string {
  const type = typeof event.type === "string" ? event.type : "codex.event";
  const item = asRecord(event.item);
  const payload = asRecord(event.payload);
  const error = asRecord(event.error);

  const directText =
    textFromUnknown(event.message) ??
    textFromUnknown(event.text) ??
    textFromUnknown(event.delta) ??
    textFromUnknown(event.content) ??
    textFromUnknown(item) ??
    textFromUnknown(payload) ??
    textFromUnknown(error);

  if (directText) return compactText(directText);

  if (type === "thread.started") return "Codex session started.";
  if (type === "turn.started") return "Codex turn started.";
  if (type === "turn.completed") return "Codex turn completed.";

  const itemType = typeof item?.type === "string" ? item.type : null;
  if (type === "item.started" && itemType) return `Codex started ${itemType}.`;
  if (type === "item.completed" && itemType) return `Codex completed ${itemType}.`;

  return type;
}

class JsonLineBuffer {
  private buffered = "";

  push(chunk: string, onLine: (line: string) => void): void {
    this.buffered += chunk;
    const lines = this.buffered.split(/\r?\n/);
    this.buffered = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) onLine(trimmed);
    }
  }

  flush(onLine: (line: string) => void): void {
    const trimmed = this.buffered.trim();
    this.buffered = "";
    if (trimmed) onLine(trimmed);
  }
}

function handleCodexJsonLine(
  line: string,
  onProgress: AgentProgressHandler | undefined,
  startedAt: number,
): void {
  try {
    const parsed = JSON.parse(line) as unknown;
    const event = asRecord(parsed);
    if (!event) {
      emitProgress(onProgress, startedAt, {
        type: "stdout",
        message: compactText(line),
      });
      return;
    }

    const codexType = typeof event.type === "string" ? event.type : undefined;
    emitProgress(onProgress, startedAt, {
      type: "codex",
      codexType,
      message: extractCodexMessage(event),
    });
  } catch {
    emitProgress(onProgress, startedAt, {
      type: "stdout",
      message: compactText(line),
    });
  }
}

async function readCodexOutput(outputPath: string, stdout: string): Promise<string> {
  try {
    const fileOutput = (await readFile(outputPath, "utf8")).trim();
    if (fileOutput) return fileOutput;
  } catch {
    // Fall through to stdout; the CLI error path already includes stderr details.
  }

  const stdoutOutput = stdout.trim();
  if (stdoutOutput) return stdoutOutput;
  throw new Error("Codex agent exited without producing a final message.");
}

export const codexAgentRunner: AgentRunner = {
  kind: "codex",
  async run({ repoPath, prompt, model, onProgress }: RunAgentOptions): Promise<string> {
    const startedAt = Date.now();
    const env = getLoginShellEnvironment();
    const codexBin = resolveCliExecutable("codex", env);

    if (!codexBin) {
      throw new Error("codex binary not found. Install and authenticate Codex CLI.");
    }

    emitProgress(onProgress, startedAt, {
      type: "status",
      message: "Checking Codex CLI capabilities.",
    });
    await ensureCodexExecSupportsRequiredFlags(codexBin, env, repoPath);

    const tempDir = await mkdtemp(join(tmpdir(), "lighthouse-codex-"));
    const outputPath = join(tempDir, "last-message.txt");
    const jsonLines = new JsonLineBuffer();

    try {
      emitProgress(onProgress, startedAt, {
        type: "status",
        message: `Starting Codex ${model || DEFAULT_CODEX_MODEL} with ${DEFAULT_CODEX_REASONING_EFFORT} reasoning.`,
      });
      const result = await executeCli({
        label: "codex",
        command: codexBin,
        args: buildCodexArgs(repoPath, outputPath, model),
        cwd: repoPath,
        env,
        input: prompt,
        timeoutMs: AGENT_TIMEOUT_MS,
        onStdoutChunk: (chunk) => {
          jsonLines.push(chunk, (line) => handleCodexJsonLine(line, onProgress, startedAt));
        },
        onStderrChunk: (chunk) => {
          const text = chunk.trim();
          if (!text) return;
          emitProgress(onProgress, startedAt, {
            type: "stderr",
            message: compactText(text),
          });
        },
      });
      jsonLines.flush((line) => handleCodexJsonLine(line, onProgress, startedAt));

      emitProgress(onProgress, startedAt, {
        type: "status",
        message: "Reading Codex final message.",
      });
      return await readCodexOutput(outputPath, result.stdout);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  },
};

export function runCodexAgent(
  repoPath: string,
  prompt: string,
  model?: string,
): Promise<string> {
  return codexAgentRunner.run({ repoPath, prompt, model });
}
