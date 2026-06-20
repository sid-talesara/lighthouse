/**
 * impact-util — the blast-radius engine for the Changes (PR review) view.
 *
 * GitHub shows you a diff. It cannot show you what *else* breaks. This module
 * answers the reviewer's real question: "if this PR ships, what is downstream
 * of the files it touched, and how far does the ripple reach?"
 *
 * ── Dependency direction ──────────────────────────────────────────────────────
 * An Edge { source, target } means `source` depends on / imports / calls
 * `target`. So `source` is the dependent, `target` is the dependency.
 *
 * If a PR touches a node N, anything that DEPENDS ON N is at risk. Those are the
 * nodes that have an edge with target === N — i.e. its `source` side. We follow
 * that backward over the edge graph (BFS over reverse adjacency) to get the full
 * transitive ripple, recording the hop distance of each affected node.
 *
 * Touched leaf modules (pure consumers, never a dependency) yield an empty
 * ripple — that is a real and common signal ("self-contained change"), not a
 * bug. The view renders that state deliberately.
 */

import type {
  Cluster,
  Edge,
  LighthouseNode,
  PullRequest,
  ChangeKind,
} from '../../types/lighthouse';

export interface TouchedNode {
  id: string;
  label: string;
  change: ChangeKind;
  /** Resolved owning cluster id, if any. */
  clusterId: string | null;
  /** Whether this id resolved to a real node (vs a dangling reference). */
  resolved: boolean;
}

export interface AffectedNode {
  id: string;
  label: string;
  /** Hop distance from the nearest touched node (>= 1). */
  hops: number;
  clusterId: string | null;
  /** The kind of the edge that first reached this node (for edge labelling). */
  viaKind: Edge['kind'];
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ImpactRippleEdge {
  /** dependent (source) — the node at risk. */
  from: string;
  /** dependency (target) — the touched/closer node it relies on. */
  to: string;
  kind: Edge['kind'];
}

export interface BlastRadius {
  pr: PullRequest;
  touched: TouchedNode[];
  /** Downstream dependents, sorted by hops then label. */
  affected: AffectedNode[];
  /** Affected nodes grouped by hop distance, ascending (ring layout source). */
  rings: AffectedNode[][];
  /** Edges of the focused impact graph (ripple only — not the whole map). */
  edges: ImpactRippleEdge[];
  /** Distinct cluster ids spanned by touched + affected. */
  clustersSpanned: string[];
  /** Resolved cluster labels for display. */
  clusterLabels: { id: string; label: string }[];
  maxHops: number;
  additions: number;
  deletions: number;
  risk: RiskLevel;
  /** Numeric 0..100 score behind the risk level (for the gauge). */
  riskScore: number;
}

/** Resolve the owning cluster id for a node id (node.parent may be a module). */
function resolveClusterId(
  id: string,
  nodeMap: Map<string, LighthouseNode>,
  clusterIdSet: Set<string>,
): string | null {
  // Direct cluster reference.
  if (clusterIdSet.has(id)) return id;
  let cur = nodeMap.get(id);
  // Walk parent chain until we hit a cluster id (guard against cycles).
  let guard = 0;
  while (cur && guard < 16) {
    if (clusterIdSet.has(cur.parent)) return cur.parent;
    const next = nodeMap.get(cur.parent);
    if (!next || next.id === cur.id) break;
    cur = next;
    guard += 1;
  }
  return null;
}

/**
 * Compute the blast radius for one PR.
 *
 * @param pr        the selected pull request
 * @param edges     full edge list (source depends on target)
 * @param nodes     full node list
 * @param clusters  full cluster list (for parent resolution + spanning count)
 */
export function computeBlastRadius(
  pr: PullRequest,
  edges: Edge[],
  nodes: LighthouseNode[],
  clusters: Cluster[],
): BlastRadius {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const clusterIdSet = new Set(clusters.map((c) => c.id));
  const clusterLabelMap = new Map(clusters.map((c) => [c.id, c.label]));

  const labelFor = (id: string): string =>
    nodeMap.get(id)?.label ?? clusterLabelMap.get(id) ?? id;

  // ── Touched set ─────────────────────────────────────────────────────────────
  const touchedIds = new Set(pr.touched.map((t) => t.node_id));
  const touched: TouchedNode[] = pr.touched.map((t) => ({
    id: t.node_id,
    label: labelFor(t.node_id),
    change: t.change,
    clusterId: resolveClusterId(t.node_id, nodeMap, clusterIdSet),
    resolved: nodeMap.has(t.node_id) || clusterIdSet.has(t.node_id),
  }));

  // ── Reverse adjacency: target -> [{ source, kind }] ─────────────────────────
  // (who depends on this node)
  const dependents = new Map<string, { source: string; kind: Edge['kind'] }[]>();
  for (const e of edges) {
    if (!dependents.has(e.target)) dependents.set(e.target, []);
    dependents.get(e.target)!.push({ source: e.source, kind: e.kind });
  }

  // ── Backward BFS to collect downstream dependents with hop distance ─────────
  const dist = new Map<string, number>();
  const viaKindMap = new Map<string, Edge['kind']>();
  const rippleEdges: ImpactRippleEdge[] = [];
  const seenEdge = new Set<string>();
  const queue: string[] = [];

  for (const id of touchedIds) {
    dist.set(id, 0);
    queue.push(id);
  }

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const curDist = dist.get(cur)!;
    for (const { source, kind } of dependents.get(cur) ?? []) {
      // Record the ripple edge (dependent -> what it relies on) once.
      const edgeKey = `${source}->${cur}`;
      if (!seenEdge.has(edgeKey)) {
        seenEdge.add(edgeKey);
        // Only draw edges that participate in the ripple toward touched nodes:
        // include if `cur` is touched or already discovered as affected.
        rippleEdges.push({ from: source, to: cur, kind });
      }
      if (!dist.has(source)) {
        dist.set(source, curDist + 1);
        viaKindMap.set(source, kind);
        queue.push(source);
      }
    }
  }

