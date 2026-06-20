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
    <div className="pointer-events-auto flex w-full max-w-[540px] flex-col gap-2">
      {/* Chip suggestions */}
      {!result && !loading && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {DEMO_QUESTIONS.map((dq) => (
            <button
              key={dq}
              onClick={() => handleChip(dq)}
              className="rounded-full border border-beacon-500/30 bg-abyss-800/80 px-3 py-1 font-mono text-[11px] text-beacon-300/90 backdrop-blur-md transition-colors hover:border-beacon-400/60 hover:bg-beacon-500/10 hover:text-beacon-200"
            >
              {dq}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-2xl border border-slate2-400/20 bg-abyss-800/80 px-4 py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-md"
      >
        {/* Beacon icon */}
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-beacon-500/10" />
          <span className="h-2 w-2 rounded-full bg-beacon-400 shadow-[0_0_8px_2px_rgba(242,185,104,0.5)]" />
        </span>

        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            hasKey
              ? "Ask anything about this codebase…"
              : "Ask a demo question or add VITE_ANTHROPIC_API_KEY for live answers…"
          }
          disabled={loading}
          className="min-w-0 flex-1 bg-transparent font-sans text-[14px] text-slate2-100 placeholder:text-slate2-400/60 focus:outline-none disabled:opacity-50"
        />

        {loading && (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-beacon-500/30 border-t-beacon-400" />
        )}

        {result && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] text-slate2-400 transition-colors hover:text-slate2-200"
            title="Clear"
          >
            ✕
          </button>
        )}

        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="shrink-0 rounded-xl bg-beacon-500/15 px-3 py-1 font-mono text-[12px] text-beacon-300 transition-colors hover:bg-beacon-500/25 hover:text-beacon-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ask
        </button>
      </form>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 font-sans text-[13px] text-red-300/90 backdrop-blur-md">
          {error}
        </div>
      )}

      {/* Answer card */}
      {result && !error && (
        <div className="rounded-2xl border border-beacon-500/20 bg-abyss-800/90 px-5 py-4 shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-md">
          {/* Source badge */}
          <div className="mb-2.5 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-beacon-400 shadow-[0_0_6px_2px_rgba(242,185,104,0.5)]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-beacon-400/70">
              {result.source === "cache" ? "Demo answer" : "Live answer"}
            </span>
            <span className="ml-auto font-mono text-[10px] text-slate2-400/50">
              {result.highlight_ids.length} node
              {result.highlight_ids.length !== 1 ? "s" : ""} highlighted
            </span>
          </div>

          {/* Explanation */}
          <div className="text-[13.5px] leading-relaxed text-slate2-200 [&_strong]:font-semibold [&_strong]:text-slate2-100">
            <ReactMarkdown>{result.explanation}</ReactMarkdown>
          </div>

          {/* Highlighted ids list */}
          <div className="mt-3 flex flex-wrap gap-1">
            {result.highlight_ids.map((id) => (
              <span
                key={id}
                className="rounded-full border border-beacon-500/20 bg-beacon-500/10 px-2 py-0.5 font-mono text-[10px] text-beacon-300/80"
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
