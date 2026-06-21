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
let codexSupportsIgnoreUserConfig = false;

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

    codexSupportsIgnoreUserConfig = execHelpText.includes("--ignore-user-config");
  });

  return codexFlagCheck;
}

function buildCodexArgs(repoPath: string, outputPath: string, model?: string): string[] {
  const args = [
    "--ask-for-approval",
    "never",
    "exec",
  ];

  if (codexSupportsIgnoreUserConfig) args.push("--ignore-user-config");

  args.push(
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
  );

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
  return value
    .replace(
      /(["'])(api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|authorization|password|secret|token)\1\s*:\s*("[^"]+"|'[^']+'|[^,\s}]+)/gi,
      "$1$2$1:[redacted]",
    )
    .replace(
      /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)=("[^"]+"|'[^']+'|\S+)/g,
      "$1=[redacted]",
    )
    .replace(
      /\b(api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|authorization|password|secret|token)\b\s*[:=]\s*("[^"]+"|'[^']+'|\S+)/gi,
      "$1=[redacted]",
    )
    .replace(/\bBearer\s+[-._~+/A-Za-z0-9]+=*/gi, "Bearer [redacted]");
}

function compactText(value: string, maxLength = 1_200): string {
  const text = redactSensitiveText(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function isKnownCodexNoise(message: string): boolean {
  return /\brmcp::|mcp\.[\w.-]+|\bAuthRequired\b|codex_core_plugins::manifest|codex_core_skills::loader|codex_rollout::list|failed to load skill|ignoring interface\.|log-loader|plugin/i.test(
    message,
  );
}

function normalizeCodexFailureMessage(message: string): string {
  const redacted = redactSensitiveText(message);
  if (!isKnownCodexNoise(redacted)) return compactText(redacted, 600);

  const filtered = redacted
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isKnownCodexNoise(line))
    .join(" ");

  return (
    compactText(filtered, 600) ||
    "Codex exited unsuccessfully after plugin/tool setup noise. Check Codex CLI authentication and retry."
  );
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

function commandTextFromUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const parsedCommand = commandTextFromUnknown(parsed);
      if (parsedCommand) return parsedCommand;
    } catch {
      // Plain command strings are expected here.
    }

    return trimmed;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => (typeof entry === "string" ? entry : textFromUnknown(entry)))
      .filter((entry): entry is string => Boolean(entry));
    return parts.length > 0 ? parts.join(" ") : null;
  }

  const record = asRecord(value);
  if (!record) return null;

  for (const key of ["command", "cmd", "script"]) {
    const candidate = commandTextFromUnknown(record[key]);
    if (candidate) return candidate;
  }

  for (const key of ["arguments", "input", "args", "parameters", "params", "call"]) {
    const candidate = commandTextFromUnknown(record[key]);
    if (candidate) return candidate;
  }

  return null;
}

