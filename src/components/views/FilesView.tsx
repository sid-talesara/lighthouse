/**
 * FilesView — IDE-style layout.
 *
 * Left panel: collapsible FileTree (search + node cross-links).
 * Right panel: EditorPane — opens real file source via CodeViewer /
 *   fetchFileContent when a file row is clicked. Supports multi-tab, breadcrumb,
 *   loading skeleton, and graceful "server unavailable" fallback (all handled
 *   inside CodeViewer itself).
 *
 * Cross-linking:
 *   - Clicking a file also calls onSelectNode for its owning node (when mapped).
 *   - When selectedNodeId changes from outside, the first key_file of that node
 *     is automatically opened in the editor.
 *
 * Styling: PostHog LIGHT chrome for the shell; CodeViewer supplies the dark
 * olive code surface as per the design spec.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { ViewProps } from './viewContract';
import { FileTree } from './FileTree';
import { EditorPane, type OpenTab } from './EditorPane';

// ─── Tab management helpers ──────────────────────────────────────────────────

const MAX_TABS = 12;

function openTab(
  tabs: OpenTab[],
  filePath: string,
  nodeId: string | null,
  nodeLabel?: string,
): OpenTab[] {
  if (tabs.some((t) => t.filePath === filePath)) return tabs; // already open
  const newTab: OpenTab = { filePath, nodeId, nodeLabel };
  const next = [...tabs, newTab];
  // Evict oldest when over limit
  return next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next;
}

function closeTab(tabs: OpenTab[], filePath: string): OpenTab[] {
  return tabs.filter((t) => t.filePath !== filePath);
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  // ── State ────────────────────────────────────────────────────────────────────
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  // Build nodeId → node label lookup for tab badges
  const nodeById = useMemo(() => {
    const map = new Map<string, { label: string; key_files: string[] }>();
    for (const n of data.nodes) map.set(n.id, { label: n.label, key_files: n.key_files });
    return map;
  }, [data.nodes]);

  // ── External selection → auto-open first key_file ─────────────────────────
  useEffect(() => {
    if (!selectedNodeId) return;
    const node = nodeById.get(selectedNodeId);
    if (!node || node.key_files.length === 0) return;
    const firstFile = node.key_files[0];
    if (!firstFile) return;
    // Only auto-open if the editor isn't already showing a file from this node
    const alreadyOpen = openTabs.some(
      (t) => t.nodeId === selectedNodeId && t.filePath === activeFilePath,
    );
    if (alreadyOpen) return;
    setOpenTabs((prev) => openTab(prev, firstFile, selectedNodeId, node.label));
    setActiveFilePath(firstFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  // ── File open handler (from tree click) ──────────────────────────────────
  const handleOpenFile = useCallback(
    (filePath: string, nodeId: string | null) => {
      const node = nodeId ? nodeById.get(nodeId) : undefined;
      setOpenTabs((prev) => openTab(prev, filePath, nodeId, node?.label));
      setActiveFilePath(filePath);
    },
    [nodeById],
  );

  // ── Tab close ────────────────────────────────────────────────────────────
  const handleCloseTab = useCallback(
    (filePath: string) => {
      setOpenTabs((prev) => {
        const next = closeTab(prev, filePath);
        // If closing the active tab, switch to the nearest remaining one
        if (filePath === activeFilePath) {
          const closedIdx = prev.findIndex((t) => t.filePath === filePath);
          const fallback =
            next[Math.min(closedIdx, next.length - 1)]?.filePath ?? null;
          setActiveFilePath(fallback);
        }
        return next;
      });
    },
    [activeFilePath],
  );

  // ── Active tab info ──────────────────────────────────────────────────────
  const activeTab = activeFilePath
    ? openTabs.find((t) => t.filePath === activeFilePath) ?? null
    : null;
  const activeNodeId = activeTab?.nodeId ?? null;
  const selectedNode = activeNodeId
    ? data.nodes.find((n) => n.id === activeNodeId) ?? null
    : selectedNodeId
      ? data.nodes.find((n) => n.id === selectedNodeId) ?? null
      : null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-ph-canvas overflow-hidden">
      {/* ── Top header ── */}
      <div className="border-b border-ph-border bg-ph-surface px-4 py-2 flex items-center gap-3 shrink-0">
        <span className="text-base" aria-hidden>
          📁
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[14px] font-bold text-ph-ink leading-tight">
            {selectedNode ? selectedNode.label : 'Files'}
          </h2>
          <p className="font-body text-[11px] text-ph-mute mt-0.5 truncate">
            {activeFilePath
              ? activeFilePath
              : selectedNode
                ? selectedNode.path
                : 'Click a file in the tree to view its source'}
          </p>
        </div>
        {selectedNode && onOpenWiki && (
          <button
            type="button"
            onClick={() => onOpenWiki(selectedNode.id)}
            className="shrink-0 rounded-ph border border-ph-yellow-pressed bg-ph-yellow px-3 py-1 font-sans text-[11px] font-bold text-ph-ink hover:bg-ph-yellow-pressed transition-colors"
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
            className="shrink-0 rounded-ph border border-ph-border bg-ph-surface-soft px-3 py-1 font-sans text-[11px] text-ph-body hover:bg-ph-border-dashed transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── IDE body: tree sidebar + editor pane ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: file tree sidebar */}
        <div
          className="shrink-0 flex flex-col border-r border-ph-border bg-ph-surface overflow-hidden"
          style={{ width: '260px', minWidth: '180px', maxWidth: '340px' }}
        >
          <FileTree
            data={data}
            selectedNodeId={selectedNodeId}
            highlightedNodeIds={highlightedNodeIds}
            activeFilePath={activeFilePath}
            onSelectNode={onSelectNode}
            onHighlightNodes={onHighlightNodes}
            onOpenFile={handleOpenFile}
            repoPath={repoPath}
            model={model}
          />
        </div>

        {/* Right: editor pane */}
        <div className="flex-1 overflow-hidden">
          <EditorPane
            openTabs={openTabs}
            activeFilePath={activeFilePath}
            onActivate={setActiveFilePath}
            onClose={handleCloseTab}
          />
        </div>
      </div>
    </div>
  );
}
