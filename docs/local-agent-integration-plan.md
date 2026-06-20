# Local Agent Integration Plan
## Generate `data.json` via a thin local Node companion server

**Status:** Implementation plan — do not ship without review  
**Scope:** Localhost-only companion server. No deployed backend. No keys in git.

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  BROWSER (localhost:5173)                                           │
│                                                                     │
│  ┌─────────────────┐   POST /generate        ┌──────────────────┐  │
│  │  GeneratePanel  │ ──────────────────────▶ │  Express server  │  │
│  │  (repo path +   │   { repoPath }          │  localhost:3001  │  │
│  │   Generate btn) │                         │                  │  │
│  │                 │ ◀── SSE stream ───────── │  /stream  (SSE)  │  │
│  │  progress log   │   { type, text }        │                  │  │
│  │                 │                         │  POST /generate  │  │
│  └────────┬────────┘                         │   spawns claude  │  │
│           │                                  └────────┬─────────┘  │
│           │ data reloaded                             │            │
│           ▼                                           │ spawn()    │
│  App.tsx calls loadData()                             ▼            │
│  ← re-renders map                        ┌────────────────────┐   │
│                                          │  claude process    │   │
└──────────────────────────────────────────│  cwd=<repoPath>    │───┘
                                           │  --output-format   │
                                           │    stream-json     │
                                           │  --input-format    │
                                           │    stream-json     │
                                           │  --permission-mode │
                                           │    bypassPermissions│
                                           └────────┬───────────┘
                                                    │ reads
                                                    ▼
                                           ┌────────────────────┐
                                           │  target repo files │
                                           │  (user-specified   │
                                           │   local path)      │
                                           └────────────────────┘
                                                    │
                                 agent writes result to stdout (stream-json)
                                                    │
                                 server extracts JSON from result event
                                                    │
                                                    ▼
                                    /Users/.../lighthouse/public/data.json
```

**Minimum viable path:** POST /generate → spawn claude → capture result → write data.json → React polls or page-reload triggers loadData(). SSE progress log is the nice-to-have on top.

---

## 2. File tree

### New files

```
lighthouse/
├── server/                          ← NEW: companion server (plain CJS/ESM Node)
│   ├── package.json                 ← NEW: separate package (express, cors, zod)
│   ├── tsconfig.json                ← NEW: extends root, targets server/src
│   └── src/
│       ├── index.ts                 ← NEW: Express entry, mounts routes, starts server
│       ├── routes/
│       │   └── generate.ts          ← NEW: POST /generate + GET /stream endpoints
│       ├── agent/
│       │   ├── cli-spawn.ts         ← LIFTED from Aiden (adapted, see §6)
│       │   ├── shell-env.ts         ← LIFTED from Aiden (adapted, see §6)
│       │   └── run-claude.ts        ← NEW: orchestrates spawn + stdin + stdout parsing
│       ├── parser/
│       │   └── claude-stream.ts     ← LIFTED from Aiden parsers/claude.ts (adapted, see §6)
│       └── validate/
│           └── schema.ts            ← NEW: Zod schema matching src/types/lighthouse.ts
│
├── src/
│   └── components/
│       ├── GeneratePanel.tsx        ← NEW: repo path input + Generate button + log
│       └── GenerateButton.tsx       ← NEW (or inline in GeneratePanel): minimal trigger btn
│
├── src/
│   └── hooks/
│       └── useGenerate.ts           ← NEW: calls POST /generate, subscribes SSE, surfaces state
│
└── src/
    └── App.tsx                      ← CHANGE: add GeneratePanel to header area (see §5)
```

### Existing files that change

| File | Change |
|---|---|
| `src/App.tsx` | Add `GeneratePanel` import + render it in header; add a `reloadKey` state that increments to retrigger `loadData()` |
| `package.json` | Add `"dev:all"` and `"server"` scripts via `concurrently` (devDependency) |
| `vite.config.ts` | Add `server.proxy` entry: `/api → http://localhost:3001` so React can hit the companion without CORS issues in dev |
| `public/data.json` | Overwritten by the server after successful generation (already exists as static fallback) |
| `.gitignore` | Ensure `.env` / `server/.env` are ignored (already likely present) |

