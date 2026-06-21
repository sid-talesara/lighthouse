/**
 * HomeGenerateFlow — inline "Generate for another repo" flow on the home screen.
 *
 * Consumes the OnboardingGenerateContract props passed down from App.tsx
 * (via Onboarding) — no internal useGenerate call; all state is lifted.
 *
 * When generateStatus === 'done', the parent (Onboarding) should call onEnter.
 */

import { useState, useEffect } from 'react';
import type { GenerateModel } from '../lib/generateOptions';
import type { GenerateStatus, GenerateEventLogEntry } from '../hooks/useGenerate';
import type { GenerateModelOption } from '../lib/generateOptions';

interface HomeGenerateFlowProps {
  onGenerateRepo: (repoPath: string, model: GenerateModel) => void;
  generateStatus: GenerateStatus;
  generateStage: string;
  generateElapsedLabel: string;
  generateError: string | null;
  generateEvents: GenerateEventLogEntry[];
  onCancelGenerate: () => void;
  models: GenerateModelOption[];
  defaultRepoPath: string;
  defaultModel: GenerateModel;
  /** Called when generation completes so parent can enter the app. */
  onEnter: () => void;
}

export function HomeGenerateFlow({
  onGenerateRepo,
  generateStatus,
  generateStage,
  generateElapsedLabel,
  generateError,
  generateEvents,
  onCancelGenerate,
  models,
  defaultRepoPath,
  defaultModel,
  onEnter,
}: HomeGenerateFlowProps) {
  const [repoPath, setRepoPath] = useState(defaultRepoPath);
  const [model, setModel] = useState<GenerateModel>(defaultModel);

  const isRunning = generateStatus === 'running';
  const isDone = generateStatus === 'done';
  const isError = generateStatus === 'error';
  const isCancelled = generateStatus === 'cancelled';
  const canGenerate = repoPath.trim().length > 0 && !isRunning;

  // When done, auto-enter after a short flash so user sees the success state.
  useEffect(() => {
    if (!isDone) return;
    const timer = setTimeout(() => {
      onEnter();
    }, 1200);
    return () => clearTimeout(timer);
  }, [isDone, onEnter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canGenerate) return;
    onGenerateRepo(repoPath.trim(), model);
  };

  const visibleEvents = generateEvents.slice(-10).reverse();

  return (
    <div
      className="w-full rounded-ph border border-ph-border bg-ph-surface"
      style={{ padding: '24px 28px' }}
    >
      {/* Section header */}
      <div className="mb-4 flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-ph-sm border border-ph-border bg-ph-canvas"
          style={{ flexShrink: 0 }}
        >
          <CodexGlyph />
        </div>
        <span
          className="font-mono font-semibold uppercase tracking-widest text-ph-ash"
          style={{ fontSize: '0.6875rem', letterSpacing: '0.1em' }}
        >
          Generate for another repo
        </span>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Repo path input */}
        <div>
          <label
            htmlFor="home-generate-repo-path"
            className="mb-1.5 block font-mono text-ph-mute"
            style={{ fontSize: '0.6875rem' }}
          >
            Repository path
          </label>
          <input
            id="home-generate-repo-path"
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="/absolute/path/to/repo"
            disabled={isRunning}
            className="h-10 w-full rounded-ph border border-ph-border bg-ph-canvas px-3 font-mono text-ph-ink placeholder:text-ph-stone focus:border-ph-ash focus:outline-none disabled:cursor-wait disabled:opacity-60"
            style={{ fontSize: '0.8125rem' }}
          />
        </div>

        {/* Model selector + submit row */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label
              htmlFor="home-generate-model"
              className="mb-1.5 block font-mono text-ph-mute"
              style={{ fontSize: '0.6875rem' }}
            >
              Model
            </label>
            <select
              id="home-generate-model"
              value={model}
              onChange={(e) => setModel(e.target.value as GenerateModel)}
              disabled={isRunning}
              className="h-10 w-full rounded-ph border border-ph-border bg-ph-canvas px-3 font-mono text-ph-ink focus:border-ph-ash focus:outline-none disabled:cursor-wait disabled:opacity-60"
              style={{ fontSize: '0.8125rem' }}
            >
              {models.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Generate / Cancel */}
          {isRunning ? (
            <button
              type="button"
              onClick={onCancelGenerate}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-ph border border-ph-border bg-ph-surface px-4 font-sans font-semibold text-ph-body transition-colors duration-75 hover:border-ph-border-dark hover:text-ph-ink active:translate-y-px"
              style={{ fontSize: '0.8125rem' }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full border border-ph-ash border-t-transparent animate-spin"
                aria-hidden
              />
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canGenerate}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-ph border border-ph-yellow-pressed bg-ph-yellow px-5 font-sans font-bold text-ph-ink transition-colors duration-75 hover:bg-ph-yellow-pressed active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontSize: '0.875rem' }}
            >
              {isDone ? 'Entering…' : 'Generate →'}
            </button>
          )}
        </div>
      </form>

      {/* Progress block — shown while running */}
      {isRunning && (
        <div
          className="mt-4 rounded-ph border border-ph-border bg-ph-canvas"
          style={{ padding: '12px 14px' }}
        >
          {/* Stage + elapsed */}
          <div className="mb-2 flex items-center justify-between gap-3">
            <span
              className="min-w-0 truncate font-sans font-semibold text-ph-ink"
              style={{ fontSize: '0.8125rem' }}
            >
              {generateStage}
            </span>
            <span
              className="shrink-0 font-mono text-ph-ash"
              style={{ fontSize: '0.75rem' }}
            >
              {generateElapsedLabel}
            </span>
          </div>

          {/* Indeterminate progress bar */}
          <div className="mb-3 h-1.5 overflow-hidden rounded-ph-pill bg-ph-border-soft">
            <div className="h-full w-2/5 animate-pulse rounded-ph-pill bg-ph-yellow" />
          </div>

          {/* Event log */}
          <div className="max-h-36 space-y-1 overflow-y-auto lh-scroll">
            {visibleEvents.length > 0 ? (
              visibleEvents.map((event) => (
                <div
                  key={event.id}
                  className={[
                    'rounded-ph-sm border px-2 py-1 font-mono',
                    event.type === 'stderr'
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-ph-border-soft bg-ph-surface text-ph-body',
                  ].join(' ')}
                  style={{ fontSize: '0.6875rem' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words">{event.message}</span>
                    <span className="shrink-0 text-ph-ash">
                      {Math.floor(event.elapsedMs / 1000)}s
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div
                className="rounded-ph-sm border border-ph-border-soft bg-ph-surface px-2 py-1 font-mono text-ph-mute"
                style={{ fontSize: '0.6875rem' }}
              >
                Waiting for Codex events…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Done state */}
      {isDone && (
        <div
          className="mt-4 flex items-center gap-2 rounded-ph border border-ph-border bg-ph-canvas px-4 py-3"
        >
          <span className="text-ph-green font-bold" style={{ fontSize: '1rem' }}>✓</span>
          <span className="font-sans font-semibold text-ph-ink" style={{ fontSize: '0.875rem' }}>
            Map generated — entering the app…
          </span>
        </div>
      )}

      {/* Error state */}
      {isError && generateError && (
        <div
          className="mt-4 rounded-ph border border-red-200 bg-red-50 px-4 py-3"
        >
          <p
            className="font-sans font-semibold text-red-700"
            style={{ fontSize: '0.8125rem', lineHeight: '1.5' }}
          >
            {generateError}
          </p>
        </div>
      )}

      {/* Cancelled */}
      {isCancelled && (
        <div
          className="mt-4 rounded-ph border border-ph-border bg-ph-canvas px-4 py-2.5"
        >
          <span
            className="font-mono text-ph-mute"
            style={{ fontSize: '0.75rem' }}
          >
            Generation cancelled.
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Glyphs ─────────────────────────────────────────────────────────────── */

function CodexGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 text-ph-yellow"
      aria-hidden
    >
      <path d="M3 4h10M3 8h6M3 12h8" />
      <circle cx="12" cy="11" r="2.5" fill="none" />
      <path d="M14 13.5 L15.5 15" />
    </svg>
  );
}
