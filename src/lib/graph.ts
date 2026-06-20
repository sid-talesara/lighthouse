import { MarkerType, type Node, type Edge } from '@xyflow/react';
import type { LighthouseData, LighthouseNode } from '../types/lighthouse';

/**
 * Data payloads carried by each custom React Flow node. They are intentionally
 * flat (React Flow stores `data` as Record<string, unknown>) but we keep typed
 * interfaces so the node components stay strict.
 */
export interface ClusterNodeData extends Record<string, unknown> {
  label: string;
  summary: string;
  moduleCount: number;
  fileCount: number;
  changedCount: number;
  expanded: boolean;
  highlighted: boolean;
  selected: boolean;
  dimmed: boolean;
}

export interface ModuleNodeData extends Record<string, unknown> {
  label: string;
  summary: string;
  path: string;
  fileCount: number;
  changedRecently: boolean;
  expanded: boolean;
  expandable: boolean;
  highlighted: boolean;
  selected: boolean;
  dimmed: boolean;
}

export interface FileNodeData extends Record<string, unknown> {
  label: string;
  summary: string;
  path: string;
  changedRecently: boolean;
  highlighted: boolean;
  selected: boolean;
  dimmed: boolean;
}

/** Indexes derived once from the raw data; cheap to recompute, stable shape. */
export interface GraphIndex {
  nodeById: Map<string, LighthouseNode>;
  /** cluster id -> module nodes (kind === 'module', parent === clusterId) */
  modulesByCluster: Map<string, LighthouseNode[]>;
  /** module id -> file nodes (kind === 'file', parent === moduleId) */
  filesByModule: Map<string, LighthouseNode[]>;
  /** any node id (module/file/cluster) -> owning cluster id */
  clusterOf: Map<string, string>;
}

export function buildIndex(data: LighthouseData): GraphIndex {
  const nodeById = new Map<string, LighthouseNode>();
  for (const n of data.nodes) nodeById.set(n.id, n);

  const modulesByCluster = new Map<string, LighthouseNode[]>();
  const filesByModule = new Map<string, LighthouseNode[]>();

  for (const n of data.nodes) {
    if (n.kind === 'module') {
      const arr = modulesByCluster.get(n.parent) ?? [];
      arr.push(n);
      modulesByCluster.set(n.parent, arr);
    } else if (n.kind === 'file') {
      const arr = filesByModule.get(n.parent) ?? [];
      arr.push(n);
      filesByModule.set(n.parent, arr);
    }
  }

  // Resolve the owning cluster for every node by walking parent links.
  const clusterIds = new Set(data.clusters.map((c) => c.id));
  const clusterOf = new Map<string, string>();
  const resolve = (id: string, guard = 0): string | undefined => {
    if (guard > 8) return undefined;
    if (clusterIds.has(id)) return id;
    const node = nodeById.get(id);
    if (!node) return undefined;
    if (clusterIds.has(node.parent)) return node.parent;
    return resolve(node.parent, guard + 1);
  };
  for (const n of data.nodes) {
    const c = resolve(n.id);
    if (c) clusterOf.set(n.id, c);
  }
  for (const c of data.clusters) clusterOf.set(c.id, c.id);

  return { nodeById, modulesByCluster, filesByModule, clusterOf };
}

export interface VisibleState {
  /** cluster ids currently expanded to show their modules */
  expandedClusters: Set<string>;
  /** module ids currently expanded to show their files */
  expandedModules: Set<string>;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
}

/**
 * Build the *logical* React Flow graph (no positions yet — elk assigns those).
 * Group nodes (clusters, expanded modules) use parent/child relationships so
 * children render nested inside their parent, which is the zoom-in metaphor.
 */
