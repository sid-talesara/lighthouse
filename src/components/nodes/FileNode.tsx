import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FileNodeData } from '../../lib/graph';

/**
 * File node — the lightest weight leaf. A compact white card with a thin amber
 * accent stripe, the file name in mono, and a summary on hover/active.
 *
 * Selection = yellow ring, highlight = blue emphasis + gentle pulse, dim =
 * lowered opacity. Flat, no shadows.
 */
const STRIPE = 'bg-ph-node-util'; // file = amber

function FileNodeImpl({ data, selected }: NodeProps) {
  const d = data as FileNodeData;
  const active = d.selected || selected;

  return (
    <div
      className={[
        'group relative w-[210px] cursor-pointer overflow-hidden rounded-ph-sm border bg-ph-surface pl-4 pr-3 py-2',
        'transition-[opacity,border-color,transform] duration-150 ease-out hover:-translate-y-0.5',
        active
          ? 'border-ph-yellow shadow-ph-focus-yellow'
          : d.highlighted
            ? 'border-ph-blue'
            : 'border-ph-border hover:border-ph-ash',
        d.dimmed ? 'opacity-40' : 'opacity-100',
      ].join(' ')}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${STRIPE}`} />
      {d.highlighted && !active && (
        <span className="pointer-events-none absolute inset-0 rounded-ph-sm ring-2 ring-ph-blue/40 animate-pulse" />
      )}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <div className="flex items-center gap-1.5">
        <span className="truncate font-mono text-[11.5px] font-medium text-ph-ink" title={d.label}>
          {d.label}
        </span>
        {d.changedRecently && (
          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-ph-yellow" />
        )}
      </div>

      {d.summary && (
        <p
          className={[
            'mt-0.5 text-[10.5px] leading-snug text-ph-mute',
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
