import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FileNodeData } from '../../lib/graph';

/** Leaf node — a single key file. Mono path, summary on hover/active. */
function FileNodeImpl({ data, selected }: NodeProps) {
  const d = data as FileNodeData;
  const active = d.selected || selected;

  return (
    <div
      className={[
        'group relative w-[210px] cursor-pointer rounded-lg border bg-abyss-800/80 px-3 py-2',
        'transition-all duration-300',
        active
          ? 'border-beacon-500/70'
          : d.highlighted
            ? 'border-beacon-400/55'
            : 'border-slate2-400/14 hover:border-slate2-300/35',
        d.dimmed ? 'opacity-35' : 'opacity-100',
        d.highlighted ? 'animate-beaconPulse' : '',
      ].join(' ')}
      style={{
        boxShadow: active ? '0 0 0 1px rgba(242,185,104,0.28)' : 'none',
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-tide-400/70">›</span>
        <span className="truncate font-mono text-[11.5px] text-slate2-200" title={d.label}>
          {d.label}
        </span>
        {d.changedRecently && (
          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-beacon-400 shadow-[0_0_7px_2px_rgba(242,185,104,0.5)]" />
        )}
      </div>

      {d.summary && (
        <p
          className={[
            'mt-0.5 text-[10.5px] leading-snug text-slate2-400',
            active ? 'line-clamp-2' : 'line-clamp-1 opacity-0 group-hover:opacity-100',
            'transition-opacity duration-200',
          ].join(' ')}
        >
          {d.summary}
        </p>
      )}
    </div>
  );
}

export const FileNode = memo(FileNodeImpl);
