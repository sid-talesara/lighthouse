import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ModuleNodeData } from '../../lib/graph';

/**
 * Module node. Collapsed: a compact instrument card. Expanded: a container
 * frame holding file children. Always shows label + path; summary on hover or
 * when active. Carries the changed badge + highlight pulse states.
 */
function ModuleNodeImpl({ data, selected }: NodeProps) {
  const d = data as ModuleNodeData;
  const active = d.selected || selected;

  if (d.expanded) {
    return (
      <div
        className={[
          'h-full w-full rounded-xl border bg-abyss-700/50 transition-all duration-300',
          d.dimmed ? 'opacity-45' : 'opacity-100',
          d.highlighted ? 'border-beacon-400/50' : 'border-slate2-400/15',
        ].join(' ')}
        style={{ boxShadow: 'inset 0 1px 0 rgba(166,182,204,0.05)' }}
      >
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <div className="flex items-center gap-2 px-4 pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-tide-400/80">
            module
          </span>
          <span className="font-sans text-[13px] font-medium text-slate2-100">
            {d.label}
          </span>
          {d.changedRecently && (
            <span className="h-1.5 w-1.5 rounded-full bg-beacon-400 shadow-[0_0_8px_2px_rgba(242,185,104,0.5)]" />
          )}
          <span className="ml-auto font-mono text-[10px] text-slate2-400/60">
            {d.fileCount} file{d.fileCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        'group relative w-[230px] cursor-pointer rounded-xl border bg-abyss-600/85 px-4 py-3',
        'transition-all duration-300 hover:-translate-y-0.5',
        active
          ? 'border-beacon-500/70'
          : d.highlighted
            ? 'border-beacon-400/55'
            : 'border-slate2-400/18 hover:border-tide-500/50',
        d.dimmed ? 'opacity-35' : 'opacity-100',
        d.highlighted ? 'animate-beaconPulse' : '',
      ].join(' ')}
      style={{
        boxShadow: active
          ? '0 0 0 1px rgba(242,185,104,0.3), 0 12px 30px rgba(0,0,0,0.45)'
          : '0 8px 22px rgba(0,0,0,0.38)',
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <div className="flex items-center gap-2">
        <span
          className={[
            'h-1.5 w-1.5 rounded-full',
            active || d.highlighted ? 'bg-beacon-400' : 'bg-tide-500',
          ].join(' ')}
        />
        <span className="font-sans text-[14px] font-semibold leading-tight text-slate2-100">
          {d.label}
        </span>
        {d.changedRecently && (
          <span className="ml-auto rounded border border-beacon-500/40 bg-beacon-500/10 px-1 py-px font-mono text-[8.5px] uppercase tracking-wider text-beacon-300">
            changed
          </span>
        )}
      </div>

      <p
        className={[
          'mt-1 text-[11.5px] leading-snug text-slate2-300/80',
          active ? 'line-clamp-3' : 'line-clamp-2 opacity-70 group-hover:opacity-100',
        ].join(' ')}
      >
        {d.summary}
      </p>

      <div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-slate2-400/70">
        <span className="truncate" title={d.path}>
          {d.path}
        </span>
        {d.expandable && (
          <span className="ml-auto shrink-0 text-tide-400/80 transition-colors group-hover:text-beacon-400">
            {d.fileCount} →
          </span>
        )}
      </div>
    </div>
  );
}

export const ModuleNode = memo(ModuleNodeImpl);
