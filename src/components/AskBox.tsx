// Ask-the-Map UI — conversational panel.
//
// This is now a CHAT THREAD against the map, not a one-shot search:
//   • Each question + its answer stack as turns (user bubble + answer card).
//   • The input is pinned at the bottom; history scrolls above it.
//   • Keeps the existing cache-first / live (local Codex) logic in `askMap`.
//   • Every answer still drives the global highlight set via `onAnswer`
//     (highlight-on-answer), and "Clear" wipes the thread + highlights.
//
// Layout: this component fills its container (it is rendered inside a
// right-docked, resizable panel in App.tsx). It owns no docking chrome.

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { LighthouseData } from "../types/lighthouse";
import { askMap, type AskResult } from "../lib/ask";
import type { GenerateModel } from "../lib/generateOptions";
import type { QuerySource, QueryVisualBlock } from "../types/query";

interface AskBoxProps {
  data: LighthouseData;
  repoPath?: string;
  model?: GenerateModel;
  /** Push the highlight set for the latest answer (highlight-on-answer). */
  onAnswer: (ids: Set<string>) => void;
  /** Clear the global highlight set (called on "Clear conversation"). */
  onClear: () => void;
}

/** A single completed conversation turn. */
interface Turn {
  id: string;
  question: string;
  result: AskResult;
}