---

## 3. The server

### 3.1 Dependencies (`server/package.json`)

```json
{
  "name": "lighthouse-companion",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.0.0",
    "tsx": "^4.15.0",
    "typescript": "^5.5.3"
  },
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts"
  }
}
```

No Aiden-specific packages (`electron`, `@aiden/*`, `electron-log`) are carried over.

### 3.2 `server/src/index.ts`

```ts
import express from 'express';
import cors from 'cors';
import { generateRouter } from './routes/generate.js';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use('/api', generateRouter);

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`[companion] listening on ${PORT}`));
```

### 3.3 Endpoints (`server/src/routes/generate.ts`)

**POST /api/generate**

```
Body: { repoPath: string }
Response: 200 { ok: true, dataPath: string } on success
          400 { error: string }            on bad input
          500 { error: string }            on agent failure
```

Behaviour: synchronous run of the agent (or async with status polling — see §3.5). Returns only when `data.json` is written and validated.

**GET /api/stream** (SSE — nice-to-have)

```
Query: ?id=<jobId>     (jobId returned by POST /api/generate when async variant)
Response: text/event-stream
Events:
  data: { type: "log",      text: string }
  data: { type: "progress", text: string }
  data: { type: "done",     dataPath: string }
  data: { type: "error",    error: string }
```

For the hackathon minimum: skip SSE. POST /generate blocks until done; React shows a spinner and refreshes on 200.

### 3.4 Binary discovery (`server/src/agent/shell-env.ts`)

Adapted from `apps/desktop/src/main/utils/shell-env.ts`. Strip:
- `import log from 'electron-log/main'` → replace with `console.warn` / `console.info`
- `import * as os from 'node:os'` → keep (Node built-in, fine)

Keep verbatim:
- `getLoginShellEnvironment()` — spawns `$SHELL -ilc 'env'` to capture the user's full PATH including nvm/volta-managed node and `~/.local/bin` where `claude` lives
- `parseEnvOutput()` — parses `env` output, appends `~/.local/bin`, `~/.local/node/bin`, `/usr/local/bin` to PATH

Target path: `server/src/agent/shell-env.ts`

---

Adapted from `apps/desktop/src/main/services/machine-presence/utils.ts`, extract only `resolveCliExecutable`:

```ts
// server/src/agent/shell-env.ts  (continued)
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

function isExecutableFile(path: string): boolean {
  try { accessSync(path, constants.X_OK); return true; } catch { return false; }
}

export function resolveCliExecutable(
  command: string,
  env: Record<string, string>
): string | null {
  const home = env.HOME || homedir();
  const candidates = (env.PATH ?? '')
    .split(':').filter(Boolean).map((dir) => join(dir, command))
    .concat([
      join(home, '.local', 'bin', command),
      join(home, '.local', 'node', 'bin', command),
      join(home, '.bun', 'bin', command),
      join('/opt/homebrew/bin', command),
      join('/usr/local/bin', command),
    ]);
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    if (isExecutableFile(c)) return c;
  }
  return null;
}
```

Strip: Aiden's `overrideEnvVars` map (supatest-specific), `CLI_COMMAND_ALIASES`, all other `BACKEND_*` maps.

### 3.5 Process spawn (`server/src/agent/cli-spawn.ts`)

Copy verbatim from `packages/agent-core/src/runtime-backends/cli-spawn.ts`:
- `planCliSpawn(command, args, env): CliSpawnPlan`
- `spawnCli(command, args, context): ChildProcessWithoutNullStreams`

Strip: the `CliRuntimeContext` type import — inline it as `{ cwd: string; env: Record<string,string> }` in the local types file.

Target path: `server/src/agent/cli-spawn.ts`

