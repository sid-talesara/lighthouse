/**
 * FilesView — Wave B real implementation.
 *
 * Renders a collapsible file/folder tree derived from all node `path` and
 * `key_files` values in data. Clicking a file that maps to a node calls
 * onSelectNode + onHighlightNodes for cross-view linking. Styling follows
 * the PostHog-inspired design spec (cream canvas, white card, olive borders,
 * yellow accent).
 */

import type { ViewProps } from './viewContract';
import { FileTree } from './FileTree';

export function FilesView({
  data,
  selectedNodeId,
  highlightedNodeIds,
  onSelectNode,
  onHighlightNodes,
  onOpenWiki,
  repoPath,
  model,
}: ViewProps) {
  // Determine what's currently selected for the header blurb
  const selectedNode = selectedNodeId
    ? data.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  return (
    <div className="flex h-full flex-col bg-ph-canvas">
      {/* Header card */}
      <div className="border-b border-ph-border bg-ph-surface px-6 py-4 flex items-center gap-3 shrink-0">
        <span className="text-xl" aria-hidden>
          📁
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-heading-md text-ph-ink leading-tight">
            Files
          </h2>
          <p className="font-body text-body-sm text-ph-mute mt-0.5">
            {selectedNode
              ? `Selected: ${selectedNode.label} — ${selectedNode.path}`
              : (data.files?.length ?? 0) > 0
                ? 'Browse the full tracked file inventory. Files not in the architecture map are visible but unmapped.'
                : 'Browse key files from the architecture map.'}
          </p>
        </div>
        {selectedNode && onOpenWiki && (
          <button
            type="button"
            onClick={() => onOpenWiki(selectedNode.id)}
            className="shrink-0 rounded-ph border border-ph-yellow-pressed bg-ph-yellow px-3 py-1.5 font-sans text-[12px] font-bold text-ph-ink hover:bg-ph-yellow-pressed transition-colors"
          >
            Open wiki →
          </button>
        )}
        {selectedNode && (
          <button
            type="button"
            onClick={() => {
              onSelectNode(null);
              onHighlightNodes(new Set());
            }}
            className="shrink-0 rounded-ph border border-ph-border bg-ph-surface-soft px-3 py-1.5 font-sans text-[12px] text-ph-body hover:bg-ph-border-dashed transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Tree panel — fills remaining height */}
      <div className="flex-1 overflow-hidden bg-ph-surface rounded-none">
        <FileTree
          data={data}
          selectedNodeId={selectedNodeId}
          highlightedNodeIds={highlightedNodeIds}
          onSelectNode={onSelectNode}
          onHighlightNodes={onHighlightNodes}
          repoPath={repoPath}
          model={model}
        />
      </div>
    </div>
  );
}
