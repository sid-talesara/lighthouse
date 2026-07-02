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
  FlowStep,
  FunctionNode,
  LighthouseData,
  LighthouseNode,
  Service,
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
  /** Owning deployable service, if resolvable. */
  service: Service | undefined;
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
  serviceByModule?: Map<string, Service>,
): Participant[] {
  const seen = new Map<string, Participant>();
  flow.steps.forEach((step, i) => {
    if (seen.has(step.node)) return;
    const node = nodeById.get(step.node);
    const cluster = node ? clusterById.get(node.parent) : undefined;
    const service = serviceByModule?.get(step.node);
    seen.set(step.node, {
      id: step.node,
      label: node?.label ?? step.node,
      node,
      cluster,
      service,
      firstStep: i,
    });
  });
  return [...seen.values()];
}

// ─── Resolved step (everything the tour panel needs for one step) ─────────────

export interface ResolvedStep {
  /** Index in flow.steps. */
  index: number;
  /** Node id. */
  nodeId: string;
  /** Plain-language description from the flow data. */
  description: string;
  /** Optional drilldown details generated for zoomable onboarding flows. */
  zoom: FlowStep['zoom'];
  /** Resolved node (may be missing if data is sparse). */
  node: LighthouseNode | undefined;
  /** Display label for the module handling this step. */
  label: string;
  /** Owning cluster. */
  cluster: Cluster | undefined;
  /** Owning deployable service. */
  service: Service | undefined;
  /** Representative function for the module, if any. */
  fn: FunctionNode | undefined;
  /** Repo-relative file path, if known. */
  path: string | undefined;
  /** Repo-relative files that explain this specific step. */
  keyFiles: string[];
  /** Related graph ids that can be opened from the drilldown panel. */
  relatedNodes: { id: string; label: string }[];
  /** Stable accent color for this step's cluster. */
  color: string;
  /** True when this step stays on the same module as the previous step. */
  sameAsPrev: boolean;
  /** Inbound handoff verb (how the previous step reached this one). */
  inVerb: string | undefined;
  /** Outbound handoff verb (how this step reaches the next one). */
  outVerb: string | undefined;
  /** Label of the previous module (handoff source). */
  prevLabel: string | undefined;
  /** Label of the next module (handoff target). */
  nextLabel: string | undefined;
}

/**
 * Resolves every flow step into a fully-hydrated record the tour UI can render
 * without re-doing lookups. Keeps the map and the tour panel reading from the
 * exact same derived model so they can never disagree.
 */
export function resolveSteps(
  flow: Flow,
  model: FlowModel,
  edges: Edge[],
  functions: FunctionNode[] | undefined,
): ResolvedStep[] {
  return flow.steps.map((step, index) => {
    const node = model.nodeById.get(step.node);
    const cluster = node ? model.clusterById.get(node.parent) : undefined;
    const service = model.serviceByModule.get(step.node);
    const fn = pickFunctionForModule(functions, step.node);
    const relatedNodes = (step.zoom?.related_nodes ?? []).map((id) => ({
      id,
      label: model.nodeById.get(id)?.label ?? model.clusterById.get(id)?.label ?? id,
    }));
    const prev = index > 0 ? flow.steps[index - 1] : undefined;
    const next = index < flow.steps.length - 1 ? flow.steps[index + 1] : undefined;
    const prevNode = prev ? model.nodeById.get(prev.node) : undefined;
    const nextNode = next ? model.nodeById.get(next.node) : undefined;
    return {
      index,
      nodeId: step.node,
      description: step.description,
      zoom: step.zoom,
      node,
      label: node?.label ?? step.node,
      cluster,
      service,
      fn,
      path: step.zoom?.key_files?.[0] ?? node?.path ?? node?.key_files?.[0],
      keyFiles: step.zoom?.key_files?.length ? step.zoom.key_files : node?.key_files ?? [],
      relatedNodes,
      color: clusterColor(cluster?.id),
      sameAsPrev: !!prev && prev.node === step.node,
      inVerb: prev ? transitionVerb(prev.node, step.node, edges) : undefined,
      outVerb: next ? transitionVerb(step.node, next.node, edges) : undefined,
      prevLabel: prev ? prevNode?.label ?? prev.node : undefined,
      nextLabel: next ? nextNode?.label ?? next.node : undefined,
    };
  });
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
  /** node id → owning service (resolved via Service.module_ids). */
  serviceByModule: Map<string, Service>;
}

export function buildLookups(data: LighthouseData): FlowModel {
  const serviceByModule = new Map<string, Service>();
  for (const svc of data.services ?? []) {
    for (const mid of svc.module_ids ?? []) {
      // First service to claim a module wins (stable).
      if (!serviceByModule.has(mid)) serviceByModule.set(mid, svc);
    }
  }
  return {
    nodeById: new Map(data.nodes.map((n) => [n.id, n])),
    clusterById: new Map(data.clusters.map((c) => [c.id, c])),
    serviceByModule,
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
    return `Everything in this flow happens inside ${labels[0]}, across ${steps.length} steps.`;
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

  const mids = labels.length - 2;
  const through =
    mids > 0
      ? ` through ${mids} module${mids > 1 ? 's' : ''} in between,`
      : '';

  return `A request starts at ${first} and travels${through} ending at ${last} — ${labels.length} modules over ${steps.length} steps.`;
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
