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
  return (
    <div
      onClick={() => d.onSelect(d.isSelected ? null : id)}
      style={{
        minWidth: 150,
        maxWidth: 200,
        background: '#FFFFFF',
        border: d.isSelected
          ? '1.5px solid #2C84E0'
          : '1px solid #BFC1B7',
        borderRadius: 6,
        padding: '10px 14px 10px 18px',
        position: 'relative',
        overflow: 'hidden',
        opacity: d.isDimmed ? 0.25 : 1,
        transition: 'opacity 150ms ease-out, border-color 120ms ease-out',
        boxShadow: d.isSelected ? '0 0 0 3px rgba(44,132,224,0.15)' : 'none',
        cursor: 'pointer',
        fontFamily: '"Nunito", system-ui, sans-serif',
      }}
    >
      {/* left accent stripe */}
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
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#151515',
          lineHeight: 1.3,
          wordBreak: 'break-word',
        }}
      >
        {d.label}
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
      width: 170,
      height: 60,
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
  const layoutDoneRef = useRef(false);

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
    runElkLayout(rawNodes, rawEdges).then((laidOut) => {
      setNodes(laidOut);
      setEdges(rawEdges);
      layoutDoneRef.current = true;
      // Fit after a tick so RF measures node sizes
      requestAnimationFrame(() => {
        fitView({ padding: 0.12, duration: 600 } as FitViewOptions);
      });
    });
  }, [rawNodes, rawEdges, setNodes, setEdges, fitView]);

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
        fitViewOptions={{ padding: 0.12, duration: 600 }}
        minZoom={0.15}
        maxZoom={2.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
        style={{
          background: '#E8E9E2',
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#BFC1B7"
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
