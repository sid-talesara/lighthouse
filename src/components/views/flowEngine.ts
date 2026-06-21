/**
 * flowEngine — pure geometry/derivation helpers shared by FlowTrace (the
 * animated SVG map) and SequenceRail (the synced sequence diagram).
 *
 * Everything here is deterministic and side-effect free so the two views stay
 * perfectly in sync from the same derived model. No React, no DOM.
 */

import type {
  Cluster,
  Edge,
  Flow,
  FunctionNode,
  LighthouseData,
  LighthouseNode,
} from '../../types/lighthouse';

// ─── Participants (deduped node sequence) ────────────────────────────────────

export interface Participant {
  /** Node id. */
  id: string;
  /** Display label (falls back to id when the node is missing). */
  label: string;
  /** Resolved node, if present in data.nodes. */
  node: LighthouseNode | undefined;
  /** Owning cluster, if resolvable. */
  cluster: Cluster | undefined;
  /** First step index at which this participant appears. */
  firstStep: number;
}

/**
 * The ordered, deduped list of participant nodes for a flow — i.e. the unique
 * modules the execution passes through, in the order they are first visited.
 */
export function deriveParticipants(
  flow: Flow,
  nodeById: Map<string, LighthouseNode>,
  clusterById: Map<string, Cluster>,
): Participant[] {
  const seen = new Map<string, Participant>();
  flow.steps.forEach((step, i) => {
    if (seen.has(step.node)) return;
    const node = nodeById.get(step.node);
    const cluster = node ? clusterById.get(node.parent) : undefined;
    seen.set(step.node, {
      id: step.node,
      label: node?.label ?? step.node,
      node,
      cluster,
      firstStep: i,
    });
  });
  return [...seen.values()];
}

// ─── Edge lookup ─────────────────────────────────────────────────────────────

/**
 * Returns the real edge connecting two nodes (in either direction) if one
 * exists, so the trace can prefer drawing genuine architecture edges over
 * synthetic connectors. Returns undefined when there is no edge — the caller
 * then draws a direct connector instead.
 */
export function findEdge(
  edges: Edge[],
  a: string,
  b: string,
): { edge: Edge; reversed: boolean } | undefined {
  for (const e of edges) {
    if (e.source === a && e.target === b) return { edge: e, reversed: false };
    if (e.source === b && e.target === a) return { edge: e, reversed: true };
  }
  return undefined;
}

// ─── Trace path (one segment per step transition) ────────────────────────────

export interface TraceSegment {
  /** Step index this segment leads INTO (the step that becomes active). */
  toStep: number;
  /** Participant index the transition starts from. */
  fromParticipant: number;
  /** Participant index the transition ends at. */
  toParticipant: number;
  /** Edge kind label if a real edge backs this segment, else 'flow'. */
  kind: string;
  /** True when backed by a genuine architecture edge. */
  real: boolean;
}

/**
 * Builds the path the pulse travels: one segment per transition between
 * consecutive steps. Self-transitions (a step on the same node as the previous)
 * are skipped — the pulse simply re-pops the same node.
 */
export function deriveTraceSegments(
  flow: Flow,
  participantIndex: Map<string, number>,
  edges: Edge[],
): TraceSegment[] {
  const segments: TraceSegment[] = [];
  for (let i = 1; i < flow.steps.length; i++) {
    const from = flow.steps[i - 1].node;
    const to = flow.steps[i].node;
    if (from === to) continue;
    const fp = participantIndex.get(from);
    const tp = participantIndex.get(to);
    if (fp === undefined || tp === undefined) continue;
    const hit = findEdge(edges, from, to);
    segments.push({
      toStep: i,
      fromParticipant: fp,
      toParticipant: tp,
      kind: hit ? hit.edge.kind : 'flow',
      real: !!hit,
    });
  }
  return segments;
}

// ─── Layout (focused graph positions) ────────────────────────────────────────

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface TraceLayout {
  width: number;
  height: number;
  points: LayoutPoint[];
  nodeR: number;
}

/**
 * Lays out participants for the map trace.
 *
 * Strategy: an arc / serpentine layout that reads left→right, top→bottom — it
 * keeps the visited order legible (so the pulse path doesn't cross itself for
 * typical 2–8 participant flows) while filling a wide canvas. For a single
 * participant it centers it.
 */
