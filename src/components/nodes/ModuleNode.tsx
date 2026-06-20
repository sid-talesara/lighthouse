import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ModuleNodeData } from '../../lib/graph';

/**
 * Module node — mid weight. A white PostHog card with a blue accent stripe.
 * Collapsed: label + summary + mono path + file count. Expanded: a soft cream
 * container frame with a header strip; file children render nested inside.
 *
 * Selection = yellow ring, highlight = blue emphasis + gentle pulse, dim =
 * lowered opacity. Flat — no shadows, the stripe and border do the work.
 */
const STRIPE = 'bg-ph-node-component'; // module = blue

function ModuleNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as ModuleNodeData;
  const active = d.selected || selected;
  const openWiki = (e: React.MouseEvent) => {
    e.stopPropagation();
    d.onOpenWiki?.(id);
  };

  if (d.expanded) {
    return (
      <div
        className={[
          'relative h-full w-full overflow-hidden rounded-ph border-[1.5px] bg-ph-surface-soft/60 shadow-ph-node',
          'transition-[opacity,border-color] duration-300',
          d.dimmed ? 'opacity-50' : 'opacity-100',
          active
            ? 'border-ph-yellow shadow-ph-node-selected'
            : d.highlighted
              ? 'border-ph-blue'
              : 'border-ph-border-strong',
        ].join(' ')}
      >
        <span className={`absolute inset-y-0 left-0 w-1 ${STRIPE}`} />
        {d.highlighted && !active && (
          <span className="pointer-events-none absolute inset-0 rounded-ph ring-2 ring-ph-blue/40 animate-pulse" />
        )}
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <div className="flex items-center gap-2 px-4 pt-3 pl-5">
          <span className="font-mono text-label uppercase tracking-[0.14em] text-ph-ash">
            module
          </span>
          <span className="font-sans text-[13px] font-bold text-ph-ink">
            {d.label}
          </span>
          {d.changedRecently && (
            <span className="h-1.5 w-1.5 rounded-full bg-ph-yellow" />
          )}
          <span className="ml-auto font-mono text-[10px] text-ph-mute">
            {d.fileCount} file{d.fileCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        'group relative w-[230px] cursor-pointer overflow-hidden rounded-ph border-[1.5px] bg-ph-surface pl-5 pr-4 py-3 shadow-ph-node',
        'transition-[opacity,border-color,transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-ph-node-hover',
        active
          ? 'border-ph-yellow shadow-ph-node-selected'
          : d.highlighted
            ? 'border-ph-blue'
            : 'border-ph-border-strong hover:border-ph-ash',
        d.dimmed ? 'opacity-45' : 'opacity-100',
      ].join(' ')}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${STRIPE}`} />
      {d.highlighted && !active && (
        <span className="pointer-events-none absolute inset-0 rounded-ph ring-2 ring-ph-blue/40 animate-pulse" />
      )}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <div className="flex items-center gap-2">
        <span className="font-sans text-body-sm font-bold leading-tight text-ph-ink">
          {d.label}
        </span>
        {d.changedRecently && (
          <span className="ml-auto inline-flex items-center rounded-ph-sm bg-ph-yellow/15 px-1.5 py-px font-sans text-[9px] font-bold uppercase tracking-wide text-ph-yellow-pressed">
            changed
          </span>
        )}
      </div>

      <p
        className={[
          'mt-1 font-body text-[11.5px] leading-snug text-ph-body',
          active ? 'line-clamp-3' : 'line-clamp-2 opacity-80 group-hover:opacity-100',
        ].join(' ')}
      >
        {d.summary}
      </p>

      <div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-ph-mute">
        <span className="truncate" title={d.path}>
          {d.path}
        </span>
        {d.expandable && (
          <span className="ml-auto shrink-0 font-semibold text-ph-blue transition-colors group-hover:text-ph-blue-link">
            {d.fileCount} →
          </span>
        )}
      </div>

      {/* Open-wiki affordance — appears on hover/selection so it stays calm. */}
      {d.onOpenWiki && (
        <button
          onClick={openWiki}
          className={[
            'mt-2 flex w-full items-center justify-center gap-1 rounded-ph-sm border border-ph-yellow-pressed bg-ph-yellow px-2 py-1 font-sans text-[10px] font-bold text-ph-ink transition-all hover:bg-ph-yellow-pressed',
            active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          ].join(' ')}
        >
          Open wiki →
        </button>
      )}
    </div>
  );
}

export const ModuleNode = memo(ModuleNodeImpl);
