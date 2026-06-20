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
  const { status, error, generate, reset } = useGenerate(onDone);

  const isRunning = status === 'running';
  const canGenerate = repoPath.trim().length > 0 && !isRunning;
  const selectedModelLabel =
    GENERATE_MODEL_OPTIONS.find((option) => option.value === model)?.label ?? 'GPT-5.5';

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
              <span className="text-beacon-300/90">
                Running Codex with {selectedModelLabel} at medium reasoning. Server timeout and
                errors will appear here.
              </span>
            )}
            {status === 'done' && (
              <span className="text-tide-300">Map updated from generated data.</span>
            )}
            {status === 'error' && error && <span className="text-red-300">{error}</span>}
            {status === 'idle' && (
              <span className="text-slate2-400/70">
                Runs local Codex through the companion at /api/generate.
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
