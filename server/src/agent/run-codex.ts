import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentRunner, RunAgentOptions } from "./agent-types.js";
import {
  AGENT_TIMEOUT_MS,
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_REASONING_EFFORT,
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
    "--output-last-message",
    outputPath,
  ];

  args.push("-");
  return args;
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
  async run({ repoPath, prompt, model }: RunAgentOptions): Promise<string> {
    const env = getLoginShellEnvironment();
    const codexBin = resolveCliExecutable("codex", env);

    if (!codexBin) {
      throw new Error("codex binary not found. Install and authenticate Codex CLI.");
    }

    await ensureCodexExecSupportsRequiredFlags(codexBin, env, repoPath);

    const tempDir = await mkdtemp(join(tmpdir(), "lighthouse-codex-"));
    const outputPath = join(tempDir, "last-message.txt");

    try {
      const result = await executeCli({
        label: "codex",
        command: codexBin,
        args: buildCodexArgs(repoPath, outputPath, model),
        cwd: repoPath,
        env,
        input: prompt,
        timeoutMs: AGENT_TIMEOUT_MS,
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
