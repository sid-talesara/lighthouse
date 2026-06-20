import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';
import type { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk-api';

const elk = new ELK();

/**
 * Approximate rendered sizes per node kind. elk needs leaf sizes up front;
 * group (container) sizes are computed by elk from their children + padding.
 */
const LEAF_SIZE: Record<string, { w: number; h: number }> = {
  cluster: { w: 248, h: 132 }, // collapsed cluster card
  module: { w: 230, h: 116 }, // collapsed module card
  file: { w: 210, h: 70 },
};

// Header height reserved inside an expanded group before its children begin.
const GROUP_HEADER: Record<string, number> = {
  cluster: 64,
  module: 56,
};

const layoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '90',
  'elk.spacing.nodeNode': '52',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.padding': '[top=28,left=28,bottom=28,right=28]',
};

interface ChildMap {
  [parentId: string]: Node[];
}

/**
 * Run elkjs over the parent/child node forest and return new nodes with
 * absolute (top-level) / relative (child) positions, matching React Flow's
 * convention where child positions are relative to their parent.
 */
export async function layoutGraph(
  nodes: Node[],
  edges: Edge[],
): Promise<Node[]> {
  if (nodes.length === 0) return nodes;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf: ChildMap = {};
  const roots: Node[] = [];
  for (const n of nodes) {
    if (n.parentId && byId.has(n.parentId)) {
      (childrenOf[n.parentId] ??= []).push(n);
    } else {
      roots.push(n);
    }
  }

  const toElk = (node: Node): ElkNode => {
    const kids = childrenOf[node.id] ?? [];
    const kind = (node.type ?? 'file') as string;
    if (kids.length > 0) {
      return {
        id: node.id,
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'DOWN',
          'elk.padding': `[top=${GROUP_HEADER[kind] ?? 40},left=20,bottom=20,right=20]`,
          'elk.spacing.nodeNode': '26',
          'elk.layered.spacing.nodeNodeBetweenLayers': '34',
        },
        children: kids.map(toElk),
      };
    }
    const size = LEAF_SIZE[kind] ?? LEAF_SIZE.file;
    return { id: node.id, width: size.w, height: size.h };
  };

  // Only edges between top-level (root) nodes participate in the root layout;
  // nested edges are uncommon in this data and would over-constrain groups.
  const rootIds = new Set(roots.map((r) => r.id));
  const elkEdges: ElkExtendedEdge[] = edges
    .filter((e) => rootIds.has(e.source) && rootIds.has(e.target))
    .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] }));

  const graph: ElkNode = {
    id: 'root',
    layoutOptions,
    children: roots.map(toElk),
    edges: elkEdges,
  };

  const result = await elk.layout(graph);

  const out: Node[] = [];
  const walk = (elkNode: ElkNode, parent: Node | null) => {
    const original = byId.get(elkNode.id);
    if (original && elkNode.id !== 'root') {
      const width = elkNode.width;
      const height = elkNode.height;
      const isGroup = !!(elkNode.children && elkNode.children.length > 0);
      out.push({
        ...original,
        position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
        // Give expanded groups an explicit size so the container renders large.
        ...(isGroup && width && height
          ? { style: { ...original.style, width, height } }
          : {}),
      });
    }
    if (elkNode.children) {
      for (const child of elkNode.children) {
        walk(child, original ?? parent);
      }
    }
  };
  walk(result, null);

  return out;
}
