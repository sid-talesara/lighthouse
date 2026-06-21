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
  PullRequestFile,
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

// ── Plain-English impact statement ──────────────────────────────────────────
// The 3-second takeaway shown at the top of the impact panel. Written so a
// first-time viewer immediately understands what the PR did and what to watch.

const STATUS_WORD: Record<PullRequest['status'], string> = {
  merged: 'merged',
  open: 'open',
  draft: 'draft',
};

const RISK_WORD: Record<RiskLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/**
 * Build the plain-language impact statement for a PR's blast radius.
 * Returns sentence fragments the view can style independently, plus a single
 * flat `text` for screen readers / fallbacks.
 */
export function plainEnglishImpact(b: BlastRadius): {
  lead: string;
  consequence: string;
  risk: RiskLevel;
  text: string;
} {
  const touchedCount = b.touched.length;
  const moduleWord = touchedCount === 1 ? 'module' : 'modules';
  const status = STATUS_WORD[b.pr.status];

  const lead = `${b.pr.id} "${b.pr.title}" (${status}, by ${b.pr.author}) changed ${touchedCount} ${moduleWord}.`;

  let consequence: string;
  if (b.affected.length === 0) {
    consequence = b.touched.some((t) => t.change === 'removed')
      ? 'Nothing in the map depends on what changed, but it removes code — double-check it is truly unused.'
      : 'Nothing else in the map depends on what changed, so this is a self-contained change.';
  } else {
    const depWord = b.affected.length === 1 ? 'module depends' : 'modules depend';
    const areas = b.clustersSpanned.length;
    const areaPhrase = areas > 1 ? ` across ${areas} feature areas` : '';
    consequence = `${b.affected.length} other ${depWord} on what changed${areaPhrase} — review those for breakage.`;
  }

  const text = `${lead} ${consequence} Risk: ${RISK_WORD[b.risk]}.`;
  return { lead, consequence, risk: b.risk, text };
}

// ── File-change map: resolve PR files → owning node → cluster ─────────────────
//
// A PR ships a list of changed *files* (pr.files). To review them visually we
// resolve each file path to the most specific owning node (longest path-prefix
// match), then to that node's cluster. This powers the CodeSee-style map: a
// tree of changed files grouped by feature area / module, color-coded by change.

/** A single changed file resolved to its owning node + cluster. */
export interface ResolvedFile {
  path: string;
  /** File name only (last path segment), for compact display. */
  name: string;
  change: ChangeKind;
  nodeId: string | null;
  nodeLabel: string | null;
  clusterId: string | null;
  clusterLabel: string;
}

/** Files belonging to one module, with per-change counts. */
export interface FileMapModule {
  nodeId: string | null;
  nodeLabel: string;
  files: ResolvedFile[];
  counts: Record<ChangeKind, number>;
}

/** Files belonging to one cluster (feature area), grouped by module. */
export interface FileMapCluster {
  clusterId: string | null;
  clusterLabel: string;
  modules: FileMapModule[];
  fileCount: number;
  counts: Record<ChangeKind, number>;
}

/** The full file-change map for a PR. */
export interface FileChangeMap {
  clusters: FileMapCluster[];
  totalFiles: number;
  counts: Record<ChangeKind, number>;
}

function emptyCounts(): Record<ChangeKind, number> {
  return { added: 0, modified: 0, removed: 0 };
}

/**
 * Resolve a repo-relative file path to its owning node via longest path-prefix
 * match. Falls back to null when no node owns a parent directory of the file.
 */
export function resolveFileToNode(
  filePath: string,
  nodes: LighthouseNode[],
): LighthouseNode | null {
  let best: LighthouseNode | null = null;
  let bestLen = -1;
  for (const n of nodes) {
    const p = n.path;
    if (!p || p === '.') continue;
    const prefix = p.endsWith('/') ? p : p + '/';
    if (filePath === p || filePath.startsWith(prefix)) {
      if (p.length > bestLen) {
        best = n;
        bestLen = p.length;
      }
    }
  }
  return best;
}

/**
 * Build the file-change map for a PR: each changed file resolved to its module +
 * cluster, grouped for a visual diff-map. Clusters and modules are sorted by
 * file count (busiest first) so the eye lands on the heaviest area.
 */
