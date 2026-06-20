/**
 * fileContent.ts — client-side fetch helper for /api/file
 *
 * Usage:
 *   import { fetchFileContent } from './fileContent';
 *   const result = await fetchFileContent('src/lib/utils.ts');
 *   // result.content — full file text
 *   // result.language — e.g. "typescript"
 *   // result.lines — line count
 *   // result.truncated — true if file was capped at 500 KB server-side
 *   // result.unavailable — true if server is unreachable or not yet configured
 *   // result.error — human-readable message when unavailable === true
 */

export interface FileContentResult {
  path: string;
  content: string;
  language: string;
  lines: number;
  size: number;
  truncated?: boolean;
  /** Set to true when the server is unreachable or the repo root is not yet configured. */
  unavailable?: boolean;
  /** Human-readable reason when unavailable === true. */
  error?: string;
}

// ── In-memory LRU-ish cache ──────────────────────────────────────────────────
// Keyed by relative path. Avoids re-fetching the same file during a session.
// We cap at MAX_CACHE_ENTRIES to prevent unbounded memory growth.

const MAX_CACHE_ENTRIES = 100;
const _cache = new Map<string, FileContentResult>();

function cachePut(path: string, result: FileContentResult): void {
  if (_cache.size >= MAX_CACHE_ENTRIES) {
    // Evict the oldest entry (Map insertion order).
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) _cache.delete(firstKey);
  }
  _cache.set(path, result);
}

/** Clear the in-memory cache (e.g. after a new Generate run). */
export function clearFileContentCache(): void {
  _cache.clear();
}

// ── Fetch ────────────────────────────────────────────────────────────────────

const FILE_API_URL = "/api/file";

/**
 * Fetch the content of a file from the companion server.
 *
 * @param relativePath - Repo-relative path, e.g. "src/lib/utils.ts"
 * @param options.signal - Optional AbortSignal for cancellation
 * @param options.forceRefresh - If true, bypass the in-memory cache
 */
export async function fetchFileContent(
  relativePath: string,
  options: { signal?: AbortSignal; forceRefresh?: boolean } = {},
): Promise<FileContentResult> {
  const { signal, forceRefresh = false } = options;

  if (!forceRefresh) {
    const cached = _cache.get(relativePath);
    if (cached) return cached;
  }

  const url = `${FILE_API_URL}?path=${encodeURIComponent(relativePath)}`;

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (err) {
    // Network error — server not running, or request was aborted.
    if (err instanceof Error && err.name === "AbortError") {
      return {
        path: relativePath,
        content: "",
        language: "text",
        lines: 0,
        size: 0,
        unavailable: true,
        error: "Request cancelled.",
      };
    }
    const result: FileContentResult = {
      path: relativePath,
      content: "",
      language: "text",
      lines: 0,
      size: 0,
      unavailable: true,
      error:
        "File content unavailable — run the companion server (`npm run dev:server`) to enable source viewing.",
    };
    return result;
  }

  if (!response.ok) {
    let errorMessage = `Server returned ${response.status}`;
    try {
      const body = (await response.json()) as Record<string, unknown>;
      if (typeof body["error"] === "string") {
        errorMessage = body["error"];
      }
    } catch {
      // ignore JSON parse failure
    }
    const result: FileContentResult = {
      path: relativePath,
      content: "",
      language: "text",
      lines: 0,
      size: 0,
      unavailable: true,
      error: errorMessage,
    };
    return result;
  }

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    const result: FileContentResult = {
      path: relativePath,
      content: "",
      language: "text",
      lines: 0,
      size: 0,
      unavailable: true,
      error: "Server returned invalid JSON.",
    };
    return result;
  }

  const result: FileContentResult = {
    path: typeof body["path"] === "string" ? body["path"] : relativePath,
    content: typeof body["content"] === "string" ? body["content"] : "",
    language: typeof body["language"] === "string" ? body["language"] : "text",
    lines: typeof body["lines"] === "number" ? body["lines"] : 0,
    size: typeof body["size"] === "number" ? body["size"] : 0,
    ...(body["truncated"] === true ? { truncated: true } : {}),
  };

  cachePut(relativePath, result);
  return result;
}
