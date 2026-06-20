/**
 * FileTree — helper for FilesView.
 *
 * Builds a nested folder → file tree from the optional full file inventory
 * plus all node `path` and `key_files` values. Renders a collapsible tree with PostHog-inspired
 * styling. Cross-view links are wired through onSelectNode / onHighlightNodes.
 */

import { useState, useMemo, useCallback } from 'react';
import type { LighthouseData, LighthouseNode } from '../../types/lighthouse';

// ─── Tree Data Model ──────────────────────────────────────────────────────────

export interface FileEntry {
  /** Absolute-style path relative to repo root, e.g. "apps/api/src/foo.ts" */
  filePath: string;
  /** The node whose key_files contains this path (or whose path matches). */
  nodeId: string | null;
}

export interface FolderNode {
  type: 'folder';
  name: string;
  fullPath: string;
  children: TreeNode[];
}

export interface LeafNode {
  type: 'file';
  name: string;
  fullPath: string;
  nodeId: string | null;
}

export type TreeNode = FolderNode | LeafNode;

// ─── Tree Builder ─────────────────────────────────────────────────────────────

function insertPath(root: FolderNode, filePath: string, nodeId: string | null) {
  const parts = filePath.split('/').filter(Boolean);
  let current = root;

  for (let i = 0; i < parts.length - 1; i++) {
    const segment = parts[i];
    const existing = current.children.find(
      (c): c is FolderNode => c.type === 'folder' && c.name === segment,
    );
    if (existing) {
      current = existing;
    } else {
      const newFolder: FolderNode = {
        type: 'folder',
        name: segment,
        fullPath: parts.slice(0, i + 1).join('/'),
        children: [],
      };
      current.children.push(newFolder);
      current = newFolder;
    }
  }

  const fileName = parts[parts.length - 1];
  const exists = current.children.some(
    (c) => c.type === 'file' && c.name === fileName,
  );
  if (!exists) {
    current.children.push({
      type: 'file',
      name: fileName,
      fullPath: filePath,
      nodeId,
    });
  }
}

function sortTree(node: FolderNode): FolderNode {
  node.children.sort((a, b) => {
    // Folders before files
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    if (child.type === 'folder') sortTree(child);
  }
  return node;
}

/**
 * Derives a nested tree from all indexed file paths, node paths, and key_files in data.
 * Files are tagged with the node id they belong to (null if no match).
 */
export function buildFileTree(data: LighthouseData): FolderNode {
  const root: FolderNode = {
    type: 'folder',
    name: '(root)',
    fullPath: '',
    children: [],
  };

  // Build path → nodeId lookup
  const pathToNodeId = new Map<string, string>();
  for (const node of data.nodes) {
    // node.path maps the module/folder itself — use it as a prefix marker
    // but key_files are the individual files we index
    for (const kf of node.key_files) {
      if (!pathToNodeId.has(kf)) {
        pathToNodeId.set(kf, node.id);
      }
    }
  }

  // Insert all key_files
  for (const [filePath, nodeId] of pathToNodeId.entries()) {
    insertPath(root, filePath, nodeId);
  }

  // Insert full deterministic inventory when present. These leaves are visible
  // even when the architecture map has not assigned them to a module.
  for (const file of data.files ?? []) {
    if (!pathToNodeId.has(file.path)) insertPath(root, file.path, null);
  }

  // Also insert the module-level `path` as a virtual folder entry if it has
  // no key_files (so the module still appears in the tree)
  for (const node of data.nodes) {
    if (node.key_files.length === 0 && node.path) {
      // Mark the path itself as a "file" placeholder with the node id
      insertPath(root, node.path + '/__module__', node.id);
    }
  }

  return sortTree(root);
}

// ─── Filter Helper ────────────────────────────────────────────────────────────

/** Returns true if this subtree contains any file matching the query. */
function treeContainsQuery(node: TreeNode, query: string): boolean {
  if (node.type === 'file') {
    return node.name.toLowerCase().includes(query);
  }
  return node.children.some((c) => treeContainsQuery(c, query));
}

function filterTree(node: FolderNode, query: string): FolderNode {
  const filteredChildren = node.children
    .filter((c) => treeContainsQuery(c, query))
    .map((c) =>
      c.type === 'folder' ? filterTree(c, query) : c,
    );
  return { ...node, children: filteredChildren };
}

// ─── Render Helpers ──────────────────────────────────────────────────────────

function fileExtColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: '#2C84E0',
    tsx: '#7C44A6',
    js: '#DC9300',
    jsx: '#F54E00',
    rs: '#F54E00',
    css: '#2C8C66',
    json: '#6C6E63',
    md: '#9B9C92',
  };
  return map[ext] ?? '#9B9C92';
}

