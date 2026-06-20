import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ClusterNodeData } from '../../lib/graph';

/**
 * Cluster node — the boldest visual weight in the map.
 *
 * Collapsed: a white PostHog card with a 4px page-red accent stripe on the
 * left, the cluster name in Nunito, a two-line summary, and aggregate child
 * counts. Expanded: a quiet container frame (cream surface) with a header strip
 * — modules render nested inside it via React Flow parent/child positioning.
 *
 * Flat design: no shadows. Hierarchy comes from the white-on-cream contrast,
 * the thin olive border, and the accent stripe. Selection = yellow ring,
 * highlight = blue-tinted emphasis with a gentle pulse, dim = lowered opacity.
 */
const STRIPE = 'bg-ph-node-page'; // cluster = PostHog brand red (premium top level)

function ClusterNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as ClusterNodeData;
  const active = d.selected || selected;
  const openWiki = (e: React.MouseEvent) => {
    e.stopPropagation();
    d.onOpenWiki?.(id);
  };

  if (d.expanded) {
    // Container frame — children are positioned inside by elk/React Flow.
    return (
      <div
        className={[
          'relative h-full w-full overflow-hidden rounded-ph border-[1.5px] bg-ph-canvas/70 shadow-ph-node',
          'transition-[opacity,border-color] duration-300',
          d.dimmed ? 'opacity-45' : 'opacity-100',
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
        <div className="flex items-center gap-2 px-5 pt-3.5 pl-6">
          <span className="font-sans text-[15px] font-extrabold tracking-tight text-ph-ink">
            {d.label}
          </span>
          <span className="ml-auto font-mono text-label uppercase tracking-[0.16em] text-ph-ash">
            cluster
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        'group relative w-[248px] cursor-pointer overflow-hidden rounded-ph border-[1.5px] bg-ph-surface pl-6 pr-5 py-4 shadow-ph-node',
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

      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-mono text-label uppercase tracking-[0.18em] text-ph-ash">
          cluster
        </span>
        {d.changedCount > 0 && (
          <span className="ml-auto inline-flex items-center rounded-ph-pill bg-ph-yellow/15 px-2 py-0.5 font-sans text-[10px] font-bold tracking-wide text-ph-yellow-pressed">
            {d.changedCount} changed
          </span>
        )}
      </div>

      <div className="font-sans text-heading-md font-extrabold leading-tight tracking-tight text-ph-ink">
        {d.label}
      </div>

      <p className="mt-1.5 font-body text-body-sm leading-snug text-ph-body line-clamp-2">
        {d.summary}
      </p>

      <div className="mt-3 flex items-center gap-3 border-t border-ph-border-soft pt-2.5 font-mono text-[11px] text-ph-mute">
        <span>
          <span className="font-semibold text-ph-ink">{d.moduleCount}</span> module
          {d.moduleCount !== 1 ? 's' : ''}
        </span>
        {d.fileCount > 0 && (
          <span>
            <span className="font-semibold text-ph-ink">{d.fileCount}</span> file
            {d.fileCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className="ml-auto font-semibold text-ph-blue transition-colors group-hover:text-ph-blue-link">
          expand →
        </span>
      </div>

      {/* Open-wiki affordance — distinct from card click (which expands). */}
      {d.onOpenWiki && (
        <button
          onClick={openWiki}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-ph border border-ph-yellow-pressed bg-ph-yellow px-3 py-1.5 font-sans text-[11px] font-bold text-ph-ink transition-colors hover:bg-ph-yellow-pressed"
        >
          Open wiki →
        </button>
      )}
      {d.showWikiHint && (
        <div className="mt-1.5 text-center font-sans text-[10px] text-ph-ash">
          Click to open wiki →
        </div>
      )}
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeImpl);