### 3.6 The `claude` invocation (`server/src/agent/run-claude.ts`)

The exact flags come from `packages/agent-core/src/runtime-backends/backends/claude.ts`. The invocation is:

```
claude \
  --verbose \
  --output-format stream-json \
  --input-format stream-json \
  --permission-mode bypassPermissions \
  --system-prompt "<system-prompt text>" \
  [--model claude-opus-4-5]
```

The prompt is sent via **stdin as a stream-json message** (not a CLI flag), exactly as Aiden does:

```ts
// server/src/agent/run-claude.ts
const stdinMessage = JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'text', text: analysisPrompt }],
  },
  session_id: 'default',
  parent_tool_use_id: null,
});
child.stdin.write(stdinMessage + '\n');
// Do NOT close stdin immediately — claude --input-format stream-json
// waits for more messages. Close after the result event is received.
```

Full spawn sequence:

```ts
import { createInterface } from 'node:readline';
import { spawnCli } from './cli-spawn.js';
import { getLoginShellEnvironment, resolveCliExecutable } from './shell-env.js';
import { parseResultFromLine } from '../parser/claude-stream.js';

export async function runClaudeAgent(
  repoPath: string,
  prompt: string,
  onLog?: (line: string) => void
): Promise<string> {                // resolves with raw JSON string
  const env = getLoginShellEnvironment();
  const claudeBin = resolveCliExecutable('claude', env);
  if (!claudeBin) throw new Error('claude binary not found. Install Claude Code CLI.');

  const args = [
    '--verbose',
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--permission-mode', 'bypassPermissions',
  ];

  const child = spawnCli(claudeBin, args, { cwd: repoPath, env });

  // EPIPE guard — child may die before stdin write completes
  child.stdin.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code !== 'EPIPE') console.error('[companion] stdin error', err);
  });

  // Write prompt via stream-json stdin protocol
  const msg = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: prompt }] },
    session_id: 'default',
    parent_tool_use_id: null,
  });
  child.stdin.write(msg + '\n');

  const rl = createInterface({ input: child.stdout });
  const stderrRl = createInterface({ input: child.stderr });

  let resultJson: string | null = null;

  const exitPromise = new Promise<number>((res, rej) => {
    child.on('error', rej);
    child.on('exit', (code) => res(code ?? 0));
  });

  const resultPromise = new Promise<void>((res) => {
    rl.on('line', (line) => {
      onLog?.(line);
      const extracted = parseResultFromLine(line);
      if (extracted !== null) {
        resultJson = extracted;
        // Close stdin to let the claude process exit
        if (!child.stdin.destroyed) child.stdin.end();
        res();
      }
    });
  });

  stderrRl.on('line', (line) => onLog?.(`[stderr] ${line}`));

  // Race: result event vs process exit
  await Promise.race([resultPromise, exitPromise]);

  // 5-second grace for clean exit
  await Promise.race([exitPromise, new Promise((r) => setTimeout(r, 5000))]);

  rl.close(); stderrRl.close();

  if (!resultJson) throw new Error('Agent exited without emitting a result event');
  return resultJson;
}
```

### 3.7 stdout parsing (`server/src/parser/claude-stream.ts`)

Adapted from `packages/agent-core/src/runtime-backends/parsers/claude.ts`.

The only function needed is extracting the final result text from the `result` event line:

```ts
// server/src/parser/claude-stream.ts

/**
 * If `line` is a JSON object with type="result" and a non-empty `result` string,
 * returns that string. Otherwise returns null.
 * Mirrors the "result" case in parseClaudeStructuredLine from Aiden's parsers/claude.ts.
 */
export function parseResultFromLine(line: string): string | null {
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(line) as Record<string, unknown>; }
  catch { return null; }

  if (parsed.type !== 'result') return null;
  const result = parsed.result;
  if (typeof result === 'string' && result.trim().length > 0) return result.trim();
  return null;
}
```