export function layoutTrace(
  count: number,
  width: number,
  height: number,
): TraceLayout {
  const nodeR = 30;
  const points: LayoutPoint[] = [];

  if (count <= 0) {
    return { width, height, points, nodeR };
  }
  if (count === 1) {
    points.push({ x: width / 2, y: height / 2 });
    return { width, height, points, nodeR };
  }

  // Choose a column count that yields a pleasant serpentine grid.
  const cols = Math.min(count, count <= 4 ? count : Math.ceil(Math.sqrt(count * 1.6)));
  const rows = Math.ceil(count / cols);

  const padX = 70;
  const padY = 64;
  const usableW = Math.max(1, width - padX * 2);
  const usableH = Math.max(1, height - padY * 2);
  const colGap = cols > 1 ? usableW / (cols - 1) : 0;
  const rowGap = rows > 1 ? usableH / (rows - 1) : 0;

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    let col = i % cols;
    // Serpentine: reverse direction on odd rows so the connector flows
    // continuously instead of snapping back across the whole canvas.
    if (row % 2 === 1) col = cols - 1 - col;
    const x = cols > 1 ? padX + col * colGap : width / 2;
    const y = rows > 1 ? padY + row * rowGap : height / 2;
    points.push({ x, y });
  }

  return { width, height, points, nodeR };
}

// ─── Function lookup for detail strip ────────────────────────────────────────

/**
 * Picks a representative function name for a module to surface in the detail
 * strip (best-effort flavor — first declared function for the module).
 */
export function pickFunctionForModule(
  functions: FunctionNode[] | undefined,
  moduleId: string,
): FunctionNode | undefined {
  if (!functions) return undefined;
  return functions.find((f) => f.module_id === moduleId);
}

// ─── Convenience: build all lookups at once ──────────────────────────────────

export interface FlowModel {
  nodeById: Map<string, LighthouseNode>;
  clusterById: Map<string, Cluster>;
}

export function buildLookups(data: LighthouseData): FlowModel {
  return {
    nodeById: new Map(data.nodes.map((n) => [n.id, n])),
    clusterById: new Map(data.clusters.map((c) => [c.id, c])),
  };
}

// ─── Stable color-per-cluster (for sequence lanes) ───────────────────────────

const LANE_PALETTE = [
  '#2C84E0', // blue
  '#2C8C66', // green
  '#7C44A6', // purple
  '#DC9300', // amber
  '#1078A3', // teal
  '#CD4239', // red
  '#6C6E63', // muted
];

/** Deterministic color for a cluster id, stable across renders. */
export function clusterColor(clusterId: string | undefined): string {
  if (!clusterId) return '#6C6E63';
  let h = 0;
  for (let i = 0; i < clusterId.length; i++) {
    h = (h * 31 + clusterId.charCodeAt(i)) >>> 0;
  }
  return LANE_PALETTE[h % LANE_PALETTE.length];
}

// ─── Flow one-liner synthesis ─────────────────────────────────────────────────

/**
 * Synthesizes a plain-English one-liner describing what the flow does end-to-end.
 * Format: "[first module] → ... → [last module]: [what changes hands]"
 * This tells the viewer the story before they start watching.
 */
export function synthesizeFlowOneLiner(
  flow: Flow,
  nodeById: Map<string, LighthouseNode>,
  clusterById: Map<string, Cluster>,
): string {
  const steps = flow.steps;
  if (steps.length === 0) return flow.name;

  // Build unique ordered module labels
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const step of steps) {
    const node = nodeById.get(step.node);
    const label = node?.label ?? step.node;
    if (!seen.has(step.node)) {
      seen.add(step.node);
      labels.push(label);
    }
  }

  if (labels.length === 1) {
    return `Everything happens in ${labels[0]}.`;
  }

  // First → last with cluster context
  const firstNode = nodeById.get(steps[0].node);
  const lastNode = nodeById.get(steps[steps.length - 1].node);
  const firstCluster = firstNode ? clusterById.get(firstNode.parent) : undefined;
  const lastCluster = lastNode ? clusterById.get(lastNode.parent) : undefined;

  const first = firstCluster
    ? `${firstNode?.label ?? steps[0].node} (${firstCluster.label})`
    : (firstNode?.label ?? steps[0].node);
  const last = lastCluster
    ? `${lastNode?.label ?? steps[steps.length - 1].node} (${lastCluster.label})`
    : (lastNode?.label ?? steps[steps.length - 1].node);

  return `From ${first} → through ${labels.length - 2 > 0 ? `${labels.length - 2} intermediate module${labels.length - 2 > 1 ? 's' : ''} →` : ''} ${last}. ${steps.length} steps total.`.replace(/→ \./g, '.');
}

// ─── Transition verb resolver ─────────────────────────────────────────────────

/**
 * Returns a human-readable transition verb for the handoff from one step to the
 * next, based on the edge kind (if a real edge exists) or a context heuristic.
 */
export function transitionVerb(
  fromNodeId: string | undefined,
  toNodeId: string | undefined,
  edges: Edge[],
): string {
  if (!fromNodeId || !toNodeId) return 'flows to';
  const hit = findEdge(edges, fromNodeId, toNodeId);
  if (!hit) return 'passes to';
  switch (hit.edge.kind) {
    case 'calls': return 'calls';
    case 'imports': return 'uses';
    case 'depends': return 'depends on';
    default: return 'sends to';
  }
}
