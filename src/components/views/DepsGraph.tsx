/**
 * DepsGraph — graph-building and layout helper for DependenciesView.
 *
 * Responsibilities:
 *   - Convert LighthouseData (nodes + edges) into @xyflow/react nodes/edges
 *   - Auto-layout via elkjs (layered, left-to-right)
 *   - Provide the custom DepNode component (PostHog styling, kind accent stripe)
 *   - Export typed helpers used by DependenciesView
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
  ReactFlowProvider,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type FitViewOptions,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';

import type { LighthouseData, EdgeKind } from '../../types/lighthouse';
import type { ViewProps } from './viewContract';

// ─── constants ───────────────────────────────────────────────────────────────

const CLUSTER_ACCENT: Record<string, string> = {
  'agent-runtime': '#2C84E0',
  'sandbox-orchestration': '#7C44A6',
  'mcp-tooling': '#2C8C66',
  'api-data': '#DC9300',
  'web-client': '#F54E00',
  'realtime-collab': '#1078A3',
  'client-shells': '#CD4239',
};

const EDGE_COLORS: Record<EdgeKind, string> = {
  depends: '#7C44A6',
  calls:   '#2C84E0',
  imports: '#2C8C66',
};

const EDGE_DASH: Record<EdgeKind, string | undefined> = {
  depends: '6 3',
  calls:   undefined,
  imports: '4 2',
};

// ─── types ───────────────────────────────────────────────────────────────────

export interface DepNodeData extends Record<string, unknown> {
  label: string;
  parent: string;   // cluster id
  accent: string;
  isSelected: boolean;
  isDimmed: boolean;
  onSelect: (id: string | null) => void;
}

// ─── custom node component ────────────────────────────────────────────────────

function DepNodeComponent({ id, data }: NodeProps) {
  const d = data as DepNodeData;

  // Border: selected = ph-yellow, else darker olive #9B9C92 for legibility
  const borderColor = d.isSelected ? '#F7A501' : '#9B9C92';
  const borderWidth = d.isSelected ? '2px' : '1.5px';

  // Shadow: always-on soft shadow so white cards are visible on cream canvas;
  // selected adds a yellow focus ring
  const boxShadow = d.isSelected
    ? '0 1px 3px rgba(20,20,20,0.10), 0 1px 2px rgba(20,20,20,0.06), 0 0 0 3px rgba(247,165,1,0.25)'
    : '0 1px 3px rgba(20,20,20,0.10), 0 1px 2px rgba(20,20,20,0.06)';

  return (
    <div
      onClick={() => d.onSelect(d.isSelected ? null : id)}
      style={{
        minWidth: 180,
        maxWidth: 240,
        background: '#FFFFFF',
        border: `${borderWidth} solid ${borderColor}`,
        borderRadius: 6,
        padding: '10px 14px 10px 20px',
        position: 'relative',
        overflow: 'hidden',
        opacity: d.isDimmed ? 0.45 : 1,
        transition: 'opacity 150ms ease-out, border-color 120ms ease-out, box-shadow 120ms ease-out',
        boxShadow,
        cursor: 'pointer',
        fontFamily: '"Nunito", system-ui, sans-serif',
      }}
    >
      {/* left accent stripe — always present, color by cluster */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: d.accent,
          borderRadius: '6px 0 0 6px',
        }}
      />
      {/* node label */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#151515',
          lineHeight: 1.35,
          wordBreak: 'break-word',
          marginBottom: 2,
        }}
      >
        {d.label}
      </div>
      {/* cluster / path in mono */}
      <div
        style={{
          fontSize: 10,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          fontWeight: 400,
          color: '#6C6E63',
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {d.parent}
      </div>
      {/* react-flow connection handles — invisible */}
      <Handle type="target" position={Position.Left}  style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { depNode: DepNodeComponent };

// ─── elk layout ──────────────────────────────────────────────────────────────

const elk = new ELK();

async function runElkLayout(
  rawNodes: Node[],
  rawEdges: Edge[],
): Promise<Node[]> {
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    children: rawNodes.map((n) => ({
      id: n.id,
      width: 210,
      height: 70,
    })),
    edges: rawEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const laid = await elk.layout(elkGraph);
  return rawNodes.map((n) => {
    const found = laid.children?.find((c) => c.id === n.id);
    return found
      ? { ...n, position: { x: found.x ?? 0, y: found.y ?? 0 } }
      : n;
  });
}

// ─── graph builder hook ───────────────────────────────────────────────────────

function useDepGraph(
  data: LighthouseData,
  selectedNodeId: string | null,
  highlightedNodeIds: Set<string>,
  activeKinds: Set<EdgeKind>,
  onSelectNode: (id: string | null) => void,
  onHighlightNodes: (ids: Set<string>) => void,
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const layoutDoneRef = useRef(false);
  const didFitRef = useRef(false);

  // Stable callback so DepNodeComponent doesn't re-render on unrelated state
  const handleSelect = useCallback(
    (id: string | null) => {
      onSelectNode(id);
      if (id) {
        // Collect direct deps/dependents
        const connected = new Set<string>([id]);
        for (const e of data.edges) {
          if (e.source === id) connected.add(e.target);
          if (e.target === id) connected.add(e.source);
        }
        onHighlightNodes(connected);
      } else {
        onHighlightNodes(new Set());
      }
    },
    [data.edges, onSelectNode, onHighlightNodes],
  );

  // Build raw nodes/edges whenever data or filter changes
  const { rawNodes, rawEdges } = useMemo(() => {
    const rNodes: Node[] = data.nodes.map((n) => ({
      id: n.id,
      type: 'depNode',
      position: { x: 0, y: 0 },
      data: {
        label: n.label,
        parent: n.parent,
        accent: CLUSTER_ACCENT[n.parent] ?? '#BFC1B7',
        isSelected: false,
        isDimmed: false,
        onSelect: handleSelect,
      } as DepNodeData,
    }));

    const rEdges: Edge[] = data.edges
      .filter((e) => activeKinds.has(e.kind))
      .map((e, i) => ({
        id: `e-${e.source}-${e.target}-${i}`,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: EDGE_COLORS[e.kind],
          width: 12,
          height: 12,
        },
        style: {
          stroke: EDGE_COLORS[e.kind],
          strokeWidth: 1.5,
          strokeDasharray: EDGE_DASH[e.kind],
        },
        data: { kind: e.kind },
      }));

    return { rawNodes: rNodes, rawEdges: rEdges };
  }, [data.nodes, data.edges, activeKinds, handleSelect]);

  // Run elk layout once rawNodes/rawEdges change
  useLayoutEffect(() => {
    layoutDoneRef.current = false;
    didFitRef.current = false;
    runElkLayout(rawNodes, rawEdges).then((laidOut) => {
      setNodes(laidOut);
      setEdges(rawEdges);
      layoutDoneRef.current = true;
    });
  }, [rawNodes, rawEdges, setNodes, setEdges]);

  // Frame the graph only after React Flow has measured every node. The old
  // requestAnimationFrame(fitView) fired before measurement, so it framed an
  // unmeasured graph and the viewport stayed at the default zoom — leaving most
  // of the 31 nodes stacked/off-screen. Gate on nodesInitialized instead.
  useEffect(() => {
    if (didFitRef.current) return;
    if (!nodesInitialized || nodes.length === 0) return;
    fitView({ padding: 0.14, duration: 600, maxZoom: 1.1 } as FitViewOptions);
    didFitRef.current = true;
  }, [nodesInitialized, nodes.length, fitView]);

  // Recompute selection/dim visual state without re-running layout
  useEffect(() => {
    const hasHighlight = highlightedNodeIds.size > 0;
    setNodes((prev) =>
      prev.map((n) => {
        const isSelected = n.id === selectedNodeId;
        const isDimmed = hasHighlight && !highlightedNodeIds.has(n.id);
        return {
          ...n,
          data: {
            ...(n.data as DepNodeData),
            isSelected,
            isDimmed,
            onSelect: handleSelect,
          },
        };
      }),
    );

    setEdges((prev) =>
      prev.map((e) => {
        const kind = (e.data as { kind: EdgeKind }).kind;
        const isConnected =
          highlightedNodeIds.has(e.source) && highlightedNodeIds.has(e.target);
        const dimEdge = hasHighlight && !isConnected;
        return {
          ...e,
          style: {
            stroke: isConnected ? EDGE_COLORS[kind] : EDGE_COLORS[kind],
            strokeWidth: isConnected ? 2.5 : 1.5,
            strokeDasharray: EDGE_DASH[kind],
            opacity: dimEdge ? 0.12 : 1,
            transition: 'opacity 150ms ease-out',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: EDGE_COLORS[kind],
            width: isConnected ? 14 : 12,
            height: isConnected ? 14 : 12,
          },
        };
      }),
    );
  }, [selectedNodeId, highlightedNodeIds, handleSelect, setNodes, setEdges]);

  return { nodes, edges, onNodesChange, onEdgesChange };
}

// ─── legend ──────────────────────────────────────────────────────────────────

function EdgeLegend({
  activeKinds,
  onToggle,
  edgeCount,
  nodeCount,
}: {
  activeKinds: Set<EdgeKind>;
  onToggle: (k: EdgeKind) => void;
  edgeCount: number;
  nodeCount: number;
}) {
  const kinds: EdgeKind[] = ['depends', 'calls', 'imports'];
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: 12,
        zIndex: 10,
        background: '#FFFFFF',
        border: '1px solid #BFC1B7',
        borderRadius: 6,
        padding: '10px 14px',
        fontFamily: '"Nunito", system-ui, sans-serif',
        fontSize: 12,
        minWidth: 170,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#9B9C92',
          marginBottom: 8,
        }}
      >
        {nodeCount} modules · {edgeCount} edges
      </div>
      {kinds.map((k) => (
        <button
          key={k}
          onClick={() => onToggle(k)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            opacity: activeKinds.has(k) ? 1 : 0.35,
            transition: 'opacity 120ms ease-out',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 28,
              height: 2,
              background: EDGE_COLORS[k],
              borderRadius: 1,
              flexShrink: 0,
              ...(k !== 'calls'
                ? {
                    backgroundImage: `repeating-linear-gradient(90deg, ${EDGE_COLORS[k]} 0, ${EDGE_COLORS[k]} 4px, transparent 4px, transparent ${k === 'depends' ? '7px' : '6px'})`,
                    background: 'none',
                  }
                : {}),
            }}
          />
          <span style={{ color: '#4D4F46', fontWeight: 600, fontSize: 11 }}>
            {k}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── inner graph (needs ReactFlow context) ────────────────────────────────────

function DepsGraphInner({
  data,
  selectedNodeId,
  highlightedNodeIds,
  onSelectNode,
  onHighlightNodes,
}: ViewProps) {
  const [activeKinds, setActiveKinds] = useState<Set<EdgeKind>>(
    new Set(['depends', 'calls', 'imports']),
  );

  const toggleKind = useCallback((k: EdgeKind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        if (next.size > 1) next.delete(k); // keep at least 1
      } else {
        next.add(k);
      }
      return next;
    });
  }, []);

  const { nodes, edges, onNodesChange, onEdgesChange } = useDepGraph(
    data,
    selectedNodeId,
    highlightedNodeIds,
    activeKinds,
    onSelectNode,
    onHighlightNodes,
  );

  const visibleEdgeCount = useMemo(
    () => data.edges.filter((e) => activeKinds.has(e.kind)).length,
    [data.edges, activeKinds],
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.14, duration: 600, maxZoom: 1.0 }}
        minZoom={0.08}
        maxZoom={4}
        defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
        style={{
          background: '#E8E9E2',
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={2.5}
          color="#B4B6AC"
        />
        <Controls
          style={{
            background: '#FFFFFF',
            border: '1px solid #BFC1B7',
            borderRadius: 6,
            boxShadow: 'none',
          }}
        />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as DepNodeData | undefined;
            return d ? d.accent : '#BFC1B7';
          }}
          nodeStrokeColor="transparent"
          nodeBorderRadius={3}
          style={{
            background: '#E8E9E2',
            border: '1px solid #BFC1B7',
            borderRadius: 6,
          }}
          pannable
          zoomable
        />
      </ReactFlow>
      <EdgeLegend
        activeKinds={activeKinds}
        onToggle={toggleKind}
        edgeCount={visibleEdgeCount}
        nodeCount={data.nodes.length}
      />
    </div>
  );
}

// ─── public export ────────────────────────────────────────────────────────────

/**
 * DepsGraph — full dependency graph, PostHog-styled.
 * Must be used inside a container with explicit h/w (e.g. h-full w-full).
 */
export function DepsGraph(props: ViewProps) {
  return (
    <ReactFlowProvider>
      <DepsGraphInner {...props} />
    </ReactFlowProvider>
  );
}