Strip: everything else from parsers/claude.ts — `onAssistantText`, `onToolUse`, `onThinking`, interactive tool handling, session management, `presenter` interface. None of that is needed for a one-shot JSON extraction.

### 3.8 Schema validation (`server/src/validate/schema.ts`)

Mirrors `src/types/lighthouse.ts` as Zod, so the server rejects malformed JSON before writing:

```ts
import { z } from 'zod';

const NodeKind = z.enum(['cluster', 'module', 'file']);
const EdgeKind = z.enum(['depends', 'calls', 'imports']);

export const LighthouseDataSchema = z.object({
  repo: z.object({ name: z.string(), description: z.string() }),
  clusters: z.array(z.object({
    id: z.string(), label: z.string(), summary: z.string(),
    modules: z.array(z.string()),
  })),
  nodes: z.array(z.object({
    id: z.string(), label: z.string(), kind: NodeKind,
    parent: z.string(), summary: z.string(),
    key_files: z.array(z.string()), path: z.string(),
    changed_recently: z.boolean(),
  })),
  edges: z.array(z.object({
    source: z.string(), target: z.string(), kind: EdgeKind,
  })),
  flows: z.array(z.object({
    name: z.string(),
    steps: z.array(z.object({ node: z.string(), description: z.string() })),
  })),
  sections: z.array(z.object({
    id: z.string(), title: z.string(), body_markdown: z.string(),
    related_nodes: z.array(z.string()),
  })),
});

export type LighthouseData = z.infer<typeof LighthouseDataSchema>;
```

### 3.9 Extracting JSON from the result string

The agent's `result` field is free-form text. The agent may wrap the JSON in markdown fences. Extraction:

```ts
// server/src/routes/generate.ts
function extractJson(raw: string): string {
  // Strip markdown fences if present
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  // Locate outermost { }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}
```

Full generate route:

```ts
// server/src/routes/generate.ts
import { Router } from 'express';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runClaudeAgent } from '../agent/run-claude.js';
import { buildAnalysisPrompt } from '../agent/prompt.js';
import { LighthouseDataSchema } from '../validate/schema.js';

export const generateRouter = Router();

// Absolute path to lighthouse/public/data.json
const DATA_JSON_PATH = join(import.meta.dirname, '..', '..', '..', 'public', 'data.json');

generateRouter.post('/generate', async (req, res) => {
  const { repoPath } = req.body as { repoPath?: string };
  if (!repoPath?.trim()) {
    res.status(400).json({ error: 'repoPath is required' });
    return;
  }

  try {
    const rawResult = await runClaudeAgent(repoPath.trim(), buildAnalysisPrompt());
    const jsonStr = extractJson(rawResult);
    const parsed = JSON.parse(jsonStr);
    const validated = LighthouseDataSchema.parse(parsed); // throws ZodError if invalid
    writeFileSync(DATA_JSON_PATH, JSON.stringify(validated, null, 2), 'utf-8');
    res.json({ ok: true, dataPath: DATA_JSON_PATH });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[companion] generate failed:', msg);
    res.status(500).json({ error: msg });
  }
});
```

---

## 4. The agent prompt (`server/src/agent/prompt.ts`)

Adapted from PRD §8 with JSON-only enforcement and schema anchor:

```ts
export function buildAnalysisPrompt(): string {
  return `You are analyzing this repository to produce a structured architecture map for Lighthouse, a codebase visualization tool.

TASK
Explore the repository structure and key source files. Output ONLY a single valid JSON object — no prose, no markdown fences, no explanation before or after.