// ─── Tree Node Components ────────────────────────────────────────────────────

interface FileLeafProps {
  node: LeafNode;
  depth: number;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  onSelectNode: (id: string | null) => void;
  onHighlightNodes: (ids: Set<string>) => void;
  nodeById: Map<string, LighthouseNode>;
}

function FileLeaf({
  node,
  depth,
  selectedNodeId,
  highlightedNodeIds,
  onSelectNode,
  onHighlightNodes,
  nodeById,
}: FileLeafProps) {
  const isSelected = node.nodeId !== null && selectedNodeId === node.nodeId;
  const isHighlighted =
    node.nodeId !== null && highlightedNodeIds.has(node.nodeId);

  const handleClick = useCallback(() => {
    if (!node.nodeId) return;
    if (isSelected) {
      onSelectNode(null);
      onHighlightNodes(new Set());
    } else {
      onSelectNode(node.nodeId);
      onHighlightNodes(new Set([node.nodeId]));
    }
  }, [node.nodeId, isSelected, onSelectNode, onHighlightNodes]);

  const isPhantom = node.name === '__module__';
  if (isPhantom) return null;

  const dotColor = fileExtColor(node.name);
  const interactive = node.nodeId !== null;

  return (
    <li
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      className={[
        'group flex items-center gap-2 rounded-ph-sm px-2 py-1 transition-colors',
        isSelected
          ? 'bg-[#FEF3C7] border-l-2 border-ph-yellow'
          : isHighlighted
          ? 'bg-ph-blue-soft border-l-2 border-ph-blue'
          : 'border-l-2 border-transparent',
        interactive
          ? 'cursor-pointer hover:bg-ph-canvas'
          : 'cursor-default opacity-60',
      ].join(' ')}
      onClick={interactive ? handleClick : undefined}
      title={
        interactive
          ? `Click to select ${nodeById.get(node.nodeId!)?.label}`
          : undefined
      }
    >
      {/* File icon */}
      <span style={{ color: dotColor }} className="shrink-0 text-[11px]">
        ●
      </span>
      <span
        className={[
          'min-w-0 truncate font-mono text-[12px]',
          isSelected || isHighlighted ? 'text-ph-ink font-medium' : 'text-ph-body',
        ].join(' ')}
      >
        {node.name}
      </span>
      {interactive && (
        <span className="ml-auto shrink-0 hidden group-hover:inline-block rounded-ph-pill bg-ph-surface-soft px-1.5 py-0.5 font-sans text-[10px] text-ph-mute leading-tight">
          {nodeById.get(node.nodeId!)?.kind ?? ''}
        </span>
      )}
    </li>
  );
}

interface FolderRowProps {
  node: FolderNode;
  depth: number;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  onSelectNode: (id: string | null) => void;
  onHighlightNodes: (ids: Set<string>) => void;
  nodeById: Map<string, LighthouseNode>;
  defaultOpen?: boolean;
}

