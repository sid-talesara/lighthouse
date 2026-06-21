/**
 * CallGraph — React Flow + ELK layered call graph for the Functions view.
 *
 * CRITICAL: NO transform/translate/scale on `.react-flow__node`.
 * All entrance animations target the INNER `.cg-node-inner` wrapper div.
 *
 * V2 changes:
 *  - Service-grouped layout: functions visually grouped into service swimlanes.
 *  - Cross-service edges emphasised (thicker, colored by source module).
 *  - Callers/callees highlighted on selection.
 *  - onSelectFn callback to drive the detail panel.
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
import type { FunctionNode, CallEdge, LighthouseNode, Service } from '../../types/lighthouse';

// ─── Module color palette ─────────────────────────────────────────────────────

const MODULE_COLORS: Record<string, string> = {
  mod_api_domain_controllers:   '#2C84E0',
  mod_execution_run_services:   '#7C44A6',
  mod_db_models:                '#DC9300',
  mod_execution_queues:         '#2C8C66',
  mod_execution_workers:        '#F54E00',
  mod_ai_step_generation:       '#1078A3',
  mod_ai_code_generation:       '#1078A3',
  mod_python_runner:            '#CD4239',
  mod_execution_artifacts:      '#6C6E63',
  mod_ws_server:                '#2C84E0',
  mod_recorder_engine:          '#DC9300',
  mod_extension_content:        '#7C44A6',
  mod_extension_background:     '#7C44A6',
  mod_ai_chat:                  '#1078A3',
  mod_ai_failure_healing:       '#CD4239',
  mod_frontend_test_management: '#2C84E0',
  mod_frontend_app_shell:       '#2C8C66',
  mod_public_api:               '#F54E00',
};

export function moduleColor(moduleId: string): string {
  return MODULE_COLORS[moduleId] ?? '#9B9C92';
}

const SERVICE_KIND_COLOR: Record<string, string> = {
  frontend: '#2C84E0',
  backend:  '#7C44A6',
  worker:   '#F54E00',
  realtime: '#2C8C66',
  gateway:  '#DC9300',
  db:       '#1078A3',
  external: '#CD4239',
  other:    '#9B9C92',
};

function svcColor(kind: string): string {
  return SERVICE_KIND_COLOR[kind] ?? '#9B9C92';
}

// ─── Custom function node ─────────────────────────────────────────────────────

interface CallNodeData extends Record<string, unknown> {
  fn: FunctionNode;
  moduleLabel: string;
  accentColor: string;
  state: 'default' | 'selected' | 'related' | 'dimmed';
}

type CallRFNode = RFNode<CallNodeData, 'callNode'>;

const NODE_WIDTH = 210;
const NODE_HEIGHT = 68;

function CallNodeComponent({ data }: NodeProps<CallRFNode>) {
  const { fn, moduleLabel, accentColor, state } = data;

  const borderColor =
    state === 'selected' ? '#2C84E0' :
    state === 'related'  ? accentColor :
    '#BFC1B7';

  const borderWidth =
    state === 'selected' || state === 'related' ? '1.5px' : '1px';

  const opacity = state === 'dimmed' ? 0.22 : 1;

  const shadow =
    state === 'selected' ? '0 0 0 3px rgba(44,132,224,0.18)' :
    state === 'related'  ? `0 0 0 2px ${accentColor}33` :
    'none';

  return (
    <div
      className="cg-node-inner"
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: '#FFFFFF',
        border: `${borderWidth} solid ${borderColor}`,
        borderRadius: 6,
        boxShadow: shadow,
        opacity,
        display: 'flex',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'opacity 150ms ease-out, border-color 120ms ease-out, box-shadow 120ms ease-out',
        position: 'relative',
      }}
    >
      {/* Left accent stripe — inner child only, never on node root */}
      <div style={{
        width: 4,
        minWidth: 4,
        background: accentColor,
        borderRadius: '6px 0 0 6px',
        flexShrink: 0,
      }} />

      {/* Content */}
      <div style={{
        flex: 1,
        padding: '7px 9px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 3,
        overflow: 'hidden',
        minWidth: 0,
      }}>
        {/* Function name */}
        <div style={{
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          fontSize: 11,
          fontWeight: 500,
          color: '#151515',
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }} title={fn.name}>
          {fn.name}
        </div>

        {/* Signature (optional) */}
        {fn.signature && (
          <div style={{
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 9,
            color: '#9B9C92',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }} title={fn.signature}>
            {fn.signature}
          </div>
        )}

        {/* Module label */}
        <div style={{
          fontFamily: '"Nunito", system-ui, sans-serif',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: accentColor,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }} title={moduleLabel}>
          {moduleLabel}
        </div>
      </div>
    </div>
  );
}

