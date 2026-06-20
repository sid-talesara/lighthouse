import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { EnvMap } from "./shell-env.js";

export interface CliRuntimeContext {
  cwd: string;
  env: EnvMap;
}

export interface CliSpawnPlan {
  command: string;
  args: string[];
  options: {
    cwd: string;
    detached: boolean;
    env: EnvMap;
    stdio: "pipe";
  };
}

export function planCliSpawn(
  command: string,
  args: string[],
  context: CliRuntimeContext,
): CliSpawnPlan {
  return {
    command,
    args,
    options: {
      cwd: context.cwd,
      detached: process.platform !== "win32",
      env: context.env,
      stdio: "pipe",
    },
  };
}

export function spawnCli(
  command: string,
  args: string[],
  context: CliRuntimeContext,
): ChildProcessWithoutNullStreams {
  const plan = planCliSpawn(command, args, context);
  return spawn(plan.command, plan.args, plan.options) as ChildProcessWithoutNullStreams;
}
