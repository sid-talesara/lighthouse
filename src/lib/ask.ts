import type { LighthouseData } from '../types/lighthouse';
import type { QueryConversationTurn, QueryResult } from '../types/query';
import { CACHED_ANSWERS } from './askCache';

const QUERY_ENDPOINT = '/api/query';

export type AskResult = QueryResult;

interface AskMapOptions {
  allowDemoCache?: boolean;
  repoPath?: string;
  model?: string;
  conversation?: QueryConversationTurn[];
  signal?: AbortSignal;
}

interface QueryErrorResponse {
  error?: string;
  message?: string;
}

function exactDemoAnswer(question: string): QueryResult | null {
  const cached = CACHED_ANSWERS.find((answer) => answer.question === question);
  if (!cached) return null;

  return {
    source: 'demo',
    source_reason: 'Demo chip selected.',
    attempted_codex: false,
    indexing_mode: 'deterministic-map',
    markdown: cached.explanation,
    highlight_ids: cached.highlight_ids,
    evidence: [],
    file_paths: [],
    visual_blocks: [
      {
        type: 'panel',
        title: 'Demo answer',
        items: cached.highlight_ids.map((id) => ({ label: id, nodeId: id })),
      },
    ],
    query_events: [],
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as QueryErrorResponse;
    if (body.error) return body.error;
    if (body.message) return body.message;
  } catch {
    try {
      const text = (await response.text()).replace(/\s+/g, ' ').trim();
      if (text) return text.length <= 240 ? text : `${text.slice(0, 237)}...`;
    } catch {
      // Fall through to the generic response status below.
    }
  }

  return `Local query failed: ${response.status} ${response.statusText}`;
}

export async function askMap(
  question: string,
  data: LighthouseData,
  options: AskMapOptions = {},
): Promise<AskResult> {
  if (options.allowDemoCache) {
    const demo = exactDemoAnswer(question);
    if (demo) return demo;
  }

  const body: {
    question: string;
    data: LighthouseData;
    repoPath?: string;
    model?: string;
    conversation?: QueryConversationTurn[];
  } = { question, data };

  if (options.repoPath?.trim()) body.repoPath = options.repoPath.trim();
  if (options.model?.trim()) body.model = options.model.trim();
  if (options.conversation?.length) body.conversation = options.conversation.slice(-12);

  const response = await fetch(QUERY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as QueryResult;
}
