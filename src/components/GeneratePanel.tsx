import { useState } from 'react';

import { useGenerate } from '../hooks/useGenerate';
import {
  DEFAULT_GENERATE_MODEL,
  GENERATE_MODEL_OPTIONS,
  type GenerateModel,
} from '../lib/generateOptions';

interface GeneratePanelProps {
  onDone: () => void;
}

export function GeneratePanel({ onDone }: GeneratePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [model, setModel] = useState<GenerateModel>(DEFAULT_GENERATE_MODEL);
  const { status, error, elapsedLabel, stage, events, generate, reset } = useGenerate(onDone);

  const isRunning = status === 'running';
  const canGenerate = repoPath.trim().length > 0 && !isRunning;
  const selectedModelLabel =
    GENERATE_MODEL_OPTIONS.find((option) => option.value === model)?.label ?? 'GPT-5.5';
  const visibleEvents = events.slice(-8).reverse();

  const handleToggle = () => {
    setIsOpen((open) => !open);
    if (!isOpen && status !== 'running') reset();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canGenerate) void generate({ repoPath, model });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className={[
          'flex h-7 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[11px] transition-colors',
          status === 'done'
            ? 'border-tide-500/30 bg-tide-500/10 text-tide-300 hover:bg-tide-500/15'
            : 'border-beacon-500/30 bg-beacon-500/10 text-beacon-300 hover:bg-beacon-500/20',
        ].join(' ')}
        aria-expanded={isOpen}
      >
        {isRunning && (
          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-beacon-400/80 border-t-transparent" />
        )}
        <span>{isRunning ? 'Running' : status === 'done' ? 'Updated' : 'Generate'}</span>
      </button>

      {isOpen && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-0 top-9 z-30 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-slate2-400/16 bg-abyss-800/95 p-3 shadow-[0_12px_34px_rgba(0,0,0,0.45)] backdrop-blur-md"
        >
          <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-slate2-400/70">
            Repository path
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={repoPath}
              onChange={(event) => {
                setRepoPath(event.target.value);
                if (status !== 'running') reset();
              }}
              placeholder="/path/to/repo"
              disabled={isRunning}
              className="h-8 min-w-0 flex-1 rounded-md border border-slate2-400/20 bg-abyss-700/70 px-2 font-mono text-[12px] text-slate2-100 placeholder:text-slate2-400/50 focus:outline-none focus:ring-1 focus:ring-tide-500/60 disabled:cursor-wait disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!canGenerate}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-beacon-500/30 bg-beacon-500/10 px-3 font-mono text-[11px] text-beacon-300 transition-colors hover:bg-beacon-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isRunning && (
                <span className="h-2.5 w-2.5 animate-spin rounded-full border border-beacon-400/80 border-t-transparent" />
              )}
              {isRunning ? 'Scanning' : 'Run'}
            </button>
          </div>

          <div className="mt-3">
            <label className="block">
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-slate2-400/70">
                Codex model
              </span>
              <select
                value={model}
                onChange={(event) => {
                  setModel(event.target.value as GenerateModel);
                  if (status !== 'running') reset();
                }}
                disabled={isRunning}
                className="mt-2 h-8 w-full rounded-md border border-slate2-400/20 bg-abyss-700/70 px-2 font-mono text-[12px] text-slate2-100 focus:outline-none focus:ring-1 focus:ring-tide-500/60 disabled:cursor-wait disabled:opacity-60"
              >
                {GENERATE_MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-2 min-h-4 font-mono text-[11px] leading-snug">
            {status === 'running' && (
              <div className="rounded-md border border-ph-border bg-ph-surface-soft/70 p-2 text-ph-body shadow-none dark:border-ph-border-dark dark:bg-ph-surface-dark-soft/80 dark:text-ph-body-dark">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[11px] text-ph-ink dark:text-ph-ink-dark">
                    {stage}
                  </span>
                  <span className="shrink-0 text-[11px] text-ph-mute dark:text-ph-mute-dark">
                    {elapsedLabel}
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-ph-pill bg-ph-border-soft dark:bg-ph-border-dark">
                  <div className="h-full w-2/5 animate-pulse rounded-ph-pill bg-ph-yellow dark:bg-ph-yellow-dark" />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-ph-mute dark:text-ph-mute-dark">
                  <span>Codex</span>
                  <span>{selectedModelLabel}</span>
                </div>
                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1 lh-scroll">
                  {visibleEvents.length > 0 ? (
                    visibleEvents.map((event) => (
                      <div
                        key={event.id}
                        className={[
                          'rounded-ph-sm border px-2 py-1',
                          event.type === 'stderr'
                            ? 'border-ph-red/30 bg-ph-red-soft/70 text-ph-red'
                            : 'border-ph-border-soft bg-ph-surface/80 text-ph-body dark:border-ph-border-dark dark:bg-ph-surface-dark dark:text-ph-body-dark',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 break-words">
                            {event.codexType ? `${event.codexType}: ` : ''}
                            {event.message}
                          </span>
                          <span className="shrink-0 text-ph-ash">
                            {Math.floor(event.elapsedMs / 1000)}s
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-ph-sm border border-ph-border-soft bg-ph-surface/80 px-2 py-1 text-ph-mute dark:border-ph-border-dark dark:bg-ph-surface-dark dark:text-ph-mute-dark">
                      Waiting for Codex events.
                    </div>
                  )}
                </div>
              </div>
            )}
            {status === 'done' && (
              <span className="text-tide-300">Map updated from generated data.</span>
            )}
            {status === 'error' && error && <span className="text-red-300">{error}</span>}
            {status === 'idle' && (
              <span className="text-slate2-400/70">
                Runs local Codex through the companion job endpoint.
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