export function buildFileChangeMap(
  files: PullRequestFile[],
  nodes: LighthouseNode[],
  clusters: Cluster[],
): FileChangeMap {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const clusterIdSet = new Set(clusters.map((c) => c.id));
  const clusterLabelMap = new Map(clusters.map((c) => [c.id, c.label]));

  const resolved: ResolvedFile[] = files.map((f) => {
    const node = resolveFileToNode(f.path, nodes);
    const clusterId = node
      ? resolveClusterId(node.id, nodeMap, clusterIdSet)
      : null;
    return {
      path: f.path,
      name: f.path.split('/').pop() ?? f.path,
      change: f.change,
      nodeId: node?.id ?? null,
      nodeLabel: node?.label ?? null,
      clusterId,
      clusterLabel: clusterId ? clusterLabelMap.get(clusterId) ?? clusterId : 'Unmapped files',
    };
  });

  // Group: cluster → module → files.
  const byCluster = new Map<string, ResolvedFile[]>();
  for (const r of resolved) {
    const key = r.clusterId ?? '__none__';
    if (!byCluster.has(key)) byCluster.set(key, []);
    byCluster.get(key)!.push(r);
  }

  const clustersOut: FileMapCluster[] = [...byCluster.entries()].map(([key, clusterFiles]) => {
    const byModule = new Map<string, ResolvedFile[]>();
    for (const r of clusterFiles) {
      const mkey = r.nodeId ?? '__nomod__';
      if (!byModule.has(mkey)) byModule.set(mkey, []);
      byModule.get(mkey)!.push(r);
    }
    const modules: FileMapModule[] = [...byModule.entries()].map(([mkey, modFiles]) => {
      const counts = emptyCounts();
      for (const f of modFiles) counts[f.change] += 1;
      return {
        nodeId: mkey === '__nomod__' ? null : mkey,
        nodeLabel: mkey === '__nomod__' ? 'Other files' : modFiles[0].nodeLabel ?? mkey,
        files: modFiles,
        counts,
      };
    });
    modules.sort((a, b) => b.files.length - a.files.length || a.nodeLabel.localeCompare(b.nodeLabel));

    const counts = emptyCounts();
    for (const f of clusterFiles) counts[f.change] += 1;
    return {
      clusterId: key === '__none__' ? null : key,
      clusterLabel: key === '__none__' ? 'Unmapped files' : clusterLabelMap.get(key) ?? key,
      modules,
      fileCount: clusterFiles.length,
      counts,
    };
  });
  clustersOut.sort((a, b) => b.fileCount - a.fileCount || a.clusterLabel.localeCompare(b.clusterLabel));

  const counts = emptyCounts();
  for (const f of resolved) counts[f.change] += 1;

  return { clusters: clustersOut, totalFiles: resolved.length, counts };
}

// ── Recommended PRs: rank the high-impact "here's what mattered" entry points ──

export interface RankedPr {
  pr: PullRequest;
  blast: BlastRadius;
  /** Composite impact score (higher = more consequential). */
  score: number;
  /** Number of changed files (from pr.files), for display. */
  fileCount: number;
}

/**
 * Rank PRs by impact so the view can surface a few as "Recommended".
 *
 * Impact blends the things that make a change matter to a reviewer:
 *   - modules touched           (breadth of the change itself)
 *   - downstream dependents      (how far it ripples) — weighted highest
 *   - feature areas spanned      (cross-cutting changes are riskier)
 *   - additions + deletions      (raw churn, log-scaled so megadiffs don't dominate)
 *   - changed-file count         (surface area to review)
 */
export function rankRecommendedPrs(
  prs: PullRequest[],
  edges: Edge[],
  nodes: LighthouseNode[],
  clusters: Cluster[],
): RankedPr[] {
  const ranked: RankedPr[] = prs.map((pr) => {
    const blast = computeBlastRadius(pr, edges, nodes, clusters);
    const churn = (pr.additions ?? 0) + (pr.deletions ?? 0);
    const fileCount = pr.files?.length ?? 0;
    const score =
      blast.touched.length * 6 +
      blast.affected.length * 10 +
      Math.max(0, blast.clustersSpanned.length - 1) * 14 +
      Math.log10(churn + 1) * 12 +
      fileCount * 1.5 +
      (blast.touched.some((t) => t.change === 'removed') ? 8 : 0);
    return { pr, blast, score, fileCount };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/** Touched nodes grouped by their owning cluster (for the "What changed" list). */
export function groupTouchedByCluster(
  b: BlastRadius,
  clusterLabelMap: Map<string, string>,
): { clusterId: string | null; clusterLabel: string; items: TouchedNode[] }[] {
  const groups = new Map<string, TouchedNode[]>();
  for (const t of b.touched) {
    const key = t.clusterId ?? '__none__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return [...groups.entries()].map(([key, items]) => ({
    clusterId: key === '__none__' ? null : key,
    clusterLabel: key === '__none__' ? 'Other' : clusterLabelMap.get(key) ?? key,
    items,
  }));
}
