/**
 * OpenWikiOverlay — a small floating affordance shown over graph-style views
 * (Dependencies, Functions) when a node/module is selected. Clicking it opens
 * the rich module-wiki drawer, giving every view a consistent entry point
 * without re-plumbing each graph's internal node renderers.
 */

import type { LighthouseData } from '../../types/lighthouse';

interface Props {
  data: LighthouseData;
  selectedNodeId: string | null;
  onOpenWiki?: (id: string) => void;
}

export function OpenWikiOverlay({ data, selectedNodeId, onOpenWiki }: Props) {
  if (!selectedNodeId || !onOpenWiki) return null;
  const label =
    data.nodes.find((n) => n.id === selectedNodeId)?.label ??
    data.clusters.find((c) => c.id === selectedNodeId)?.label ??
    null;
  if (!label) return null;

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20">
      <button
        type="button"
        onClick={() => onOpenWiki(selectedNodeId)}
        className="pointer-events-auto inline-flex max-w-[260px] items-center gap-2 rounded-ph border border-ph-yellow-pressed bg-ph-yellow px-3.5 py-2 font-sans text-[12px] font-bold text-ph-ink shadow-ph-float transition-colors hover:bg-ph-yellow-pressed"
      >
        <span className="truncate">Open {label} wiki</span>
        <span aria-hidden>→</span>
      </button>
    </div>
  );
}