// ─── Service group node (swimlane header) ─────────────────────────────────────

interface ServiceGroupData extends Record<string, unknown> {
  label: string;
  kind: string;
  color: string;
  fnCount: number;
}

type ServiceGroupRFNode = RFNode<ServiceGroupData, 'serviceGroup'>;

function ServiceGroupComponent({ data }: NodeProps<ServiceGroupRFNode>) {
  const { label, kind, color, fnCount } = data;
  return (
    <div style={{
      width: '100%',
      height: '100%',
      border: `1.5px dashed ${color}55`,
      borderRadius: 10,
      background: `${color}07`,
      pointerEvents: 'none',
      position: 'relative',
    }}>
      {/* Label at top-left */}
      <div style={{
        position: 'absolute',
        top: 8,
        left: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: '"Nunito", system-ui, sans-serif',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: color,
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 9,
          color: `${color}99`,
          marginLeft: 2,
        }}>
          {kind} · {fnCount} fn
        </span>
      </div>
    </div>
  );
}

const NODE_TYPES = {
  callNode: CallNodeComponent,
  serviceGroup: ServiceGroupComponent,
};

// ─── ELK layout — service-grouped ────────────────────────────────────────────

const elk = new ELK();

const GROUP_PADDING = { top: 40, right: 24, bottom: 24, left: 24 };

async function computeServiceGroupedLayout(
  functions: FunctionNode[],
  calls: CallEdge[],
  moduleToService: Map<string, Service | null>,
  _serviceList: Service[],
): Promise<{
  fnPositions: Map<string, { x: number; y: number }>;
  groupBounds: Map<string, { x: number; y: number; width: number; height: number }>;
}> {
  // Build service → functions mapping
  const svcFns = new Map<string, FunctionNode[]>();
  const noServiceFns: FunctionNode[] = [];

  for (const fn of functions) {
    const svc = moduleToService.get(fn.module_id);
    if (svc) {
      if (!svcFns.has(svc.id)) svcFns.set(svc.id, []);
      svcFns.get(svc.id)!.push(fn);
    } else {
      noServiceFns.push(fn);
    }
  }

  // Add "ungrouped" pseudo-service if needed
  if (noServiceFns.length > 0) {
    svcFns.set('__ungrouped__', noServiceFns);
  }

  const fnIdSet = new Set(functions.map((f) => f.id));

  // Build a compound ELK graph with one child per service group
  const groups = [...svcFns.entries()];

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.padding': `[top=${GROUP_PADDING.top},right=${GROUP_PADDING.right},bottom=${GROUP_PADDING.bottom},left=${GROUP_PADDING.left}]`,
    },
    children: groups.map(([svcId, fns]) => ({
      id: `grp_${svcId}`,
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': '28',
        'elk.layered.spacing.nodeNodeBetweenLayers': '40',
        'elk.padding': `[top=${GROUP_PADDING.top},right=${GROUP_PADDING.right},bottom=${GROUP_PADDING.bottom},left=${GROUP_PADDING.left}]`,
      },
      children: fns.map((fn) => ({
        id: fn.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })),
    })),
    edges: calls
      .filter((c) => fnIdSet.has(c.from) && fnIdSet.has(c.to))
      .map((c, i) => ({
        id: `e${i}`,
        sources: [c.from],
        targets: [c.to],
      })),
  };

  const laid = await elk.layout(graph);

  const fnPositions = new Map<string, { x: number; y: number }>();
  const groupBounds = new Map<string, { x: number; y: number; width: number; height: number }>();

  for (const grp of laid.children ?? []) {
    const gx = grp.x ?? 0;
    const gy = grp.y ?? 0;
    const gw = grp.width ?? 400;
    const gh = grp.height ?? 300;

    const svcId = (grp.id as string).replace(/^grp_/, '');
    groupBounds.set(svcId, { x: gx, y: gy, width: gw, height: gh });

    for (const child of grp.children ?? []) {
      if (child.x != null && child.y != null) {
        fnPositions.set(child.id as string, {
          x: gx + (child.x ?? 0),
          y: gy + (child.y ?? 0),
        });
      }
    }
  }

  return { fnPositions, groupBounds };
}