  // ── Affected = discovered minus touched ─────────────────────────────────────
  const affected: AffectedNode[] = [];
  for (const [id, hops] of dist) {
    if (touchedIds.has(id)) continue;
    affected.push({
      id,
      label: labelFor(id),
      hops,
      clusterId: resolveClusterId(id, nodeMap, clusterIdSet),
      viaKind: viaKindMap.get(id) ?? 'depends',
    });
  }
  affected.sort((a, b) => a.hops - b.hops || a.label.localeCompare(b.label));

  // Keep only ripple edges whose endpoints are both in scope (touched/affected).
  const inScope = new Set<string>([...touchedIds, ...affected.map((a) => a.id)]);
  const edgesInScope = rippleEdges.filter(
    (e) => inScope.has(e.from) && inScope.has(e.to),
  );

  // ── Rings by hop distance ───────────────────────────────────────────────────
  const maxHops = affected.reduce((m, a) => Math.max(m, a.hops), 0);
  const rings: AffectedNode[][] = [];
  for (let h = 1; h <= maxHops; h++) {
    rings.push(affected.filter((a) => a.hops === h));
  }

  // ── Clusters spanned ────────────────────────────────────────────────────────
  const clusterSet = new Set<string>();
  for (const t of touched) if (t.clusterId) clusterSet.add(t.clusterId);
  for (const a of affected) if (a.clusterId) clusterSet.add(a.clusterId);
  const clustersSpanned = [...clusterSet];
  const clusterLabels = clustersSpanned.map((id) => ({
    id,
    label: clusterLabelMap.get(id) ?? id,
  }));

  // ── Risk signal ─────────────────────────────────────────────────────────────
  const additions = pr.additions ?? 0;
  const deletions = pr.deletions ?? 0;
  const { risk, score } = scoreRisk({
    affectedCount: affected.length,
    clustersSpanned: clustersSpanned.length,
    maxHops,
    removed: touched.some((t) => t.change === 'removed'),
  });

  return {
    pr,
    touched,
    affected,
    rings,
    edges: edgesInScope,
    clustersSpanned,
    clusterLabels,
    maxHops,
    additions,
    deletions,
    risk,
    riskScore: score,
  };
}

/**
 * Risk model — deliberately simple and explainable to a reviewer.
 *
 * Weighted from the things that actually make a change scary:
 *   - how many modules it can break downstream (affected count)
 *   - how many feature areas it crosses (clusters spanned)
 *   - how deep the ripple goes (max hops)
 *   - whether it removes anything (removals break callers hardest)
 */
function scoreRisk(input: {
  affectedCount: number;
  clustersSpanned: number;
  maxHops: number;
  removed: boolean;
}): { risk: RiskLevel; score: number } {
  const { affectedCount, clustersSpanned, maxHops, removed } = input;
  // Saturating contributions, capped so a single dimension can't dominate.
  const affScore = Math.min(45, affectedCount * 9); // ~5 dependents → 45
  const clusterScore = Math.min(30, Math.max(0, clustersSpanned - 1) * 12); // each extra area
  const depthScore = Math.min(15, maxHops * 6);
  const removalScore = removed ? 10 : 0;
  const score = Math.min(100, affScore + clusterScore + depthScore + removalScore);

  let risk: RiskLevel = 'low';
  if (score >= 55) risk = 'high';
  else if (score >= 25) risk = 'medium';
  return { risk, score };
}

/** One-line, human reason behind the risk level for the summary card. */
export function riskRationale(b: BlastRadius): string {
  if (b.affected.length === 0) {
    return b.touched.some((t) => t.change === 'removed')
      ? 'Removes code, but nothing in the map depends on it.'
      : 'Self-contained — no mapped modules depend on what changed.';
  }
  const areas = b.clustersSpanned.length;
  const depth = b.maxHops > 1 ? `, ${b.maxHops} hops deep` : '';
  return `${b.affected.length} module${b.affected.length === 1 ? '' : 's'} downstream across ${areas} area${
    areas === 1 ? '' : 's'
  }${depth}.`;
}
