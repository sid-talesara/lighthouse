import { useState } from 'react';

import { useGenerate } from '../hooks/useGenerate';

interface GeneratePanelProps {
  onDone: () => void;
}

export function GeneratePanel({ onDone }: GeneratePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const { status, error, generate, reset } = useGenerate(onDone);

  const isRunning = status === 'running';
  const canGenerate = repoPath.trim().length > 0 && !isRunning;

  const handleToggle = () => {
    setIsOpen((open) => !open);
    if (!isOpen && status !== 'running') reset();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canGenerate) void generate(repoPath);
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
          className="absolute right-0 top-9 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-slate2-400/16 bg-abyss-800/95 p-3 shadow-[0_12px_34px_rgba(0,0,0,0.45)] backdrop-blur-md"
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

          <div className="mt-2 min-h-4 font-mono text-[11px] leading-snug">
            {status === 'running' && (
              <span className="text-beacon-300/90">Generating data.json...</span>
            )}
            {status === 'done' && (
              <span className="text-tide-300">Map updated from generated data.</span>
            )}
            {status === 'error' && error && <span className="text-red-300">{error}</span>}
            {status === 'idle' && (
              <span className="text-slate2-400/70">Runs the local companion at /api/generate.</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
