import { useCallback, useEffect, useState } from 'react';

import {
  DEFAULT_GENERATE_MODEL,
  type GenerateModel,
} from '../lib/generateOptions';

export type GenerateStatus = 'idle' | 'running' | 'done' | 'error';
export type GenerateEventType = 'status' | 'stdout' | 'stderr' | 'codex' | 'client';

const GENERATE_REQUEST_TIMEOUT_MS = 6 * 60 * 1000;
const MAX_EVENT_LOG_ENTRIES = 40;
const GENERATE_JOBS_ENDPOINT = '/api/generate/jobs';
const LEGACY_GENERATE_ENDPOINT = '/api/generate';

interface GenerateErrorResponse {
  error?: string;
  message?: string;
}

interface GenerateSuccessResponse {
  ok?: boolean;
  agent?: string;
  dataPath?: string;
  jobId?: string;
  eventsUrl?: string;
  statusUrl?: string;
}

interface GenerateRequestOptions {
  repoPath: string;
  model: GenerateModel;
}

interface GenerateRequestBody {
  repoPath: string;
  model?: GenerateModel;
}

export interface GenerateEventLogEntry {
  id: string;
  type: GenerateEventType;
  message: string;
  elapsedMs: number;
  at: string;
  codexType?: string;
}

interface IncomingGenerateEvent {
  id?: string;
  type?: string;
  phase?: string;
  message?: string;
  elapsedMs?: number;
  at?: string;
  codexType?: string;
  error?: string;
}