export function buildVisibleGraph(
  data: LighthouseData,
  index: GraphIndex,
  state: VisibleState,
): { nodes: Node[]; edges: Edge[] } {
  const { expandedClusters, expandedModules, selectedNodeId, highlightedNodeIds } = state;
  const hasHighlight = highlightedNodeIds.size > 0;
  const nodes: Node[] = [];

  const isDimmed = (id: string) => hasHighlight && !highlightedNodeIds.has(id);

  for (const cluster of data.clusters) {
    const modules = index.modulesByCluster.get(cluster.id) ?? [];
    const expanded = expandedClusters.has(cluster.id);

    // Aggregate counts shown on a collapsed cluster.
    let fileCount = 0;
    let changedCount = 0;
    for (const m of modules) {
      const files = index.filesByModule.get(m.id) ?? [];
      fileCount += files.length;
      if (m.changed_recently) changedCount += 1;
      for (const f of files) if (f.changed_recently) changedCount += 1;
    }

    const clusterData: ClusterNodeData = {
      label: cluster.label,
      summary: cluster.summary,
      moduleCount: modules.length,
      fileCount,
      changedCount,
      expanded,
      highlighted: highlightedNodeIds.has(cluster.id),
      selected: selectedNodeId === cluster.id,
      dimmed: isDimmed(cluster.id),
    };

    nodes.push({
      id: cluster.id,
      type: 'cluster',
      position: { x: 0, y: 0 },
      data: clusterData,
      // Expanded clusters become containers; collapsed ones are plain cards.
      ...(expanded ? { style: {} } : {}),
    });

    if (!expanded) continue;

    for (const mod of modules) {
      const files = index.filesByModule.get(mod.id) ?? [];
      const modExpanded = expandedModules.has(mod.id) && files.length > 0;

      const moduleData: ModuleNodeData = {
        label: mod.label,
        summary: mod.summary,
        path: mod.path,
        fileCount: files.length,
        changedRecently: mod.changed_recently,
        expanded: modExpanded,
        expandable: files.length > 0,
        highlighted: highlightedNodeIds.has(mod.id),
        selected: selectedNodeId === mod.id,
        dimmed: isDimmed(mod.id),
      };

      nodes.push({
        id: mod.id,
        type: 'module',
        position: { x: 0, y: 0 },
        data: moduleData,
        parentId: cluster.id,
        extent: 'parent',
      });

      if (!modExpanded) continue;

      for (const file of files) {
        const fileData: FileNodeData = {
          label: file.label,
          summary: file.summary,
          path: file.path,
          changedRecently: file.changed_recently,
          highlighted: highlightedNodeIds.has(file.id),
          selected: selectedNodeId === file.id,
          dimmed: isDimmed(file.id),
        };
        nodes.push({
          id: file.id,
          type: 'file',
          position: { x: 0, y: 0 },
          data: fileData,
          parentId: mod.id,
          extent: 'parent',
        });
      }
    }
  }

  const visibleIds = new Set(nodes.map((n) => n.id));
  const edges = buildEdges(data, index, visibleIds, highlightedNodeIds);
  return { nodes, edges };
}

/**
 * Project raw edges onto the currently-visible level. If both endpoints'
 * clusters are collapsed, draw a cluster→cluster edge; if a cluster is
 * expanded, route to the relevant module so dependency direction still reads.
 */
function buildEdges(
  data: LighthouseData,
  index: GraphIndex,
  visibleIds: Set<string>,
  highlightedNodeIds: Set<string>,
): Edge[] {
  const hasHighlight = highlightedNodeIds.size > 0;

  // Map any node id to the nearest currently-visible ancestor.
  const toVisible = (id: string): string | undefined => {
    if (visibleIds.has(id)) return id;
    const node = index.nodeById.get(id);
    if (node && visibleIds.has(node.parent)) return node.parent;
    const cluster = index.clusterOf.get(id);
    if (cluster && visibleIds.has(cluster)) return cluster;
    return undefined;
  };

  const seen = new Set<string>();
  const edges: Edge[] = [];

  for (const e of data.edges) {
    const src = toVisible(e.source);
    const tgt = toVisible(e.target);
    if (!src || !tgt || src === tgt) continue;

    const id = `${src}=>${tgt}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const lit =
      hasHighlight &&
      highlightedNodeIds.has(src) &&
      highlightedNodeIds.has(tgt);
    const dimmed = hasHighlight && !lit;

    // PostHog palette: quiet olive by default, blue accent when a path is lit.
    const stroke = lit ? '#2C84E0' : '#BFC1B7';
    edges.push({
      id,
      source: src,
      target: tgt,
      type: 'smoothstep',
      // `animated` draws the moving dashed stroke for "live path" edges.
      animated: lit,
      data: { kind: e.kind },
      style: {
        stroke,
        strokeWidth: lit ? 2.5 : 1.5,
        opacity: dimmed ? 0.15 : lit ? 1 : 0.55,
        transition: 'stroke 150ms ease-out, opacity 150ms ease-out, stroke-width 150ms ease-out',
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: stroke,
      },
    });
  }

  return edges;
}