// ─── Inner graph ──────────────────────────────────────────────────────────────

interface CallGraphInnerProps {
  functions: FunctionNode[];
  calls: CallEdge[];
  nodeMap: Map<string, LighthouseNode>;
  services: Service[];
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  onSelectNode: (id: string | null) => void;
  onHighlightNodes: (ids: Set<string>) => void;
  onSelectFn: (fn: FunctionNode | null) => void;
  selectedFnId: string | null;
  setSelectedFnId: (id: string | null) => void;
}

function CallGraphInner({
  functions,
  calls,
  nodeMap,
  services,
  selectedNodeId,
  onSelectNode,
  onHighlightNodes,
  onSelectFn,
  selectedFnId,
  setSelectedFnId,
}: CallGraphInnerProps) {
  const { fitView } = useReactFlow();
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  const layoutDone = useRef(false);
  // Track the sorted fn-id string so we can re-layout when the visible set changes
  const layoutKey = useRef<string>('');

  // Build service lookup: module_id → Service
  const moduleToService = useMemo(() => {
    const m = new Map<string, Service | null>();
    for (const fn of functions) {
      const svc = services.find((s) => s.module_ids?.includes(fn.module_id)) ?? null;
      m.set(fn.module_id, svc);
    }
    return m;
  }, [functions, services]);

  // Caller/callee maps
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

  const relatedFnIds = useMemo(() => {
    if (!selectedFnId) return new Set<string>();
    const callers = callersOf.get(selectedFnId) ?? new Set<string>();
    const callees = calleesOf.get(selectedFnId) ?? new Set<string>();
    return new Set([selectedFnId, ...callers, ...callees]);
  }, [selectedFnId, callersOf, calleesOf]);

  const moduleEmphasisFnIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    return new Set(functions.filter((f) => f.module_id === selectedNodeId).map((f) => f.id));
  }, [selectedNodeId, functions]);

  const fnState = useCallback(
    (fnId: string): CallNodeData['state'] => {
      if (selectedFnId) {
        if (fnId === selectedFnId) return 'selected';
        if (relatedFnIds.has(fnId)) return 'related';
        return 'dimmed';
      }
      if (moduleEmphasisFnIds.size > 0) {
        return moduleEmphasisFnIds.has(fnId) ? 'selected' : 'dimmed';
      }
      return 'default';
    },
    [selectedFnId, relatedFnIds, moduleEmphasisFnIds],
  );

  const buildEdges = useCallback(
    (fnIdSet: Set<string>): RFEdge[] => {
      return calls
        .filter((c) => fnIdSet.has(c.from) && fnIdSet.has(c.to))
        .map((c, i) => {
          const srcFn = functions.find((f) => f.id === c.from);
          const tgtFn = functions.find((f) => f.id === c.to);
          const srcColor = moduleColor(srcFn?.module_id ?? '');

          // Cross-service call?
          const srcSvc = srcFn ? moduleToService.get(srcFn.module_id) : null;
          const tgtSvc = tgtFn ? moduleToService.get(tgtFn.module_id) : null;
          const isCrossService = srcSvc?.id !== tgtSvc?.id;

          const isRelated =
            !!selectedFnId &&
            (c.from === selectedFnId ||
              c.to === selectedFnId ||
              relatedFnIds.has(c.from) ||
              relatedFnIds.has(c.to));

          const dimmed =
            !!selectedFnId &&
            !relatedFnIds.has(c.from) &&
            !relatedFnIds.has(c.to);

          // Cross-service edges are thicker + accented even when not selected
          const strokeColor = isRelated
            ? srcColor
            : isCrossService
            ? `${srcColor}CC`
            : '#BFC1B7';

          const strokeWidth = isRelated
            ? 2.5
            : isCrossService
            ? 2
            : 1.2;

          return {
            id: `edge-${i}-${c.from}-${c.to}`,
            source: c.from,
            target: c.to,
            type: 'smoothstep',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: strokeColor,
              width: 10,
              height: 10,
            },
            style: {
              stroke: strokeColor,
              strokeWidth,
              opacity: dimmed ? 0.1 : isCrossService && !selectedFnId ? 0.75 : 1,
              strokeDasharray: isCrossService && !isRelated ? '5 3' : undefined,
              transition: 'opacity 150ms ease-out, stroke 150ms ease-out',
            },
            label: isCrossService && !selectedFnId ? '↔' : undefined,
            labelStyle: {
              fill: srcColor,
              fontSize: 10,
              fontWeight: 700,
            },
            labelBgStyle: {
              fill: 'transparent',
            },
          } as RFEdge;
        });
    },
    [calls, functions, selectedFnId, relatedFnIds, moduleToService],
  );

  // Run ELK layout whenever the set of visible functions changes
  useEffect(() => {
    const newKey = [...functions.map((f) => f.id)].sort().join(',');
    if (layoutDone.current && layoutKey.current === newKey) return;
    layoutDone.current = true;
    layoutKey.current = newKey;

    const fnIdSet = new Set(functions.map((f) => f.id));

    computeServiceGroupedLayout(functions, calls, moduleToService, services).then(
      ({ fnPositions, groupBounds }) => {
        // Build service group nodes (background swimlanes)
        const groupNodes: ServiceGroupRFNode[] = [];
        for (const [rawSvcId, bounds] of groupBounds.entries()) {
          const svc = services.find((s) => s.id === rawSvcId) ?? null;
          const color = svc ? svcColor(svc.kind) : '#9B9C92';
          const fnCount = functions.filter((f) => {
            if (rawSvcId === '__ungrouped__') {
              return !services.some((s) => s.module_ids?.includes(f.module_id));
            }
            return svc?.module_ids?.includes(f.module_id) ?? false;
          }).length;

          groupNodes.push({
            id: `grp_${rawSvcId}`,
            type: 'serviceGroup',
            position: { x: bounds.x, y: bounds.y },
            data: {
              label: svc?.name ?? 'Other',
              kind: svc?.kind ?? 'other',
              color,
              fnCount,
            } as ServiceGroupData,
            style: { width: bounds.width, height: bounds.height },
            selectable: false,
            draggable: false,
            zIndex: -1,
          });
        }

        // Build function nodes
        const fnNodes: CallRFNode[] = functions.map((fn) => {
          const pos = fnPositions.get(fn.id) ?? { x: 0, y: 0 };
          const lhNode = nodeMap.get(fn.module_id);
          const moduleLabel = lhNode?.label ?? fn.module_id;
          const accentColor = moduleColor(fn.module_id);
          return {
            id: fn.id,
            type: 'callNode' as const,
            position: pos,
            data: { fn, moduleLabel, accentColor, state: 'default' as const },
            selectable: false,
            draggable: true,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          };
        });

        setRfNodes([...groupNodes, ...fnNodes]);
        setRfEdges(buildEdges(fnIdSet));

        requestAnimationFrame(() => {
          const opts: FitViewOptions = {
            padding: 0.08,
            maxZoom: 0.85,
            duration: 600,
          };
          fitView(opts);
        });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [functions]);

  // Update node states on selection changes (no re-layout)
  useEffect(() => {
    const fnIdSet = new Set(functions.map((f) => f.id));
    setRfNodes((prev) =>
      prev.map((n) => {
        if (n.type !== 'callNode') return n;
        const fn = functions.find((f) => f.id === n.id);
        if (!fn) return n;
        const lhNode = nodeMap.get(fn.module_id);
        const moduleLabel = lhNode?.label ?? fn.module_id;
        const accentColor = moduleColor(fn.module_id);
        const state = fnState(fn.id);
        return { ...n, data: { fn, moduleLabel, accentColor, state } };
      }),
    );
    setRfEdges(buildEdges(fnIdSet));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFnId, selectedNodeId, functions]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: RFNode) => {
      if (node.type !== 'callNode') return;
      const fn = functions.find((f) => f.id === node.id);
      if (!fn) return;

      if (selectedFnId === fn.id) {
        setSelectedFnId(null);
        onSelectFn(null);
        onSelectNode(null);
        onHighlightNodes(new Set());
      } else {
        setSelectedFnId(fn.id);
        onSelectFn(fn);
        onSelectNode(fn.module_id);

        const callers = callersOf.get(fn.id) ?? new Set<string>();
        const callees = calleesOf.get(fn.id) ?? new Set<string>();
        const related = new Set([fn.id, ...callers, ...callees]);
        const moduleIds = new Set<string>();
        for (const fid of related) {
          const f = functions.find((x) => x.id === fid);
          if (f) moduleIds.add(f.module_id);
        }
        onHighlightNodes(moduleIds);
      }
    },
    [functions, selectedFnId, callersOf, calleesOf, onSelectFn, onSelectNode, onHighlightNodes, setSelectedFnId],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedFnId(null);
    onSelectFn(null);
    onSelectNode(null);
    onHighlightNodes(new Set());
  }, [onSelectFn, onSelectNode, onHighlightNodes, setSelectedFnId]);

  // Tooltip
  const [tooltip, setTooltip] = useState<{ fn: FunctionNode; x: number; y: number } | null>(null);

  const handleNodeMouseEnter = useCallback(
    (e: React.MouseEvent, node: RFNode) => {
      if (node.type !== 'callNode') return;
      const fn = functions.find((f) => f.id === node.id);
      if (fn?.summary) setTooltip({ fn, x: e.clientX, y: e.clientY });
    },
    [functions],
  );
  const handleNodeMouseLeave = useCallback(() => setTooltip(null), []);
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
        fitViewOptions={{ padding: 0.08, maxZoom: 0.85 }}
        minZoom={0.08}
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
          nodeColor={(n) => {
            if (n.type === 'serviceGroup') return (n.data as ServiceGroupData).color + '33';
            return moduleColor((n.data as CallNodeData).fn?.module_id ?? '');
          }}
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
        <div style={{
          position: 'fixed',
          left: tooltip.x + 14,
          top: tooltip.y - 8,
          background: '#23251D',
          color: '#EEEFE9',
          borderRadius: 4,
          padding: '6px 10px',
          fontSize: 11,
          maxWidth: 300,
          lineHeight: 1.5,
          pointerEvents: 'none',
          zIndex: 9999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}>
          {tooltip.fn.summary}
        </div>
      )}
    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

export interface CallGraphProps {
  functions: FunctionNode[];
  calls: CallEdge[];
  nodeMap: Map<string, LighthouseNode>;
  services: Service[];
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  onSelectNode: (id: string | null) => void;
  onHighlightNodes: (ids: Set<string>) => void;
  onSelectFn: (fn: FunctionNode | null) => void;
  selectedFnId: string | null;
  setSelectedFnId: (id: string | null) => void;
}

export function CallGraph(props: CallGraphProps) {
  return (
    <ReactFlowProvider>
      <CallGraphInner {...props} />
    </ReactFlowProvider>
  );
}