SCHEMA (output must match exactly):
{
  "repo": { "name": "string", "description": "string" },
  "clusters": [
    { "id": "string", "label": "string", "summary": "string", "modules": ["node_id"] }
  ],
  "nodes": [
    {
      "id": "string", "label": "string",
      "kind": "cluster" | "module" | "file",
      "parent": "string (cluster_id or module_id)",
      "summary": "string (one sentence)",
      "key_files": ["relative/path.ts"],
      "path": "relative/dir",
      "changed_recently": false
    }
  ],
  "edges": [{ "source": "node_id", "target": "node_id", "kind": "depends" | "calls" | "imports" }],
  "flows": [{ "name": "string", "steps": [{ "node": "node_id", "description": "string" }] }],
  "sections": [
    { "id": "string", "title": "string", "body_markdown": "string", "related_nodes": ["id"] }
  ]
}

RULES
1. Group into 5–8 top-level CAPABILITY clusters (name by what they do, not where files live).
   Example clusters: Authentication, API Layer, Data Model, Background Jobs, UI Shell.
2. For each cluster, enumerate its modules (2–6 per cluster). For each module list key_files.
3. Write a one-sentence summary for EVERY node. No node may have an empty summary.
4. Capture the 5–10 most important dependency edges between modules. kind must be one of: depends, calls, imports.
5. Identify 2–3 key request or data flows with ordered steps (each step.node must be a valid node id).
6. Write 4–6 wiki sections in markdown (suggested: Overview, Architecture, Key Flows, Entry Points, Data Model, Getting Started).
   Each section must have at least 2 related_nodes.
7. Every id referenced in clusters.modules, edges, flows.steps.node, and sections.related_nodes MUST exist as a node id or cluster id.
8. Be accurate to the actual code. Do NOT invent files, paths, or capabilities you did not see.
9. changed_recently: set to true only for nodes whose files you can confirm were modified recently (e.g. git log shows changes in the last 14 days). Default false if uncertain.
10. Output ONLY the JSON object. No markdown fences. No text before or after.`;
}
```

**JSON-only enforcement strategy (layered):**
1. System prompt rule 10 forbids prose.
2. `--permission-mode bypassPermissions` prevents interactive prompts that would break the stream.
3. `extractJson()` on the server strips any accidental fences or preamble.
4. `LighthouseDataSchema.parse()` rejects malformed output before writing.
5. The existing `validate()` in `src/lib/loadData.ts` catches anything that slips past on the React side.

---

## 5. The React side

### 5.1 `src/hooks/useGenerate.ts`

```ts
import { useState, useCallback } from 'react';

export type GenerateStatus = 'idle' | 'running' | 'done' | 'error';

export function useGenerate(onDone: () => void) {
  const [status, setStatus] = useState<GenerateStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const generate = useCallback(async (repoPath: string) => {
    setStatus('running');
    setError(null);
    setLog([]);

    try {
      // Vite proxies /api → localhost:3001 (see vite.config.ts change)
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      setStatus('done');
      onDone(); // triggers map reload
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [onDone]);

  return { status, error, log, generate };
}
```

SSE variant (upgrade path, not required for MVP): swap `fetch` for an `EventSource` to `/api/stream?id=<jobId>` and push log lines into `setLog`.

### 5.2 `src/components/GeneratePanel.tsx`

```tsx
// Minimal, consistent with Lighthouse instrument design (mono text, abyss palette)
import { useState } from 'react';
import { useGenerate } from '../hooks/useGenerate';

export function GeneratePanel({ onDone }: { onDone: () => void }) {
  const [repoPath, setRepoPath] = useState('');
  const { status, error, generate } = useGenerate(onDone);

  return (
    <div className="flex items-center gap-2">
      <input
        value={repoPath}
        onChange={(e) => setRepoPath(e.target.value)}
        placeholder="/path/to/repo"
        className="h-7 w-64 rounded-md border border-slate2-400/20 bg-abyss-700/60 px-2
                   font-mono text-[12px] text-slate2-200 placeholder-slate2-400/50
                   focus:outline-none focus:ring-1 focus:ring-tide-500/60"
      />
      <button
        onClick={() => { if (repoPath.trim()) void generate(repoPath.trim()); }}
        disabled={status === 'running' || !repoPath.trim()}
        className="flex h-7 items-center gap-1.5 rounded-md border border-beacon-500/30
                   bg-beacon-500/10 px-3 font-mono text-[11px] text-beacon-300
                   hover:bg-beacon-500/20 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors"
      >
        {status === 'running' ? (
          <>
            <span className="h-2 w-2 animate-spin rounded-full border border-beacon-400 border-t-transparent" />
            Scanning…
          </>
        ) : 'Generate'}
      </button>
      {error && (
        <span className="font-mono text-[11px] text-red-400">{error}</span>
      )}
      {status === 'done' && (
        <span className="font-mono text-[11px] text-tide-400">Map updated</span>
      )}
    </div>
  );
}
```

