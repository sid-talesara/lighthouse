import { useCallback, useState } from 'react';

import {
  DEFAULT_GENERATE_MODEL,
  type GenerateModel,
} from '../lib/generateOptions';

export type GenerateStatus = 'idle' | 'running' | 'done' | 'error';

const GENERATE_REQUEST_TIMEOUT_MS = 6 * 60 * 1000;

interface GenerateErrorResponse {
  error?: string;
  message?: string;
}

interface GenerateRequestOptions {
  repoPath: string;
  model: GenerateModel;
}

interface GenerateRequestBody {
  repoPath: string;
  model?: GenerateModel;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as GenerateErrorResponse;
    if (body.error) return body.error;
    if (body.message) return body.message;
  } catch {
    // Fall through to the generic response status below.
  }
  return `Generate failed: ${response.status} ${response.statusText}`;
}

function buildGenerateRequestBody({
  repoPath,
  model,
}: GenerateRequestOptions): GenerateRequestBody {
  const body: GenerateRequestBody = { repoPath };

  if (model !== DEFAULT_GENERATE_MODEL) body.model = model;

  return body;
}

export function useGenerate(onDone: () => void) {
  const [status, setStatus] = useState<GenerateStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (options: GenerateRequestOptions) => {
      const { model } = options;
      const repoPath = options.repoPath;
      const trimmedPath = repoPath.trim();
      if (!trimmedPath || status === 'running') return;

      setStatus('running');
      setError(null);

      const controller = new AbortController();
      const timeout = window.setTimeout(() => {
        controller.abort();
      }, GENERATE_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildGenerateRequestBody({ repoPath: trimmedPath, model })),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        setStatus('done');
        onDone();
      } catch (err) {
        setStatus('error');
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('Generate request timed out locally after 6 minutes. Check the companion server logs.');
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        window.clearTimeout(timeout);
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
