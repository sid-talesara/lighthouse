import type { RunAgentOptions } from "./agent-types.js";
import { codexAgentRunner } from "./run-codex.js";

export function runAgent(options: RunAgentOptions): Promise<string> {
  return codexAgentRunner.run(options);
}
