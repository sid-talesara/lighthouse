/**
 * assembleWiki — pure data-assembly for the Module Wiki drawer.
 *
 * Given any nodeId (which may reference a `module`/`file` node in data.nodes
 * OR a cluster id in data.clusters — flows, PRs and sections all cross-link to
 * both), this gathers every one of the 9 data dimensions the wiki renders:
 *
 *   1. node (resolved + normalised kind)   6. dbTables
 *   2. parentCluster / childModules        7. flows
 *   3. incoming / outgoing edges           8. pullRequests
 *   4. neighbors (resolved nodes)          9. sections (wiki prose)
 *   5. functions (+ calls)
 *
 * Kind-awareness: clusters live in `data.clusters` and carry no `kind` field,
 * so we synthesise a normalised `WikiNode` with an explicit kind. Clusters roll
 * up child data (key files, function/table counts) per the spec.
 */

import type {
  Cluster,
  DbTable,
  Edge,
  Flow,
  FunctionNode,
  CallEdge,
  LighthouseData,
  LighthouseNode,
  PullRequest,
  Section,
  NodeKind,
} from '../types/lighthouse';

/** Normalised node the wiki renders against (modules, files, AND clusters). */
export interface WikiNode {
  id: string;
  label: string;
  kind: NodeKind;
  summary: string;
  path: string | null;
  key_files: string[];
  changed_recently: boolean;
}

export interface NeighborRef {
  node: WikiNode;
  kind: Edge['kind'];
  direction: 'in' | 'out';
}

export interface WikiPayload {
  node: WikiNode;
  /** The owning cluster (for modules/files) — used for breadcrumb + footer. */
  parentCluster: Cluster | null;
  /** Direct child module nodes (only populated for clusters). */
  childModules: LighthouseNode[];
  incomingEdges: Edge[];
  outgoingEdges: Edge[];
  /** De-duplicated, resolved neighbor list with edge kind + direction. */
  neighbors: NeighborRef[];
  functions: FunctionNode[];
  calls: CallEdge[];
  /** When the node is a cluster, count of functions across child modules. */
  rolledUpFunctionCount: number;
  dbTables: DbTable[];
  rolledUpTableCount: number;
  flows: Flow[];
  pullRequests: PullRequest[];
  sections: Section[];
  /** Grouped key files for cluster roll-up: module label → file paths. */
  clusterKeyFiles: { moduleId: string; moduleLabel: string; files: string[] }[];
}

/** Resolve a raw id to a normalised WikiNode, or null if unknown. */
export function resolveWikiNode(id: string, data: LighthouseData): WikiNode | null {
  const node = data.nodes.find((n) => n.id === id);
  if (node) {
    return {
      id: node.id,
      label: node.label,
      kind: node.kind,
      summary: node.summary,
      path: node.path || null,
      key_files: node.key_files ?? [],
      changed_recently: node.changed_recently,
    };
  }
  const cluster = data.clusters.find((c) => c.id === id);
  if (cluster) {
    return {
      id: cluster.id,
      label: cluster.label,
      kind: 'cluster',
      summary: cluster.summary,
      path: null,
      key_files: [],
      changed_recently: false,
    };
  }
  return null;
}

/** Find the cluster that owns this node id (by membership or parent pointer). */
export function findParentCluster(
  nodeId: string,
  node: WikiNode | null,
  data: LighthouseData,
): Cluster | null {
  if (node?.kind === 'cluster') return null;
  const rawNode = data.nodes.find((n) => n.id === nodeId);
  const parentId = rawNode?.parent;
  return (
    data.clusters.find((c) => c.modules.includes(nodeId)) ??
    data.clusters.find((c) => c.id === parentId) ??
    null
  );
}

/**
 * Assemble the full wiki payload for a node id. Pure + side-effect free so it
 * is trivially unit-testable. Returns null only when the id resolves to nothing.
 */
