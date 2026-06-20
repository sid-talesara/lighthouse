import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ClusterNodeData } from '../../lib/graph';

/**
 * Cluster node. Collapsed: a designed card showing the cluster name, summary
 * and an aggregate count of what's inside. Expanded: a quiet container frame
 * with a header strip; modules render nested inside it.
 */
function ClusterNodeImpl({ data, selected }: NodeProps) {
  const d = data as ClusterNodeData;
  const active = d.selected || selected;

  const border = active
    ? 'border-beacon-500/70'
    : d.highlighted
      ? 'border-beacon-400/60'
      : 'border-slate2-400/20';

  if (d.expanded) {
    // Container frame — children are positioned inside by elk/React Flow.
    return (
      <div
        className={[
          'h-full w-full rounded-2xl border bg-abyss-800/40 backdrop-blur-[2px]',
          'transition-all duration-300',
          d.dimmed ? 'opacity-40' : 'opacity-100',
          d.highlighted ? 'border-beacon-400/50' : 'border-slate2-400/15',
        ].join(' ')}
        style={{
          boxShadow: 'inset 0 1px 0 rgba(166,182,204,0.04), 0 16px 40px rgba(0,0,0,0.35)',
        }}
      >
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <div className="flex items-center gap-2 px-5 pt-4">
          <span className="h-1.5 w-1.5 rounded-full bg-beacon-500 shadow-[0_0_8px_2px_rgba(242,185,104,0.5)]" />
          <span className="font-display text-[15px] font-medium tracking-tight text-slate2-100">
            {d.label}
          </span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-slate2-400/70">
            cluster
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        'group relative w-[248px] cursor-pointer rounded-2xl border bg-gradient-to-b from-abyss-600/90 to-abyss-700/90',
        'px-5 py-4 backdrop-blur-sm transition-all duration-300',
        border,
        d.dimmed ? 'opacity-35' : 'opacity-100',
        d.highlighted ? 'animate-beaconPulse' : '',
        'hover:-translate-y-0.5 hover:border-beacon-500/50',
      ].join(' ')}
      style={{
        boxShadow: active
          ? '0 0 0 1px rgba(242,185,104,0.35), 0 18px 44px rgba(0,0,0,0.5)'
          : '0 14px 36px rgba(0,0,0,0.45)',
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <div className="mb-2 flex items-center gap-2">
        <span
          className={[
            'h-2 w-2 rounded-full transition-shadow',
            active || d.highlighted
              ? 'bg-beacon-400 shadow-[0_0_10px_3px_rgba(242,185,104,0.55)]'
              : 'bg-tide-500',
          ].join(' ')}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate2-400/80">
          cluster
        </span>
        {d.changedCount > 0 && (
          <span className="ml-auto rounded-full border border-beacon-500/40 bg-beacon-500/10 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wide text-beacon-300">
            {d.changedCount} changed
          </span>
        )}
      </div>

      <div className="font-display text-[19px] font-medium leading-tight tracking-tight text-slate2-100">
        {d.label}
      </div>

      <p className="mt-1.5 text-[12.5px] leading-snug text-slate2-300/85 line-clamp-2">
        {d.summary}
      </p>

      <div className="mt-3 flex items-center gap-3 border-t border-slate2-400/10 pt-2.5 font-mono text-[11px] text-slate2-400">
        <span>
          <span className="text-tide-400">{d.moduleCount}</span> module
          {d.moduleCount !== 1 ? 's' : ''}
        </span>
        {d.fileCount > 0 && (
          <span>
            <span className="text-tide-400">{d.fileCount}</span> file
            {d.fileCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className="ml-auto text-beacon-500/80 transition-colors group-hover:text-beacon-400">
          expand →
        </span>
      </div>
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeImpl);
