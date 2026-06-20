/**
 * Extracts the final result text from one Claude Code stream-json line.
 */
export function parseResultFromLine(line: string): string | null {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (parsed.type !== "result") {
    return null;
  }

  const result = parsed.result;
  if (typeof result === "string" && result.trim().length > 0) {
    return result.trim();
  }

  return null;
}