export function AskBox({ data, repoPath, model, onAnswer, onClear }: AskBoxProps) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The question currently in-flight (shown as an optimistic user bubble).
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the thread to the newest turn / pending bubble.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, pendingQuestion, loading, error]);

  const submit = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;

      setLoading(true);
      setError(null);
      setPendingQuestion(trimmed);
      setQuestion("");
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const ans = await askMap(trimmed, data, {
          // Conversational free-text: let the cache answer demo questions when
          // they match, otherwise fall through to live local Codex.
          allowDemoCache: true,
          repoPath,
          model,
          signal: controller.signal,
        });
        setTurns((prev) => [
          ...prev,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, question: trimmed, result: ans },
        ]);
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
        setPendingQuestion(null);
      }
    },
    [data, model, onAnswer, repoPath]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(question);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const handleClear = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setQuestion("");
    setTurns([]);
    setError(null);
    setPendingQuestion(null);
    setLoading(false);
    onClear();
    inputRef.current?.focus();
  };

  const isEmpty = turns.length === 0 && !pendingQuestion && !error;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-ph-border px-4 py-3">
        <span className="text-base" aria-hidden>
          💬
        </span>
        <span className="font-display text-heading-sm font-bold text-ph-ink">
          Ask the map
        </span>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-auto rounded-ph-sm px-2 py-0.5 font-sans text-label text-ph-ash transition-colors hover:text-ph-ink"
            title="Clear conversation"
          >
            Clear
          </button>
        )}
      </div>

      {/* Scrollable conversation history */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {isEmpty && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="text-2xl" aria-hidden>
              🔍
            </span>
            <p className="font-body text-body-sm text-ph-mute">
              Ask anything about{" "}
              <span className="font-mono text-code text-ph-ink">{data.repo.name}</span>.
            </p>
            <p className="font-body text-label text-ph-ash">
              Answers light up the matching nodes on the map.
            </p>
          </div>
        )}

        {turns.map((turn) => (
          <div key={turn.id} className="space-y-2.5">
            <UserBubble text={turn.question} />
            <AnswerCard result={turn.result} />
          </div>
        ))}

        {/* Optimistic pending turn */}
        {pendingQuestion && (
          <div className="space-y-2.5">
            <UserBubble text={pendingQuestion} />
            {loading && (
              <div className="flex items-center gap-2 rounded-ph border border-ph-border bg-ph-surface px-4 py-3">
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ph-border border-t-ph-yellow" />
                <span className="font-body text-body-sm text-ph-mute">
                  Searching the map…
                </span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-ph border border-ph-red bg-ph-red-soft px-4 py-3 font-body text-body-sm text-ph-red">
            {error}
          </div>
        )}
      </div>

      {/* Input pinned at the bottom */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-ph-border bg-ph-surface p-3"
      >
        <div className="flex items-center gap-2 rounded-ph border border-ph-border bg-ph-canvas px-3 py-1.5 transition-shadow duration-100 focus-within:border-ph-blue focus-within:shadow-ph-focus">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask the local map anything..."
            disabled={loading}
            className="min-w-0 flex-1 bg-transparent font-body text-sm text-ph-ink placeholder:text-ph-ash focus:outline-none disabled:opacity-50"
          />
          {loading ? (
            <button
              type="button"
              onClick={handleStop}
              className="shrink-0 rounded-ph border border-ph-red/30 bg-ph-red-soft px-3 py-1.5 font-sans text-sm font-bold text-ph-red transition-colors hover:bg-ph-red/15"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!question.trim()}
              className="shrink-0 rounded-ph border border-ph-yellow-pressed bg-ph-yellow px-3.5 py-1.5 font-sans text-sm font-bold text-ph-ink transition-colors duration-75 hover:bg-ph-yellow-pressed active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ask
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] rounded-ph rounded-tr-sm border border-ph-yellow-pressed bg-ph-yellow px-3.5 py-2 font-body text-body-sm text-ph-ink">
        {text}
      </div>
    </div>
  );
}

function AnswerCard({ result }: { result: AskResult }) {
  return (
    <div className="rounded-ph rounded-tl-sm border border-ph-border bg-ph-surface px-4 py-3.5">
      {/* Source badge */}
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className={[
            "rounded-ph-pill px-2.5 py-0.5 font-sans text-label uppercase tracking-wider",
            sourceBadgeClass(result.source),
          ].join(" ")}
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
          Indexing mode:{" "}
          {result.indexing_mode === "local-codex-with-map-evidence"
            ? "deterministic map evidence + local Codex"
            : result.indexing_mode === "local-codex-direct"
              ? "local Codex direct repo search"
              : "deterministic map evidence"}
        </div>
      </div>

      {result.visual_blocks.length > 0 && (
        <div className="mt-3 grid gap-2">
          {result.visual_blocks.slice(0, 2).map((block, index) => (
            <VisualBlockView key={`${block.type}-${block.title}-${index}`} block={block} />
          ))}
        </div>
      )}

      {result.query_events.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 font-sans text-label uppercase tracking-wider text-ph-ash">
            Codex activity
          </div>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-ph-sm border border-ph-border bg-ph-canvas p-2">
            {result.query_events.slice(-6).map((event, index) => (
              <div
                key={`${event.elapsedMs}-${event.message}-${index}`}
                className="flex gap-2 font-mono text-code text-ph-body"
              >
                <span className="shrink-0 text-ph-ash">
                  {Math.floor(event.elapsedMs / 1000)}s
                </span>
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

      {/* Highlighted ids list */}
      {result.highlight_ids.length > 0 && (
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
  if (block.type === "change_review") {
    const before = block.items.find((item) => item.label.toLowerCase() === "before");
    const after = block.items.find((item) => item.label.toLowerCase() === "after");
    const rest = block.items.filter((item) => !["before", "after"].includes(item.label.toLowerCase()));

    return (
      <div className="rounded-ph-sm border border-ph-border bg-ph-canvas px-3 py-2">
        <div className="mb-2 font-sans text-label uppercase tracking-wider text-ph-ash">
          {block.title}
        </div>
        <div className="grid gap-2">
          {(before || after) && (
            <div className="grid grid-cols-2 gap-2">
              {before && (
                <div className="rounded-ph-sm border border-ph-border bg-ph-surface px-2 py-1.5">
                  <div className="mb-1 font-sans text-[11px] font-bold uppercase tracking-wider text-ph-mute">
                    Before
                  </div>
                  <div className="font-body text-label leading-snug text-ph-body">
                    {before.value ?? before.path ?? before.nodeId ?? ''}
                  </div>
                </div>
              )}
              {after && (
                <div className="rounded-ph-sm border border-ph-green/25 bg-ph-green-soft px-2 py-1.5">
                  <div className="mb-1 font-sans text-[11px] font-bold uppercase tracking-wider text-ph-green">
                    After
                  </div>
                  <div className="font-body text-label leading-snug text-ph-body">
                    {after.value ?? after.path ?? after.nodeId ?? ''}
                  </div>
                </div>
              )}
            </div>
          )}
          {rest.slice(0, 5).map((item, index) => (
            <div key={`${item.label}-${index}`} className="rounded-ph-sm border border-ph-border bg-ph-surface px-2 py-1.5">
              <div className="mb-1 font-sans text-[11px] font-bold uppercase tracking-wider text-ph-mute">
                {item.label}
              </div>
              <div className="font-body text-label leading-snug text-ph-body">
                {item.value ?? item.path ?? item.nodeId ?? ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

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
