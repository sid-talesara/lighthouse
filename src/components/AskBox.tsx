// Phase 3: Ask-the-Map UI component.
// Floats over the map (bottom-center), shows demo chip suggestions,
// accepts free-text input, and renders the LLM answer card.

import { useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { LighthouseData } from "../types/lighthouse";
import { askMap, type AskResult } from "../lib/ask";
import { DEMO_QUESTIONS } from "../lib/askCache";
import type { GenerateModel } from "../lib/generateOptions";
import type { QuerySource, QueryVisualBlock } from "../types/query";

interface AskBoxProps {
  data: LighthouseData;
  repoPath?: string;
  model?: GenerateModel;
  onAnswer: (ids: Set<string>) => void;
  onClear: () => void;
}

export function AskBox({ data, repoPath, model, onAnswer, onClear }: AskBoxProps) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const submit = useCallback(
    async (q: string, allowDemoCache = false) => {
      const trimmed = q.trim();
      if (!trimmed) return;

      setLoading(true);
      setError(null);
      setResult(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const ans = await askMap(trimmed, data, {
          allowDemoCache,
          repoPath,
          model,
          signal: controller.signal,
        });
        setResult(ans);
        onAnswer(new Set(ans.highlight_ids));
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setError("Query stopped.");
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setLoading(false);
      }
    },
    [data, model, onAnswer, repoPath]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(question);
  };

  const handleChip = (q: string) => {
    setQuestion(q);
    void submit(q, true);
  };

  const handleClear = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setQuestion("");
    setResult(null);
    setError(null);
    onClear();
    inputRef.current?.focus();
  };

  return (
    <div className="pointer-events-auto relative flex w-full flex-col gap-2">
      {/* Input row */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-ph border border-ph-border bg-ph-canvas px-3 py-1.5 transition-shadow duration-100 focus-within:border-ph-blue focus-within:shadow-ph-focus"
      >
        <span className="shrink-0 text-base" aria-hidden>
          🔍
        </span>

        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask the local map anything..."
          disabled={loading}
          className="min-w-0 flex-1 bg-transparent font-body text-sm text-ph-ink placeholder:text-ph-ash focus:outline-none disabled:opacity-50"
        />

        {loading && (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ph-border border-t-ph-yellow" />
        )}

        {result && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded-ph-sm px-1.5 py-0.5 font-sans text-label text-ph-ash transition-colors hover:text-ph-ink"
            title="Clear"
          >
            ✕
          </button>
        )}

        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="shrink-0 rounded-ph border border-ph-yellow-pressed bg-ph-yellow px-3.5 py-1.5 font-sans text-sm font-bold text-ph-ink transition-colors duration-75 hover:bg-ph-yellow-pressed active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ask
        </button>
        {loading && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded-ph border border-ph-red/30 bg-ph-red-soft px-3 py-1.5 font-sans text-sm font-bold text-ph-red transition-colors hover:bg-ph-red/15"
          >
            Stop
          </button>
        )}
      </form>

      {/* Chip suggestions */}
      {!result && !loading && (
        <div className="flex flex-wrap gap-1.5">
          {DEMO_QUESTIONS.map((dq) => (
            <button
              key={dq}
              onClick={() => handleChip(dq)}
              className="rounded-ph-pill border border-ph-border bg-ph-surface px-3 py-1 font-sans text-label text-ph-mute transition-colors hover:border-ph-yellow hover:text-ph-ink"
            >
              {dq}
            </button>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-ph border border-ph-red bg-ph-red-soft px-4 py-3 font-body text-body-sm text-ph-red">
          {error}
        </div>
      )}

      {/* Answer card — floats below the input over content */}
      {result && !error && (
        <div className="absolute right-0 top-full z-30 mt-2 w-full max-w-[540px] rounded-ph border border-ph-border bg-ph-surface px-5 py-4 shadow-ph-float">
          {/* Source badge */}
          <div className="mb-2.5 flex items-center gap-2">
            <span
              className={[
                'rounded-ph-pill px-2.5 py-0.5 font-sans text-label uppercase tracking-wider',
                sourceBadgeClass(result.source),
              ].join(' ')}
            >
              {sourceLabel(result.source)}
            </span>
            {result.repo_path_status === "invalid" && (
              <span className="font-sans text-label text-ph-ash">repo path ignored</span>
            )}
            <span className="ml-auto font-mono text-code text-ph-ash">
              {result.highlight_ids.length} node
              {result.highlight_ids.length !== 1 ? "s" : ""} highlighted
            </span>
          </div>

          {/* Explanation */}
          <div className="font-body text-body-sm leading-relaxed text-ph-body [&_strong]:font-semibold [&_strong]:text-ph-ink">
            <ReactMarkdown>{result.markdown}</ReactMarkdown>
          </div>

          <div className="mt-2 rounded-ph-sm border border-ph-border bg-ph-canvas px-3 py-2 font-body text-label leading-snug text-ph-mute">
            <div>{result.source_reason}</div>
            <div>
              Indexing mode: {result.indexing_mode === "local-codex-with-map-evidence"
                ? "deterministic map evidence + local Codex"
                : result.indexing_mode === "local-codex-direct"
                  ? "local Codex direct repo search"
                : "deterministic map evidence"}
            </div>
          </div>

          {result.query_events.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 font-sans text-label uppercase tracking-wider text-ph-ash">
                Codex activity
              </div>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-ph-sm border border-ph-border bg-ph-canvas p-2">
                {result.query_events.slice(-6).map((event, index) => (
                  <div key={`${event.elapsedMs}-${event.message}-${index}`} className="flex gap-2 font-mono text-code text-ph-body">
                    <span className="shrink-0 text-ph-ash">{Math.floor(event.elapsedMs / 1000)}s</span>
                    <span className="min-w-0 break-words">{event.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.file_paths.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 font-sans text-label uppercase tracking-wider text-ph-ash">
                Evidence files
              </div>
              <div className="flex flex-wrap gap-1">
                {result.file_paths.slice(0, 8).map((path) => (
                  <span
                    key={path}
                    className="max-w-full truncate rounded-ph-sm border border-ph-border bg-ph-canvas px-2 py-0.5 font-mono text-code text-ph-body"
                    title={path}
                  >
                    {path}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.visual_blocks.length > 0 && (
            <div className="mt-3 grid gap-2">
              {result.visual_blocks.slice(0, 2).map((block, index) => (
                <VisualBlockView key={`${block.type}-${block.title}-${index}`} block={block} />
              ))}
            </div>
          )}

          {/* Highlighted ids list */}
          <div className="mt-3 flex flex-wrap gap-1">
            {result.highlight_ids.map((id) => (
              <span
                key={id}
                className="rounded-ph-pill border border-ph-blue-soft bg-ph-blue-soft px-2 py-0.5 font-mono text-code text-ph-blue-teal"
              >
                {id}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function sourceLabel(source: QuerySource): string {
  if (source === "local-codex") return "Local Codex";
  if (source === "local-index") return "Local Index";
  if (source === "no-match") return "No Match";
  return "Demo";
}

function sourceBadgeClass(source: QuerySource): string {
  if (source === "local-codex") return "bg-ph-green-soft text-ph-green";
  if (source === "local-index") return "bg-ph-blue-soft text-ph-blue-teal";
  if (source === "no-match") return "bg-ph-red-soft text-ph-red";
  return "bg-ph-surface-soft text-ph-body";
}

function VisualBlockView({ block }: { block: QueryVisualBlock }) {
  if (block.type === "diagram") {
    return (
      <div className="rounded-ph-sm border border-ph-border bg-ph-canvas px-3 py-2">
        <div className="mb-1 flex items-center gap-2 font-sans text-label uppercase tracking-wider text-ph-ash">
          <span>{block.title}</span>
          {block.format && <span className="text-ph-mute">{block.format}</span>}
        </div>
        {block.source ? (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-ph-sm border border-ph-border bg-ph-surface px-2 py-2 font-mono text-code leading-snug text-ph-body">
            {block.source}
          </pre>
        ) : (
          <div className="font-body text-label text-ph-mute">No diagram source returned.</div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-ph-sm border border-ph-border bg-ph-canvas px-3 py-2">
      <div className="mb-1 font-sans text-label uppercase tracking-wider text-ph-ash">
        {block.title}
      </div>
      <div className="grid gap-1">
        {block.items.length === 0 && (
          <div className="font-body text-label text-ph-mute">No file paths in top evidence.</div>
        )}
        {block.items.slice(0, 5).map((item, index) => (
          <div key={`${item.label}-${index}`} className="min-w-0">
            <div className="truncate font-mono text-code text-ph-ink" title={item.path ?? item.nodeId ?? item.label}>
              {item.label}
            </div>
            {item.value && (
              <div className="line-clamp-2 font-body text-label leading-snug text-ph-mute">
                {item.value}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