### 5.3 Changes to `src/App.tsx`

Add a `reloadKey` counter. When `GeneratePanel` calls `onDone`, increment it. The `useEffect` that calls `loadData()` depends on `reloadKey`, so it re-fetches automatically (the static file server always serves the latest `public/data.json`):

```tsx
// In App.tsx — diff only
+ import { GeneratePanel } from './components/GeneratePanel';
+ const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    loadData()
      .then((d) => { if (alive) setData(d); })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : String(err)); });
    return () => { alive = false; };
- }, []);
+ }, [reloadKey]);

// In the header JSX, after the existing stats row:
+ <GeneratePanel onDone={() => setReloadKey((k) => k + 1)} />
```

`loadData()` already calls `fetch('/data.json')`, which Vite serves from `public/`. No change to `loadData.ts` itself.

### 5.4 `vite.config.ts` change

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
+ server: {
+   proxy: {
+     '/api': {
+       target: 'http://localhost:3001',
+       changeOrigin: true,
+     },
+   },
+ },
})
```

This eliminates CORS entirely in dev. The Express server still sets `cors({ origin: 'http://localhost:5173' })` as defence-in-depth for any direct calls.

---

## 6. Aiden lift table

| Aiden source file | Function(s) to lift | Copy / adapt | Strip | Target in Lighthouse |
|---|---|---|---|---|
| `packages/agent-core/src/runtime-backends/cli-spawn.ts` | `planCliSpawn`, `spawnCli` | **Copy verbatim** (pure Node, zero Aiden deps) | Remove `CliRuntimeContext` import; inline as `{ cwd: string; env: Record<string,string> }` | `server/src/agent/cli-spawn.ts` |
| `apps/desktop/src/main/utils/shell-env.ts` | `getLoginShellEnvironment`, `parseEnvOutput`, `clearLoginShellEnvironmentCache` | **Adapt** | Remove `import log from 'electron-log/main'`; replace `log.info` / `log.warn` with `console.info` / `console.warn`; remove Electron-specific `preloadLoginShellEnvironment` (keep sync fallback only) | `server/src/agent/shell-env.ts` |
| `apps/desktop/src/main/services/machine-presence/utils.ts` | `resolveCliExecutable`, `isExecutableFile` | **Adapt** | Remove everything else: `getMachineIdStore`, `collectDesktopRuntimeMetadata`, `detectAvailableAgentBackends`, `BACKEND_*` maps, `CLI_COMMAND_ALIASES`, `overrideEnvVars` map (supatest-specific), `app` import from electron | `server/src/agent/shell-env.ts` (append to same file) |
| `packages/agent-core/src/runtime-backends/parsers/claude.ts` | `parseClaudeStructuredLine` — only the `result` case | **Adapt** (extract into `parseResultFromLine`) | Remove entire `presenter` interface, `state` object, `onAssistantText`, `onToolUse`, `onThinking`, `onAskUser`, `onExitPlanMode`, `onTodoWrite`, interactive tool logic, session tracking, continuation mode — none needed for one-shot JSON capture | `server/src/parser/claude-stream.ts` |
| `packages/agent-core/src/runtime-backends/generic-cli-backend.ts` | Process lifecycle pattern (stdin write → readline → exit race → grace kill) | **Reference only** — do NOT copy the file | The full `createGenericCliBackend` carries too many Aiden types. Reproduce the pattern directly in `server/src/agent/run-claude.ts` (see §3.6 — the code is ~60 lines without the presenter machinery) | Inline in `server/src/agent/run-claude.ts` |
| `packages/agent-core/src/runtime-backends/backends/claude.ts` | `createClaudeCliBackend` — specifically the args array and stdin message format | **Reference only** — extract the args list and stdin JSON format verbatim | Do not copy the file; the `--chrome` flag, `--resume`, model/effort flags, `allowContinuation` are all Aiden-specific | Inline in `server/src/agent/run-claude.ts` (see §3.6) |

**Key invariants preserved from Aiden:**
- `--output-format stream-json --input-format stream-json` — required for structured output
- stdin message: `{ type: "user", message: { role: "user", content: [...] }, session_id: "default", parent_tool_use_id: null }`
- `detached: true` on Unix so `process.kill(-pid, 'SIGKILL')` kills the whole tree
- EPIPE guard on `child.stdin`
- Close stdin after the `result` event, not before

---

## 7. Dev & prod run

### 7.1 Running both

Add to root `package.json`:

```json
{
  "scripts": {
    "dev":        "vite",
    "dev:server": "cd server && npm run dev",
    "dev:all":    "concurrently -n ui,server -c cyan,yellow \"npm run dev\" \"npm run dev:server\"",
    "build":      "tsc -b && vite build",
    "lint":       "eslint ."
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

Start everything: `npm run dev:all`

Ports: Vite on `:5173`, companion on `:3001`.

### 7.2 Offline-safe fallback

`public/data.json` is always committed with demo data. If the companion server is not running, `POST /api/generate` returns a network error, `useGenerate` surfaces it in the UI, and the existing map renders from the cached file unchanged. No server = read-only mode; the full map still works.

The `--permission-mode bypassPermissions` flag requires that the user running the companion has `claude` installed and authenticated (via `claude auth login`). If `claude` is not found, `resolveCliExecutable` returns `null` and the server returns a 500 with a clear message: "claude binary not found. Install Claude Code CLI."

### 7.3 Keys out of git

The companion server talks to Claude via the `claude` CLI, which manages its own auth (`~/.claude/`). No API key is passed through the companion server. No `.env` file required. The only secret at play is the Claude login in `~/.claude/` — already outside the repo.

If a future variant calls the Anthropic API directly (not via CLI), add `server/.env` with `ANTHROPIC_API_KEY=...` and ensure `server/.env` is in `.gitignore`.

### 7.4 Agent run time

Expect 30–120 seconds for a medium-sized repo. The Express request will timeout if Express's default socket timeout fires. Set it explicitly:

```ts
// server/src/index.ts
import { createServer } from 'node:http';
const httpServer = createServer(app);
httpServer.setTimeout(5 * 60 * 1000); // 5-minute timeout
httpServer.listen(PORT, ...);
```

---

## 8. Effort breakdown

### Load-bearing (hackathon must-ship)

| Task | Est. |
|---|---|
| Scaffold `server/` dir, `package.json`, `tsconfig.json` | 15 min |
| Lift + adapt `cli-spawn.ts` | 10 min |
| Lift + adapt `shell-env.ts` (strip electron-log) | 15 min |
| Lift `resolveCliExecutable` into `shell-env.ts` | 10 min |
| Write `server/src/agent/run-claude.ts` (spawn + stdin + readline + exit race) | 30 min |
| Write `server/src/parser/claude-stream.ts` (`parseResultFromLine`) | 10 min |
| Write `server/src/validate/schema.ts` (Zod mirror of lighthouse.ts) | 15 min |
| Write `server/src/agent/prompt.ts` | 15 min |
| Write `server/src/routes/generate.ts` (POST /api/generate, JSON extraction, write file) | 20 min |
| Write `server/src/index.ts` (Express setup, CORS, 5-min timeout) | 10 min |
| Install server deps (`npm install` in `server/`) | 5 min |
| `src/hooks/useGenerate.ts` | 15 min |
| `src/components/GeneratePanel.tsx` | 20 min |
| Patch `src/App.tsx` (reloadKey + GeneratePanel) | 10 min |
| Patch `vite.config.ts` (proxy) | 5 min |
| Root `package.json` concurrently script | 5 min |
| Smoke test end-to-end | 20 min |
| **Total load-bearing** | **~3.5 hrs** |

### Flourishes (cut if short on time)

| Task | Est. |
|---|---|
| SSE streaming log (`GET /api/stream`, `EventSource` in React) | 45 min |
| Log panel in GeneratePanel UI (scrolling terminal look) | 20 min |
| Animated "Scanning…" beacon pulse on Generate button | 10 min |
| Abort button (sends SIGTERM to child process group) | 20 min |
| `--model` flag exposed as a dropdown in the UI | 15 min |

**Cut line for hackathon:** ship everything in "load-bearing". SSE and abort are nice; skip them.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **`claude` binary not found** (nvm-installed, unusual PATH) | `resolveCliExecutable` probes `~/.local/bin`, `~/.bun/bin`, `/opt/homebrew/bin`, `/usr/local/bin` in addition to $PATH. `getLoginShellEnvironment()` spawns `$SHELL -ilc env` to capture the real login-shell PATH. Error message tells the user exactly what to do. |
| **Agent emits invalid JSON** (hallucinated fields, extra prose) | `extractJson()` strips markdown fences; `JSON.parse()` catches syntax errors; `LighthouseDataSchema.parse()` (Zod) rejects structurally wrong output. All throw, server returns 500 with details, existing `public/data.json` is NOT overwritten — atomic: write only on full success. |
| **Agent takes too long on stage** | HTTP server socket timeout set to 5 min. For demo: pre-generate `public/data.json` for the demo repo before going on stage. Generation is a "setup" step, not a live demo step. Live generation = flourish. |
| **CORS issues** | Vite proxy (`/api → :3001`) eliminates cross-origin requests in dev. For any direct-access scenario, Express sets `cors({ origin: 'http://localhost:5173' })`. |
| **Port collision (:3001 in use)** | `PORT` env var is respected in `server/src/index.ts`. Document in README: `PORT=3002 npm run dev:server`. |
| **`public/data.json` corrupted mid-write** | Write to a temp file first, then `fs.renameSync` (atomic on same filesystem). Add this to `server/src/routes/generate.ts` before the demo. |
| **Deployed to the internet by accident** | Server binds to no specific host (defaults to `0.0.0.0` in Express, but CORS is locked to `localhost:5173`). Document: "This is a local companion server. Do not expose it to the internet." Add a startup warning log line. |
| **`--permission-mode bypassPermissions` concerns** | The server only passes a path the user typed. The agent runs in that repo. No credentials are passed. `bypassPermissions` is required for non-interactive operation (no AskUserQuestion dialogs). For security: validate `repoPath` is an absolute path to an existing directory before spawning. |

---

## Appendix: `stream-json` stdin format reference

From `packages/agent-core/src/runtime-backends/backends/claude.ts` (`stdinWriter`):

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      { "type": "text", "text": "<prompt text here>" }
    ]
  },
  "session_id": "default",
  "parent_tool_use_id": null
}
```

Sent as one JSON line to `child.stdin`, terminated with `\n`. Stdin is kept open until the `result` event is received in stdout.

Result event shape (from `parsers/claude.ts` `result` case):

```json
{
  "type": "result",
  "subtype": "success",
  "result": "<agent's text output — this is where the JSON lives>",
  "session_id": "...",
  "num_turns": 4,
  "duration_ms": 34210,
  "total_cost_usd": 0.042,
  "usage": { "input_tokens": 8000, "output_tokens": 2400 }
}
```

`parsed.result` is the string to extract, then strip fences, then parse as JSON.
