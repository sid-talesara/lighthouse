/**
 * CallGraph — React Flow + ELK layered call graph for the Functions view.
 *
 * CRITICAL: NO transform/translate/scale on `.react-flow__node`.
 * All entrance animations target the INNER `.cg-node-inner` wrapper div.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
} from '@xyflow/react';
import type {
  Node as RFNode,
  Edge as RFEdge,
  NodeProps,
  FitViewOptions,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { FunctionNode, CallEdge, LighthouseNode } from '../../types/lighthouse';

// ─── Module color palette (by module_id suffix cluster) ──────────────────────

const MODULE_COLORS: Record<string, string> = {
  mod_api_domain_controllers:   '#2C84E0', // blue
  mod_execution_run_services:   '#7C44A6', // purple
  mod_db_models:                '#DC9300', // amber
  mod_execution_queues:         '#2C8C66', // green
  mod_execution_workers:        '#F54E00', // posthog red
  mod_ai_step_generation:       '#1078A3', // teal
  mod_ai_code_generation:       '#1078A3', // teal
  mod_python_runner:            '#CD4239', // semantic red
  mod_execution_artifacts:      '#6C6E63', // muted
  mod_ws_server:                '#2C84E0', // blue
  mod_recorder_engine:          '#DC9300', // amber
  mod_extension_content:        '#7C44A6', // purple
  mod_extension_background:     '#7C44A6', // purple
  mod_ai_chat:                  '#1078A3', // teal
  mod_ai_failure_healing:       '#CD4239', // red
  mod_frontend_test_management: '#2C84E0', // blue
  mod_frontend_app_shell:       '#2C8C66', // green
  mod_public_api:               '#F54E00', // posthog red
};

function moduleColor(moduleId: string): string {
  return MODULE_COLORS[moduleId] ?? '#9B9C92';
}

// ─── Custom node component ────────────────────────────────────────────────────

interface CallNodeData extends Record<string, unknown> {
  fn: FunctionNode;
  moduleLabel: string;
  accentColor: string;
  state: 'default' | 'selected' | 'related' | 'dimmed';
}

// Extend the RFNode type for our data
type CallRFNode = RFNode<CallNodeData, 'callNode'>;

const NODE_WIDTH = 220;
const NODE_HEIGHT = 72;

function CallNodeComponent({ data }: NodeProps<CallRFNode>) {
  const { fn, moduleLabel, accentColor, state } = data;

  const borderColor =
    state === 'selected'
      ? '#2C84E0'
      : state === 'related'
      ? accentColor
      : '#BFC1B7';

  const borderWidth =
    state === 'selected' || state === 'related' ? '1.5px' : '1px';

  const opacity = state === 'dimmed' ? 0.25 : 1;

  const shadow =
    state === 'selected'
      ? '0 0 0 3px rgba(44,132,224,0.18)'
      : state === 'related'
      ? `0 0 0 2px ${accentColor}33`
      : 'none';

  return (
    // INNER wrapper — all visual styles here, never on node root
    <div
      className="cg-node-inner"
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: '#ffffff',
        border: `${borderWidth} solid ${borderColor}`,
        borderRadius: 6,
        boxShadow: shadow,
        opacity,
        display: 'flex',
        overflow: 'hidden',
        cursor: 'pointer',
        transition:
          'opacity 150ms ease-out, border-color 120ms ease-out, box-shadow 120ms ease-out',
        position: 'relative',
      }}
    >
      {/* Left accent stripe — CRITICAL: inner child, not node root */}
      <div
        style={{
          width: 4,
          minWidth: 4,
          background: accentColor,
          borderRadius: '6px 0 0 6px',
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <div
        style={{
          flex: 1,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 3,
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {/* Function name */}
        <div
          style={{
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 11,
            fontWeight: 500,
            color: '#151515',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={fn.name}
        >
          {fn.name}
        </div>

        {/* Signature (optional) */}
        {fn.signature && (
          <div
            style={{
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              fontSize: 9,
              color: '#9B9C92',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={fn.signature}
          >
            {fn.signature}
          </div>
        )}

        {/* Module label badge */}
        <div
          style={{
            fontFamily: '"Nunito", system-ui, sans-serif',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: accentColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={moduleLabel}
        >
          {moduleLabel}
        </div>
      </div>
    </div>
  );
}

const NODE_TYPES = { callNode: CallNodeComponent };

// ─── ELK layout helper ───────────────────────────────────────────────────────

const elk = new ELK();

async function computeElkLayout(
  functions: FunctionNode[],
  calls: CallEdge[],
): Promise<Map<string, { x: number; y: number }>> {
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: functions.map((fn) => ({
      id: fn.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: calls
      .filter(
        (c) =>
          functions.some((f) => f.id === c.from) &&
          functions.some((f) => f.id === c.to),
      )
      .map((c, i) => ({
        id: `e${i}`,
        sources: [c.from],
        targets: [c.to],
      })),
  };

  const laid = await elk.layout(graph);
  const positions = new Map<string, { x: number; y: number }>();
  for (const child of laid.children ?? []) {
    if (child.x != null && child.y != null) {
      positions.set(child.id, { x: child.x, y: child.y });
    }
  }
  return positions;
}

// ─── Inner graph (needs ReactFlowProvider context) ───────────────────────────

interface CallGraphInnerProps {
  functions: FunctionNode[];
  calls: CallEdge[];
  nodeMap: Map<string, LighthouseNode>;
  selectedNodeId: string | null;        // module-level selection from parent
  highlightedNodeIds: Set<string>;      // module-level highlight from parent
  onSelectNode: (id: string | null) => void;
  onHighlightNodes: (ids: Set<string>) => void;
}

function CallGraphInner({
  functions,
  calls,
  nodeMap,
  selectedNodeId,
  onSelectNode,
  onHighlightNodes,
}: CallGraphInnerProps) {
  const { fitView } = useReactFlow();
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<CallRFNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  const [selectedFnId, setSelectedFnId] = useState<string | null>(null);
  const layoutDone = useRef(false);

  // Build sets for caller/callee lookup
  const callersOf = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of calls) {
      if (!m.has(c.to)) m.set(c.to, new Set());
      m.get(c.to)!.add(c.from);
    }
    return m;
  }, [calls]);

  const calleesOf = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of calls) {
      if (!m.has(c.from)) m.set(c.from, new Set());
      m.get(c.from)!.add(c.to);
    }
    return m;
  }, [calls]);

  // Compute which function nodes are "related" to the selection
  const relatedFnIds = useMemo(() => {
    if (!selectedFnId) return new Set<string>();
    const callers = callersOf.get(selectedFnId) ?? new Set();
    const callees = calleesOf.get(selectedFnId) ?? new Set();
    return new Set([selectedFnId, ...callers, ...callees]);
  }, [selectedFnId, callersOf, calleesOf]);

  // Determine node state
  const nodeState = useCallback(
    (fnId: string): CallNodeData['state'] => {
      if (!selectedFnId) {
        return 'default';
      }
      if (fnId === selectedFnId) return 'selected';
      if (relatedFnIds.has(fnId)) return 'related';
      return 'dimmed';
    },
    [selectedFnId, relatedFnIds],
  );

  // Also reflect incoming selectedNodeId (module-level) by emphasising matching fns
  const moduleEmphasisFnIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    return new Set(functions.filter((f) => f.module_id === selectedNodeId).map((f) => f.id));
  }, [selectedNodeId, functions]);

  // Build initial RF nodes (positions set after ELK)
  const buildNodes = useCallback(
    (positions: Map<string, { x: number; y: number }>): CallRFNode[] => {
      return functions.map((fn) => {
        const pos = positions.get(fn.id) ?? { x: 0, y: 0 };
        const lhNode = nodeMap.get(fn.module_id);
        const moduleLabel = lhNode?.label ?? fn.module_id;
        const accentColor = moduleColor(fn.module_id);

        // If a module is selected via architecture, emphasize its functions
        const state: CallNodeData['state'] =
          selectedFnId
            ? nodeState(fn.id)
            : moduleEmphasisFnIds.has(fn.id)
            ? 'selected'
            : 'default';

        return {
          id: fn.id,
          type: 'callNode' as const,
          position: pos,
          data: { fn, moduleLabel, accentColor, state },
          // No selectable default — we handle selection ourselves
          selectable: false,
          draggable: true,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        };
      });
    },
    [functions, nodeMap, selectedFnId, nodeState, moduleEmphasisFnIds],
  );

  const buildEdges = useCallback(
    (fnIds: Set<string>): RFEdge[] => {
      return calls
        .filter((c) => fnIds.has(c.from) && fnIds.has(c.to))
        .map((c, i) => {
          const srcColor = moduleColor(
            functions.find((f) => f.id === c.from)?.module_id ?? '',
          );

          const isRelated =
            selectedFnId &&
            (c.from === selectedFnId ||
              c.to === selectedFnId ||
              relatedFnIds.has(c.from) ||
              relatedFnIds.has(c.to));

          const dimmed =
            !!selectedFnId &&
            !relatedFnIds.has(c.from) &&
            !relatedFnIds.has(c.to);

          return {
            id: `edge-${i}-${c.from}-${c.to}`,
            source: c.from,
            target: c.to,
            type: 'smoothstep',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isRelated ? srcColor : '#BFC1B7',
              width: 10,
              height: 10,
            },
            style: {
              stroke: isRelated ? srcColor : '#BFC1B7',
              strokeWidth: isRelated ? 2.5 : 1.5,
              opacity: dimmed ? 0.12 : 1,
              transition: 'opacity 150ms ease-out, stroke 150ms ease-out',
            },
          } satisfies RFEdge;
        });
    },
    [calls, functions, selectedFnId, relatedFnIds],
  );

  // Run ELK on mount
  useEffect(() => {
    if (layoutDone.current) return;
    layoutDone.current = true;

    const fnIds = new Set(functions.map((f) => f.id));

    computeElkLayout(functions, calls).then((positions) => {
      setRfNodes(buildNodes(positions));
      setRfEdges(buildEdges(fnIds));

      // fitView after nodes are rendered
      requestAnimationFrame(() => {
        const opts: FitViewOptions = {
          padding: 0.12,
          maxZoom: 1.0,
          duration: 600,
        };
        fitView(opts);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only on mount

  // Update node states when selection changes (without re-running ELK)
  useEffect(() => {
    const fnIds = new Set(functions.map((f) => f.id));
    setRfNodes((prev) =>
      prev.map((n) => {
        const fn = functions.find((f) => f.id === n.id);
        if (!fn) return n;
        const lhNode = nodeMap.get(fn.module_id);
        const moduleLabel = lhNode?.label ?? fn.module_id;
        const accentColor = moduleColor(fn.module_id);

        const state: CallNodeData['state'] =
          selectedFnId
            ? nodeState(fn.id)
            : moduleEmphasisFnIds.has(fn.id)
            ? 'selected'
            : 'default';

        return { ...n, data: { fn, moduleLabel, accentColor, state } };
      }),
    );
    setRfEdges(buildEdges(fnIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFnId, selectedNodeId]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: RFNode) => {
      const fn = functions.find((f) => f.id === node.id);
      if (!fn) return;

      if (selectedFnId === fn.id) {
        // Deselect
        setSelectedFnId(null);
        onSelectNode(null);
        onHighlightNodes(new Set());
      } else {
        setSelectedFnId(fn.id);
        // Link to the owning module in the architecture view
        onSelectNode(fn.module_id);
        // Highlight all related function node ids (as module ids for cross-view context)
        const callers = callersOf.get(fn.id) ?? new Set<string>();
        const callees = calleesOf.get(fn.id) ?? new Set<string>();
        const related = new Set([fn.id, ...callers, ...callees]);
        // Convert function ids to module ids for architecture highlight
        const moduleIds = new Set<string>();
        for (const fid of related) {
          const f = functions.find((x) => x.id === fid);
          if (f) moduleIds.add(f.module_id);
        }
        onHighlightNodes(moduleIds);
      }
    },
    [functions, selectedFnId, callersOf, calleesOf, onSelectNode, onHighlightNodes],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedFnId(null);
    onSelectNode(null);
    onHighlightNodes(new Set());
  }, [onSelectNode, onHighlightNodes]);

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    fn: FunctionNode;
    x: number;
    y: number;
  } | null>(null);

  const handleNodeMouseEnter = useCallback(
    (e: React.MouseEvent, node: RFNode) => {
      const fn = functions.find((f) => f.id === node.id);
      if (fn?.summary) {
        setTooltip({ fn, x: e.clientX, y: e.clientY });
      }
    },
    [functions],
  );

  const handleNodeMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleNodeMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeMouseMove={handleNodeMouseMove}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1.0 }}
        minZoom={0.1}
        maxZoom={2}
        nodesFocusable={false}
        edgesFocusable={false}
        style={{ background: '#E8E9E2' }}
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
          nodeColor={(n) => moduleColor((n.data as CallNodeData).fn?.module_id ?? '')}
          nodeStrokeColor="transparent"
          nodeBorderRadius={3}
          style={{
            background: '#E8E9E2',
            border: '1px solid #BFC1B7',
            borderRadius: 6,
          }}
          maskColor="rgba(238,239,233,0.75)"
        />
      </ReactFlow>

      {/* Tooltip */}
      {tooltip?.fn.summary && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y - 8,
            background: '#23251D',
            color: '#EEEFE9',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 11,
            maxWidth: 280,
            lineHeight: 1.5,
            pointerEvents: 'none',
            zIndex: 9999,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          {tooltip.fn.summary}
        </div>
      )}
    </div>
  );
}

// ─── Public export (wraps in ReactFlowProvider) ───────────────────────────────

export interface CallGraphProps {
  functions: FunctionNode[];
  calls: CallEdge[];
  nodeMap: Map<string, LighthouseNode>;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  onSelectNode: (id: string | null) => void;
  onHighlightNodes: (ids: Set<string>) => void;
}

export function CallGraph(props: CallGraphProps) {
  return (
    <ReactFlowProvider>
      <CallGraphInner {...props} />
    </ReactFlowProvider>
  );
}
