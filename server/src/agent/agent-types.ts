export const AGENT_TIMEOUT_MS = 5 * 60 * 1000;
export const GENERATE_AGENT_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_CODEX_MODEL = "gpt-5.5";
export const DEFAULT_CODEX_REASONING_EFFORT = "medium";

export type AgentKind = "codex";

export type AgentProgressEventType =
  | "queued"
  | "starting"
  | "command"
  | "preflight"
  | "model"
  | "reasoning"
  | "status"
  | "log"
  | "stdout"
  | "stderr"
  | "codex"
  | "validation"
  | "write"
  | "done"
  | "cancelled"
  | "error"
  | "timeout";

export interface AgentProgressEvent {
  type: AgentProgressEventType;
  message: string;
  elapsedMs: number;
  at: string;
  codexType?: string;
}

export type AgentProgressHandler = (event: AgentProgressEvent) => void;

export interface RunAgentOptions {
  repoPath: string;
  prompt: string;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: AgentProgressHandler;
}

export interface AgentRunner {
  kind: AgentKind;
  run(options: RunAgentOptions): Promise<string>;
}

export class AgentTimeoutError extends Error {
  constructor(agentLabel: string, timeoutMs: number) {
    super(`${agentLabel} agent timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    this.name = "AgentTimeoutError";
  }
}

export class AgentCancelledError extends Error {
  constructor(agentLabel: string) {
    super(`${agentLabel} agent was stopped`);
    this.name = "AgentCancelledError";
  }
}