interface GenerateSnapshotEvent {
  jobId?: string;
  status?: string;
  error?: string | null;
  events?: IncomingGenerateEvent[];
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

async function readSuccessBody(response: Response): Promise<GenerateSuccessResponse> {
  try {
    return (await response.json()) as GenerateSuccessResponse;
  } catch {
    return { ok: true };
  }
}

function shouldTryLegacyGenerate(response: Response): boolean {
  return response.status === 404 || response.status === 405;
}

function formatElapsedMs(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function stageFromElapsed(elapsedMs: number): string {
  if (elapsedMs < 5_000) return 'Starting local Codex';
  if (elapsedMs < 20_000) return 'Reading repository';
  if (elapsedMs < 75_000) return 'Thinking through architecture';
  if (elapsedMs < 180_000) return 'Generating map data';
  return 'Waiting for final Codex output';
}

function isLocalStage(stage: string): boolean {
  return (
    stage === 'Ready' ||
    stage === 'Starting local Codex' ||
    stage === 'Reading repository' ||
    stage === 'Thinking through architecture' ||
    stage === 'Generating map data' ||
    stage === 'Waiting for final Codex output'
  );
}

function normalizeEventMessage(event: GenerateEventLogEntry): string {
  return event.message.trim() || event.codexType || event.type;
}

function normalizeEventType(type: string | undefined): GenerateEventType {
  if (type === 'status' || type === 'stdout' || type === 'stderr' || type === 'codex') {
    return type;
  }

  return 'codex';
}

export function useGenerate(onDone: () => void) {
  const [status, setStatus] = useState<GenerateStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stage, setStage] = useState('Ready');
  const [events, setEvents] = useState<GenerateEventLogEntry[]>([]);

  useEffect(() => {
    if (status !== 'running' || startedAt === null) return undefined;

    const updateElapsed = () => {
      const nextElapsedMs = Date.now() - startedAt;
      setElapsedMs(nextElapsedMs);
      setStage((currentStage) =>
        isLocalStage(currentStage) ? stageFromElapsed(nextElapsedMs) : currentStage
      );
    };

    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt, status]);

  const appendEvent = useCallback((event: Omit<GenerateEventLogEntry, 'id'> & { id?: string }) => {
    const entry: GenerateEventLogEntry = {
      ...event,
      id: event.id || `${event.at}-${event.type}-${Math.random().toString(36).slice(2)}`,
    };

    setEvents((currentEvents) => [...currentEvents, entry].slice(-MAX_EVENT_LOG_ENTRIES));

    if (entry.type === 'status' || entry.type === 'codex' || entry.type === 'client') {
      setStage(normalizeEventMessage(entry));
    }
  }, []);

  const watchProgressEvents = useCallback(
    (body: GenerateSuccessResponse, requestStartedAt: number): Promise<void> => {
      const eventsUrl =
        body.eventsUrl ||
        (body.jobId ? `/api/generate/jobs/${encodeURIComponent(body.jobId)}/events` : null);

      if (!eventsUrl) return Promise.resolve();

      appendEvent({
        type: 'client',
        message: `Listening for ${body.jobId ? `job ${body.jobId}` : 'generation'} events`,
        elapsedMs: Date.now() - requestStartedAt,
        at: new Date().toISOString(),
      });

      return new Promise((resolve, reject) => {
        const eventSource = new EventSource(eventsUrl);
        const timeout = window.setTimeout(() => {
          eventSource.close();
          reject(new Error('Generate event stream timed out locally after 6 minutes.'));
        }, GENERATE_REQUEST_TIMEOUT_MS);

        const close = () => {
          window.clearTimeout(timeout);
          eventSource.close();
        };

        const appendIncomingEvent = (incoming: IncomingGenerateEvent) => {
          const type = normalizeEventType(incoming.type);
          appendEvent({
            id: incoming.id,
            type,
            message: incoming.message || incoming.phase || incoming.codexType || type,
            elapsedMs:
              typeof incoming.elapsedMs === 'number'
                ? incoming.elapsedMs
                : Date.now() - requestStartedAt,
            at: incoming.at || new Date().toISOString(),
            codexType: incoming.codexType,
          });
        };

        const handleProgressMessage = (event: MessageEvent<string>) => {
          try {
            const parsed = JSON.parse(event.data) as IncomingGenerateEvent | GenerateSnapshotEvent;
            const eventType = event.type === 'message' ? (parsed as IncomingGenerateEvent).type : event.type;

            if (eventType === 'snapshot') {
              const snapshot = parsed as GenerateSnapshotEvent;
              snapshot.events?.forEach(appendIncomingEvent);

              if (snapshot.error) {
                close();
                reject(new Error(snapshot.error));
              }
              return;
            }

            if (eventType === 'progress') {
              appendIncomingEvent(parsed as IncomingGenerateEvent);
              return;
            }

            if (eventType === 'done') {
              close();
              resolve();
              return;
            }

            if (eventType === 'error') {
              close();
              const errorPayload = parsed as IncomingGenerateEvent;
              reject(new Error(errorPayload.error || errorPayload.message || 'Generate failed.'));
              return;
            }

            appendIncomingEvent({
              ...(parsed as IncomingGenerateEvent),
              type: eventType,
            });
          } catch {
            appendEvent({
              type: event.type === 'error' ? 'stderr' : 'codex',
              message: event.data,
              elapsedMs: Date.now() - requestStartedAt,
              at: new Date().toISOString(),
            });
          }
        };

        eventSource.onmessage = handleProgressMessage;
        eventSource.addEventListener('status', handleProgressMessage);
        eventSource.addEventListener('stdout', handleProgressMessage);
        eventSource.addEventListener('stderr', handleProgressMessage);
        eventSource.addEventListener('codex', handleProgressMessage);
        eventSource.addEventListener('snapshot', handleProgressMessage);
        eventSource.addEventListener('progress', handleProgressMessage);
        eventSource.addEventListener('done', handleProgressMessage);
        eventSource.addEventListener('error', (event) => {
          if (event instanceof MessageEvent && event.data) {
            handleProgressMessage(event as MessageEvent<string>);
            return;
          }

          close();
          reject(new Error('Generate event stream disconnected.'));
        });
      });
    },
    [appendEvent]
  );

  const generate = useCallback(
    async (options: GenerateRequestOptions) => {
      const { model } = options;
      const repoPath = options.repoPath;
      const trimmedPath = repoPath.trim();
      if (!trimmedPath || status === 'running') return;

      const requestStartedAt = Date.now();
      setStatus('running');
      setError(null);
      setStartedAt(requestStartedAt);
      setElapsedMs(0);
      setStage('Starting local Codex');
      setEvents([]);

      const controller = new AbortController();
      const timeout = window.setTimeout(() => {
        controller.abort();
      }, GENERATE_REQUEST_TIMEOUT_MS);

      const startLegacyGenerate = async (): Promise<GenerateSuccessResponse> => {
        const response = await fetch(LEGACY_GENERATE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildGenerateRequestBody({ repoPath: trimmedPath, model })),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        return readSuccessBody(response);
      };

      const startAsyncJob = async (): Promise<GenerateSuccessResponse> => {
        appendEvent({
          type: 'client',
          message: `Request sent to ${GENERATE_JOBS_ENDPOINT}`,
          elapsedMs: Date.now() - requestStartedAt,
          at: new Date().toISOString(),
        });

        const response = await fetch(GENERATE_JOBS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildGenerateRequestBody({ repoPath: trimmedPath, model })),
          signal: controller.signal,
        });

        if (!response.ok && shouldTryLegacyGenerate(response)) {
          appendEvent({
            type: 'client',
            message: `Async jobs unavailable; falling back to ${LEGACY_GENERATE_ENDPOINT}`,
            elapsedMs: Date.now() - requestStartedAt,
            at: new Date().toISOString(),
          });
          return startLegacyGenerate();
        }

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        return readSuccessBody(response);
      };

      try {
        const body = await startAsyncJob();
        await watchProgressEvents(body, requestStartedAt);
        appendEvent({
          type: 'status',
          message: 'Map updated from generated data',
          elapsedMs: Date.now() - requestStartedAt,
          at: new Date().toISOString(),
        });
        setStatus('done');
        setStage('Map updated');
        onDone();
      } catch (err) {
        setStatus('error');
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('Generate request timed out locally after 6 minutes. Check the companion server logs.');
          setStage('Timed out');
        } else {
          setError(err instanceof Error ? err.message : String(err));
          setStage('Generate failed');
        }
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [appendEvent, onDone, status, watchProgressEvents]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setStartedAt(null);
    setElapsedMs(0);
    setStage('Ready');
    setEvents([]);
  }, []);

  return {
    status,
    error,
    elapsedMs,
    elapsedLabel: formatElapsedMs(elapsedMs),
    stage,
    events,
    generate,
    reset,
  };
}
