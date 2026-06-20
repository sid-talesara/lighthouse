import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type EnvMap = Record<string, string>;

function parseEnvOutput(output: string): EnvMap {
  const env: EnvMap = {};

  for (const line of output.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
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
    join(home, ".cargo", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  const pathEntries = new Set((env.PATH ?? "").split(":").filter(Boolean));

  for (const entry of extras) pathEntries.add(entry);

  return { ...env, PATH: [...pathEntries].join(":") };
}

export function getLoginShellEnvironment(): EnvMap {
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

export function resolveCliExecutable(command: string, env: EnvMap): string | null {
  const home = env.HOME || homedir();
  const candidates = (env.PATH ?? "")
    .split(":")
    .filter(Boolean)
    .map((dir) => join(dir, command))
    .concat([
      join(home, ".local", "bin", command),
      join(home, ".local", "node", "bin", command),
      join(home, ".bun", "bin", command),
      join(home, ".cargo", "bin", command),
      join("/opt/homebrew/bin", command),
      join("/usr/local/bin", command),
    ]);
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (isExecutableFile(candidate)) return candidate;
  }

  return null;
}
