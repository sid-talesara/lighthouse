export const AGENT_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_CODEX_MODEL = "gpt-5.5";
export const DEFAULT_CODEX_REASONING_EFFORT = "medium";

export type AgentKind = "codex";

export interface RunAgentOptions {
  repoPath: string;
  prompt: string;
  model?: string;
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
