// Phase 3: Ask-the-Map UI component.
// Floats over the map (bottom-center), shows demo chip suggestions,
// accepts free-text input, and renders the LLM answer card.

import { useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { LighthouseData } from "../types/lighthouse";
import { askMap, type AskResult } from "../lib/ask";
import { DEMO_QUESTIONS } from "../lib/askCache";

interface AskBoxProps {
  data: LighthouseData;
  onAnswer: (ids: Set<string>) => void;
  onClear: () => void;
}

export function AskBox({ data, onAnswer, onClear }: AskBoxProps) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasKey = Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY);

  const submit = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;

      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const ans = await askMap(trimmed, data);
        setResult(ans);
        onAnswer(new Set(ans.highlight_ids));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [data, onAnswer]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(question);
  };

  const handleChip = (q: string) => {
    setQuestion(q);
    void submit(q);
  };

  const handleClear = () => {
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
          placeholder={
            hasKey
              ? "Ask it anything — it reads the whole map…"
              : "Ask a demo question (or add VITE_ANTHROPIC_API_KEY for live answers)…"
          }
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
                result.source === "cache"
                  ? 'bg-ph-surface-soft text-ph-body'
                  : 'bg-ph-green-soft text-ph-green',
              ].join(' ')}
            >
              {result.source === "cache" ? "Demo answer" : "Live answer"}
            </span>
            <span className="ml-auto font-mono text-code text-ph-ash">
              {result.highlight_ids.length} node
              {result.highlight_ids.length !== 1 ? "s" : ""} highlighted
            </span>
          </div>

          {/* Explanation */}
          <div className="font-body text-body-sm leading-relaxed text-ph-body [&_strong]:font-semibold [&_strong]:text-ph-ink">
            <ReactMarkdown>{result.explanation}</ReactMarkdown>
          </div>

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