function FolderRow({
  node,
  depth,
  selectedNodeId,
  highlightedNodeIds,
  onSelectNode,
  onHighlightNodes,
  nodeById,
  defaultOpen = false,
}: FolderRowProps) {
  const [open, setOpen] = useState(defaultOpen);

  // Auto-open if a highlighted or selected node lives in this subtree
  const containsSelected = useMemo(() => {
    function check(n: TreeNode): boolean {
      if (n.type === 'file') {
        return (
          (n.nodeId !== null && n.nodeId === selectedNodeId) ||
          (n.nodeId !== null && highlightedNodeIds.has(n.nodeId))
        );
      }
      return n.children.some(check);
    }
    return node.children.some(check);
  }, [node.children, selectedNodeId, highlightedNodeIds]);

  const isEffectivelyOpen = open || containsSelected;

  return (
    <li>
      <button
        type="button"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        className="flex w-full items-center gap-2 rounded-ph-sm px-2 py-1 text-left transition-colors hover:bg-ph-canvas border-l-2 border-transparent"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Chevron */}
        <span
          className={[
            'shrink-0 text-ph-ash transition-transform duration-150 text-[10px] font-bold select-none',
            isEffectivelyOpen ? 'rotate-90' : '',
          ].join(' ')}
        >
          ▶
        </span>
        {/* Folder icon */}
        <span className="shrink-0 text-[13px]">
          {isEffectivelyOpen ? '📂' : '📁'}
        </span>
        <span className="min-w-0 truncate font-mono text-[12px] font-medium text-ph-ink">
          {node.name}
        </span>
        <span className="ml-auto shrink-0 font-sans text-[10px] text-ph-ash">
          {node.children.length}
        </span>
      </button>
      {isEffectivelyOpen && (
        <ul>
          {node.children.map((child, i) =>
            child.type === 'folder' ? (
              <FolderRow
                key={child.fullPath + i}
                node={child}
                depth={depth + 1}
                selectedNodeId={selectedNodeId}
                highlightedNodeIds={highlightedNodeIds}
                onSelectNode={onSelectNode}
                onHighlightNodes={onHighlightNodes}
                nodeById={nodeById}
              />
            ) : (
              <FileLeaf
                key={child.fullPath + i}
                node={child}
                depth={depth + 1}
                selectedNodeId={selectedNodeId}
                highlightedNodeIds={highlightedNodeIds}
                onSelectNode={onSelectNode}
                onHighlightNodes={onHighlightNodes}
                nodeById={nodeById}
              />
            ),
          )}
        </ul>
      )}
    </li>
  );
}

// ─── Public Component ─────────────────────────────────────────────────────────

interface FileTreeProps {
  data: LighthouseData;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  onSelectNode: (id: string | null) => void;
  onHighlightNodes: (ids: Set<string>) => void;
}

export function FileTree({
  data,
  selectedNodeId,
  highlightedNodeIds,
  onSelectNode,
  onHighlightNodes,
}: FileTreeProps) {
  const [query, setQuery] = useState('');

  const nodeById = useMemo(() => {
    const map = new Map<string, LighthouseNode>();
    for (const n of data.nodes) map.set(n.id, n);
    return map;
  }, [data.nodes]);

  const rawTree = useMemo(() => buildFileTree(data), [data]);

  const displayTree = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rawTree;
    return filterTree(rawTree, q);
  }, [rawTree, query]);

  // Count unique files
  const totalFiles = useMemo(() => {
    let count = 0;
    const walk = (n: TreeNode) => {
      if (n.type === 'file' && n.name !== '__module__') count++;
      else if (n.type === 'folder') n.children.forEach(walk);
    };
    rawTree.children.forEach(walk);
    return count;
  }, [rawTree]);

  return (
    <div className="flex h-full flex-col">
      {/* Search bar */}
      <div className="border-b border-ph-border bg-ph-surface px-4 py-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ph-ash text-[13px]">
            🔍
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter files…"
            className="w-full rounded-ph bg-ph-canvas border border-ph-border pl-8 pr-3 py-1.5 font-mono text-[12px] text-ph-ink placeholder:text-ph-ash focus:outline-none focus:border-ph-blue focus:shadow-ph-focus transition-shadow"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ph-ash hover:text-ph-body text-[13px]"
            >
              ✕
            </button>
          )}
        </div>
        <div className="mt-1.5 font-sans text-[11px] text-ph-ash">
          {totalFiles} {(data.files?.length ?? 0) > 0 ? 'files' : 'key files'} · {data.nodes.length} modules
        </div>
      </div>

      {/* Tree */}
      <div className="lh-scroll flex-1 overflow-y-auto px-2 py-2">
        {displayTree.children.length === 0 ? (
          <div className="px-4 py-8 text-center font-sans text-body-sm text-ph-ash">
            {query ? `No files matching "${query}"` : 'No files found.'}
          </div>
        ) : (
          <ul>
            {displayTree.children.map((child, i) =>
              child.type === 'folder' ? (
                <FolderRow
                  key={child.fullPath + i}
                  node={child}
                  depth={0}
                  selectedNodeId={selectedNodeId}
                  highlightedNodeIds={highlightedNodeIds}
                  onSelectNode={onSelectNode}
                  onHighlightNodes={onHighlightNodes}
                  nodeById={nodeById}
                  defaultOpen={displayTree.children.length <= 3}
                />
              ) : (
                <FileLeaf
                  key={child.fullPath + i}
                  node={child}
                  depth={0}
                  selectedNodeId={selectedNodeId}
                  highlightedNodeIds={highlightedNodeIds}
                  onSelectNode={onSelectNode}
                  onHighlightNodes={onHighlightNodes}
                  nodeById={nodeById}
                />
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
