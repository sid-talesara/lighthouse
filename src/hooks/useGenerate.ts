import { useCallback, useState } from 'react';

export type GenerateStatus = 'idle' | 'running' | 'done' | 'error';

interface GenerateErrorResponse {
  error?: string;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as GenerateErrorResponse;
    if (body.error) return body.error;
  } catch {
    // Fall through to the generic response status below.
  }
  return `Generate failed: ${response.status} ${response.statusText}`;
}

export function useGenerate(onDone: () => void) {
  const [status, setStatus] = useState<GenerateStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (repoPath: string) => {
      const trimmedPath = repoPath.trim();
      if (!trimmedPath || status === 'running') return;

      setStatus('running');
      setError(null);

      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoPath: trimmedPath }),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        setStatus('done');
        onDone();
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [onDone, status]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, generate, reset };
}