function stringField(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function nestedRecord(
  record: Record<string, unknown> | null,
  keys: string[],
): Record<string, unknown> | null {
  if (!record) return null;
  for (const key of keys) {
    const candidate = asRecord(record[key]);
    if (candidate) return candidate;
  }
  return null;
}

function extractToolName(event: Record<string, unknown>): string | null {
  const item = asRecord(event.item);
  const payload = asRecord(event.payload);
  const call = nestedRecord(item, ["call"]) ?? nestedRecord(payload, ["call"]);

  return (
    stringField(event, ["tool_name", "toolName", "tool", "name"]) ??
    stringField(item, ["tool_name", "toolName", "tool", "name"]) ??
    stringField(payload, ["tool_name", "toolName", "tool", "name"]) ??
    stringField(call, ["tool_name", "toolName", "tool", "name"]) ??
    null
  );
}

function extractPathFromRecord(record: Record<string, unknown> | null): string | null {
  if (!record) return null;

  const direct = stringField(record, ["path", "file", "filename", "file_path", "filepath", "uri"]);
  if (direct) return direct;

  for (const key of ["arguments", "input", "args", "parameters", "params", "call"]) {
    const candidate = extractPathFromRecord(asRecord(record[key]));
    if (candidate) return candidate;
  }

  return null;
}

function isShellToolName(toolName: string | null): boolean {
  return !toolName || /^(bash|sh|zsh|shell|exec|exec_command|command|command_execution)$/i.test(toolName);
}

function shellLabelFor(event: Record<string, unknown>, toolName: string | null): string {
  const item = asRecord(event.item);
  const payload = asRecord(event.payload);
  const shell =
    stringField(item, ["shell", "interpreter"]) ??
    stringField(payload, ["shell", "interpreter"]) ??
    (toolName && /^(bash|sh|zsh)$/i.test(toolName) ? toolName : null);

  return shell || "bash";
}

function formatCodexToolAction(
  event: Record<string, unknown>,
  itemType: string | null,
): string | null {
  const item = asRecord(event.item);
  const payload = asRecord(event.payload);
  const call = nestedRecord(item, ["call"]) ?? nestedRecord(payload, ["call"]);
  const toolName = extractToolName(event);
  const canUseCommandText = itemType === "command_execution" || Boolean(toolName);
  const command = canUseCommandText
    ? commandTextFromUnknown(item) ??
      commandTextFromUnknown(payload) ??
      commandTextFromUnknown(call)
    : null;

  if (command) {
    const action = isShellToolName(toolName)
      ? `${shellLabelFor(event, toolName)}: ${command}`
      : `${toolName}: ${command}`;
    return compactText(action, 600);
  }

  const path =
    extractPathFromRecord(item) ??
    extractPathFromRecord(payload) ??
    extractPathFromRecord(call);
  if (toolName && path) return compactText(`${toolName}: ${path}`, 600);

  if (itemType === "command_execution" && toolName) {
    return compactText(`Running ${toolName}.`, 600);
  }

  return null;
}

function extractCodexMessage(event: Record<string, unknown>): string {
  const type = typeof event.type === "string" ? event.type : "codex.event";
  const item = asRecord(event.item);
  const payload = asRecord(event.payload);
  const error = asRecord(event.error);
  const itemType = typeof item?.type === "string" ? item.type : null;
  const toolAction = formatCodexToolAction(event, itemType);
  if (toolAction) return toolAction;

  const directText =
    textFromUnknown(event.message) ??
    textFromUnknown(event.text) ??
    textFromUnknown(event.delta) ??
    textFromUnknown(event.content) ??
    textFromUnknown(item) ??
    textFromUnknown(payload) ??
    textFromUnknown(error);

  if (directText) return compactText(directText);

  if (type === "thread.started") return "Starting Codex session.";
  if (type === "turn.started") return "Analyzing repository.";
  if (type === "turn.completed") return "Repository analysis complete.";

  if (type === "item.started" && itemType) return `Codex started ${itemType}.`;
  if (type === "item.completed" && itemType) return `Codex completed ${itemType}.`;

  return type;
}

interface NormalizedCodexProgressEvent {
  type: AgentProgressEvent["type"];
  message: string;
  codexType?: string;
}

interface NormalizedStderrChunk {
  type: AgentProgressEvent["type"];
  message: string;
  suppressionKey?: string;
}

export function normalizeCodexProgressEvent(
  event: Record<string, unknown>,
): NormalizedCodexProgressEvent | null {
  const codexType = typeof event.type === "string" ? event.type : undefined;
  const item = asRecord(event.item);
  const itemType = typeof item?.type === "string" ? item.type : null;

  if (codexType === "item.started" || codexType === "item.completed") {
    const toolAction = formatCodexToolAction(event, itemType);
    if (!toolAction) return null;

    return {
      type: "codex",
      codexType,
      message: codexType === "item.completed" ? `Completed ${toolAction}` : toolAction,
    };
  }

  const message = extractCodexMessage(event);
  if (!message || isKnownCodexNoise(message)) return null;

  return {
    type: "codex",
    codexType,
    message,
  };
}

export function normalizeCodexStderrChunk(chunk: string): NormalizedStderrChunk | null {
  const message = compactText(chunk, 600);
  if (!message) return null;

  const isMcpAuthNoise =
    /\bAuthRequired\b/i.test(message) ||
    (/mcp/i.test(message) && /\b(401|unauthorized|authentication|auth required)\b/i.test(message));

  if (isMcpAuthNoise) {
    return {
      type: "status",
      suppressionKey: "mcp-auth",
      message: "An optional Codex integration needs authentication; continuing.",
    };
  }

  if (isKnownCodexNoise(message)) {
    return null;
  }

  return {
    type: "stderr",
    message,
  };
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

    const normalized = normalizeCodexProgressEvent(event);
    if (normalized) emitProgress(onProgress, startedAt, normalized);
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
  async run({ repoPath, prompt, model, timeoutMs = AGENT_TIMEOUT_MS, signal, onProgress }: RunAgentOptions): Promise<string> {
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
    const emittedStderrNotices = new Set<string>();

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
        timeoutMs,
        signal,
        onStdoutChunk: (chunk) => {
          jsonLines.push(chunk, (line) => handleCodexJsonLine(line, onProgress, startedAt));
        },
        onStderrChunk: (chunk) => {
          const normalized = normalizeCodexStderrChunk(chunk);
          if (!normalized) return;
          if (normalized.suppressionKey) {
            if (emittedStderrNotices.has(normalized.suppressionKey)) return;
            emittedStderrNotices.add(normalized.suppressionKey);
          }
          emitProgress(onProgress, startedAt, {
            type: normalized.type,
            message: normalized.message,
          });
        },
      }).catch((error: unknown) => {
        if (error instanceof Error) throw new Error(normalizeCodexFailureMessage(error.message));
        throw error;
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