export function assembleWikiPayload(
  nodeId: string,
  data: LighthouseData,
): WikiPayload | null {
  const node = resolveWikiNode(nodeId, data);
  if (!node) return null;

  const isCluster = node.kind === 'cluster';
  const parentCluster = findParentCluster(nodeId, node, data);

  // Child modules (cluster only).
  const cluster = isCluster ? data.clusters.find((c) => c.id === nodeId) : undefined;
  const childModuleIds = cluster?.modules ?? [];
  const childModules = data.nodes.filter((n) => childModuleIds.includes(n.id));

  // Edges touching this node.
  const edges = data.edges;
  const incomingEdges = edges.filter((e) => e.target === nodeId);
  const outgoingEdges = edges.filter((e) => e.source === nodeId);

  // Resolve neighbors, preserving edge kind + direction. Outgoing first so the
  // diagram's right column reads as "what this depends on".
  const seen = new Set<string>();
  const neighbors: NeighborRef[] = [];
  for (const e of outgoingEdges) {
    const nbr = resolveWikiNode(e.target, data);
    if (nbr && !seen.has(`out:${nbr.id}`)) {
      seen.add(`out:${nbr.id}`);
      neighbors.push({ node: nbr, kind: e.kind, direction: 'out' });
    }
  }
  for (const e of incomingEdges) {
    const nbr = resolveWikiNode(e.source, data);
    if (nbr && !seen.has(`in:${nbr.id}`)) {
      seen.add(`in:${nbr.id}`);
      neighbors.push({ node: nbr, kind: e.kind, direction: 'in' });
    }
  }

  const allFunctions = data.functions ?? [];
  const allTables = data.dbTables ?? [];

  // Functions: clusters roll up children's count but don't list details.
  const ownFunctions = allFunctions.filter((f) => f.module_id === nodeId);
  const childFnIds = new Set(childModuleIds);
  const rolledUpFunctionCount = isCluster
    ? allFunctions.filter((f) => childFnIds.has(f.module_id)).length
    : ownFunctions.length;
  const functions = isCluster ? [] : ownFunctions;

  const fnIds = new Set(functions.map((f) => f.id));
  const calls = (data.calls ?? []).filter((c) => fnIds.has(c.from) || fnIds.has(c.to));

  // DB tables: clusters roll up child count.
  const ownTables = allTables.filter((t) => t.module_id === nodeId);
  const rolledUpTableCount = isCluster
    ? allTables.filter((t) => t.module_id && childFnIds.has(t.module_id)).length
    : ownTables.length;
  const dbTables = isCluster
    ? allTables.filter((t) => t.module_id && childFnIds.has(t.module_id))
    : ownTables;

  // Flows referencing this node OR (for clusters) any child module.
  const flowMatchIds = new Set<string>([nodeId, ...childModuleIds]);
  const flows = data.flows.filter((f) => f.steps.some((s) => flowMatchIds.has(s.node)));

  // PRs that touch this node (or any child for clusters), newest first.
  const pullRequests = (data.pullRequests ?? [])
    .filter((pr) => pr.touched.some((t) => flowMatchIds.has(t.node_id)))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  // Wiki prose sections related to this node (or any child for clusters).
  const sections = data.sections.filter((s) =>
    s.related_nodes.some((rn) => flowMatchIds.has(rn)),
  );

  // Cluster key-file roll-up grouped by child module.
  const clusterKeyFiles = isCluster
    ? childModules
        .map((m) => ({
          moduleId: m.id,
          moduleLabel: m.label,
          files: m.key_files.filter((f) => f.trim() !== ''),
        }))
        .filter((g) => g.files.length > 0)
    : [];

  return {
    node,
    parentCluster,
    childModules,
    incomingEdges,
    outgoingEdges,
    neighbors,
    functions,
    calls,
    rolledUpFunctionCount,
    dbTables,
    rolledUpTableCount,
    flows,
    pullRequests,
    sections,
    clusterKeyFiles,
  };
}

/** Short relative-ish date format, e.g. "Sep 12, 2024". */
export function formatWikiDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
