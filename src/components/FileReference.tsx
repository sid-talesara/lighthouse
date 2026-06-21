import { useEffect } from 'react';

import { CodeViewer } from './CodeViewer';

interface FileReferenceChipProps {
  path: string;
  onOpen: (path: string) => void;
  compact?: boolean;
}

interface FileReferenceListProps {
  paths: string[];
  onOpen: (path: string) => void;
  limit?: number;
  compact?: boolean;
}

interface FileViewerModalProps {
  path: string;
  onClose: () => void;
}

function shortFileLabel(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 2) return path;
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

export function FileReferenceChip({ path, onOpen, compact = false }: FileReferenceChipProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(path)}
      title={path}
      className={[
        'inline-flex max-w-full items-center gap-1 rounded-ph-sm border border-ph-border bg-ph-canvas text-left font-mono text-ph-body transition-colors hover:border-ph-yellow hover:bg-ph-yellow/10 hover:text-ph-ink',
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-code',
      ].join(' ')}
    >
      <span aria-hidden className="text-ph-ash">⌘</span>
      <span className="min-w-0 truncate">{shortFileLabel(path)}</span>
    </button>
  );
}

export function FileReferenceList({ paths, onOpen, limit = 8, compact = false }: FileReferenceListProps) {
  const shown = paths.slice(0, limit);
  const remaining = paths.length - shown.length;

  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((path) => (
        <FileReferenceChip key={path} path={path} onOpen={onOpen} compact={compact} />
      ))}
      {remaining > 0 && (
        <span className="rounded-ph-sm border border-ph-border bg-ph-canvas px-2 py-0.5 font-mono text-[10px] text-ph-ash">
          +{remaining} more
        </span>
      )}
    </div>
  );
}

export function FileViewerModal({ path, onClose }: FileViewerModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Source of ${path}`}
      onClick={onClose}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-8"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[88vh] w-[min(1040px,100%)] flex-col"
      >
        <div className="flex items-center gap-2 rounded-t-ph border border-[#3A3C32] border-b-0 bg-[#1A1C14] px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-code text-[#C4C5BC]" title={path}>
            {path}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close file viewer"
            className="shrink-0 rounded-ph-sm border border-[#4B4B4B] bg-transparent px-2 py-0.5 font-sans text-xs font-bold text-[#C4C5BC] hover:bg-white/10"
          >
            Esc x
          </button>
        </div>
        <div className="overflow-auto rounded-b-ph">
          <CodeViewer path={path} maxHeight="74vh" className="rounded-none" />
        </div>
      </div>
    </div>
  );
}
