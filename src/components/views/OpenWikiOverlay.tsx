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
  onAskContext?: (question: string) => void;
}

export function OpenWikiOverlay({ data, selectedNodeId, onOpenWiki, onAskContext }: Props) {
  if (!selectedNodeId || (!onOpenWiki && !onAskContext)) return null;
  const node = data.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const cluster = data.clusters.find((c) => c.id === selectedNodeId) ?? null;
  const label =
    node?.label ??
    cluster?.label ??
    null;
  if (!label) return null;
  const contextQuestion = [
    `Explain the selected diagram node ${label}.`,
    `Node id: ${selectedNodeId}.`,
    node ? `Kind: ${node.kind}. Path: ${node.path || 'unknown'}. Summary: ${node.summary}. Key files: ${node.key_files.slice(0, 5).join(', ') || 'none'}.` : '',
    cluster ? `Cluster summary: ${cluster.summary}. Modules: ${cluster.modules.slice(0, 12).join(', ')}.` : '',
    'Use the map context and relevant files to explain what it does, what depends on it, and what I should inspect next.',
  ].filter(Boolean).join(' ');

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20">
      <div className="flex items-center gap-1">
        {onOpenWiki && (
          <button
            type="button"
            onClick={() => onOpenWiki(selectedNodeId)}
            className="pointer-events-auto inline-flex max-w-[220px] items-center gap-2 rounded-ph border border-ph-yellow-pressed bg-ph-yellow px-3 py-2 font-sans text-[12px] font-bold text-ph-ink shadow-ph-float transition-colors hover:bg-ph-yellow-pressed"
          >
            <span className="truncate">Open {label} wiki</span>
            <span aria-hidden>→</span>
          </button>
        )}
        {onAskContext && (
          <button
            type="button"
            onClick={() => onAskContext(contextQuestion)}
            className="pointer-events-auto inline-flex items-center gap-1 rounded-ph border border-ph-border bg-ph-surface px-3 py-2 font-sans text-[12px] font-bold text-ph-ink shadow-ph-float transition-colors hover:border-ph-yellow hover:bg-ph-yellow/10"
            title={`Ask Local Codex about ${label}`}
          >
            Ask
          </button>
        )}
      </div>
    </div>
  );
}
