/**
 * ErDiagram — ER diagram component for DatabaseView.
 *
 * Renders DbTable[] as React Flow nodes with elkjs layered layout.
 * FK relationships are drawn as directed edges.
 *
 * CRITICAL: NO transform/animation on .react-flow__node root.
 * All entrance/hover animations target the inner wrapper div only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';

import type { DbTable } from '../../types/lighthouse';

// ─── constants ────────────────────────────────────────────────────────────────

/** Width / height fed to ELK. Height is dynamic but we give ELK a fixed estimate. */
const NODE_WIDTH = 240;
/** Per-column row height in the card */
const COL_ROW_H = 22;
/** Header height for the table name */
const HEADER_H = 38;
/** Bottom padding */
const FOOTER_PAD = 10;

function tableNodeHeight(cols: number): number {
  return HEADER_H + cols * COL_ROW_H + FOOTER_PAD;
}

/** Accent colors per module; fall back to teal */
const MODULE_ACCENT: Record<string, string> = {
  mod_db_models:           '#2C84E0',  // blue
  mod_shared_contracts:    '#7C44A6',  // purple
  mod_execution_artifacts: '#2C8C66',  // green
  mod_recorder_engine:     '#DC9300',  // amber
  mod_public_api:          '#1078A3',  // teal
  mod_ai_chat:             '#F54E00',  // red-brand
  mod_ai_failure_healing:  '#CD4239',  // semantic red
};
const DEFAULT_ACCENT = '#9B9C92';

function accentFor(moduleId?: string): string {
  if (!moduleId) return DEFAULT_ACCENT;
  return MODULE_ACCENT[moduleId] ?? DEFAULT_ACCENT;
}

// ─── ELK layout ──────────────────────────────────────────────────────────────

const elk = new ELK();

async function runElkLayout(
  rawNodes: Node[],
  rawEdges: Edge[],
): Promise<Node[]> {
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': '70',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: rawNodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: n.data._height as number,
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
      ? { ...n, position: { x: found.x ?? 0, y: found.y ?? 0 }, width: NODE_WIDTH, height: n.data._height as number }
      : n;
  });
}

// ─── node data type ───────────────────────────────────────────────────────────

export interface TableNodeData extends Record<string, unknown> {
  table: DbTable;
  accent: string;
  isSelected: boolean;
  isDimmed: boolean;
  onSelect: (id: string) => void;
  /** Pre-computed for ELK */
  _height: number;
}

// ─── custom node component ────────────────────────────────────────────────────

/**
 * CRITICAL: The outer div rendered by React Flow (.react-flow__node) must NOT
 * have any transform/animation. We wrap all visual content in an inner div
 * ("innerWrapper") and apply entrance/hover animations there.
 */
function TableNodeComponent({ id, data }: NodeProps) {
  const d = data as TableNodeData;
  const { table, accent, isSelected, isDimmed, onSelect } = d;

  const borderColor = isSelected ? '#F7A501' : '#9B9C92';
  const borderWidth = isSelected ? '2px' : '1.5px';
  const boxShadow = isSelected
    ? '0 1px 3px rgba(20,20,20,0.10), 0 0 0 3px rgba(247,165,1,0.25)'
    : '0 1px 3px rgba(20,20,20,0.10)';

  return (
    // This outer div is what React Flow's node wrapper renders children into.
    // NO transform, NO animation here — React Flow owns the transform on the
    // .react-flow__node wrapper element above this.
    <div style={{ width: NODE_WIDTH }}>
      {/* ── inner wrapper: entrance + hover animation targets ── */}
      <div
        onClick={() => onSelect(id)}
        style={{
          width: NODE_WIDTH,
          background: '#FFFFFF',
          border: `${borderWidth} solid ${borderColor}`,
          borderRadius: 6,
          position: 'relative',
          overflow: 'hidden',
          opacity: isDimmed ? 0.35 : 1,
          transition:
            'opacity 150ms ease-out, border-color 120ms ease-out, box-shadow 120ms ease-out',
          boxShadow,
          cursor: 'pointer',
          fontFamily: '"Nunito", system-ui, sans-serif',
          // Entrance animation: opacity ONLY — never animate transform here.
          // React Flow measures node dimensions after mount via
          // getBoundingClientRect(); a CSS transform animation on the inner
          // wrapper corrupts those measurements and stacks every node at the
          // ELK-assigned position before the transform is resolved, causing
          // all nodes to appear at origin. Opacity is safe.
          animation: 'erNodeEntrance 220ms ease-out both',
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
            background: accent,
            borderRadius: '6px 0 0 6px',
          }}
        />

        {/* table name header */}
        <div
          style={{
            height: HEADER_H,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 16,
            paddingRight: 10,
            borderBottom: '1px solid #E5E7E0',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#151515',
              letterSpacing: '0.02em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {table.name}
          </span>
          {table.module_id && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: accent,
                background: accent + '18',
                borderRadius: 3,
                padding: '1px 5px',
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {table.module_id.replace('mod_', '')}
            </span>
          )}
        </div>

        {/* columns list */}
        <div style={{ paddingLeft: 12, paddingRight: 8 }}>
          {table.columns.map((col) => (
            <div
              key={col.name}
              style={{
                height: COL_ROW_H,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                borderBottom: '1px solid #F4F4F0',
              }}
            >
              {/* PK / FK badges */}
              {col.pk && (
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#DC9300',
                    background: '#FEF3C7',
                    borderRadius: 3,
                    padding: '1px 4px',
                    letterSpacing: '0.03em',
                    flexShrink: 0,
                  }}
                >
                  PK
                </span>
              )}
              {col.fk && !col.pk && (
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#1078A3',
                    background: '#DCEAF6',
                    borderRadius: 3,
                    padding: '1px 4px',
                    letterSpacing: '0.03em',
                    flexShrink: 0,
                  }}
                >
                  FK
                </span>
              )}
              {!col.pk && !col.fk && (
                <span style={{ width: 20, flexShrink: 0 }} />
              )}

              {/* column name */}
              <span
                style={{
                  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                  fontSize: 10,
                  color: '#23251D',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.name}
              </span>

              {/* type label */}
              <span
                style={{
                  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                  fontSize: 9,
                  color: '#9B9C92',
                  flexShrink: 0,
                }}
              >
                {col.type}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* React Flow connection handles — invisible but needed for edges */}
      <Handle type="target" position={Position.Top}    style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
    </div>
  );
}

const NODE_TYPES = { tableNode: TableNodeComponent };

// ─── main diagram ─────────────────────────────────────────────────────────────

interface ErDiagramInnerProps {
  tables: DbTable[];
  selectedTableId: string | null;
  onSelectTable: (id: string | null) => void;
}

function ErDiagramInner({ tables, selectedTableId, onSelectTable }: ErDiagramInnerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const fitDone = useRef(false);

  // Determine which ID drives dimming (hovered takes precedence over selected)
  const activeId = hoveredId ?? selectedTableId;
  const activeConnected = useMemo<Set<string>>(() => {
    if (!activeId) return new Set();
    const s = new Set<string>();
    for (const t of tables) {
      for (const col of t.columns) {
        if (col.fk) {
          if (t.id === activeId) s.add(col.fk);
          if (col.fk === activeId) s.add(t.id);
        }
      }
    }
    return s;
  }, [activeId, tables]);

  // Build raw nodes + edges, then layout
  useEffect(() => {
    if (tables.length === 0) {
      // Clear any stale nodes/edges (e.g. switching to an empty focus set).
      setNodes([]);
      setEdges([]);
      return;
    }

    const rawNodes: Node[] = tables.map((t) => ({
      id: t.id,
      type: 'tableNode',
      position: { x: 0, y: 0 },
      data: {
        table: t,
        accent: accentFor(t.module_id),
        isSelected: t.id === selectedTableId,
        isDimmed: false,
        onSelect: onSelectTable,
        _height: tableNodeHeight(t.columns.length),
      } satisfies TableNodeData,
    }));

    // Set of node ids that actually exist in this (possibly filtered) view.
    // In Focus mode the table set is a subset, so an FK may point at a table
    // that is NOT rendered. ELK rejects the whole graph if an edge references
    // a missing shape ("Referenced shape does not exist"), which blanks the
    // diagram. Only emit edges whose source AND target are both present.
    const presentIds = new Set(tables.map((t) => t.id));

    const rawEdges: Edge[] = [];
    for (const t of tables) {
      for (const col of t.columns) {
        if (col.fk && presentIds.has(col.fk)) {
          rawEdges.push({
            id: `${t.id}__${col.name}__${col.fk}`,
            source: t.id,
            target: col.fk,
            type: 'smoothstep',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#9B9C92',
              width: 10,
              height: 10,
            },
            style: { stroke: '#BFC1B7', strokeWidth: 1.5 },
            label: col.name,
            labelStyle: {
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              fontSize: 9,
              fill: '#9B9C92',
            },
            labelBgStyle: { fill: '#EEEFE9', fillOpacity: 0.85 },
            labelBgPadding: [3, 4] as [number, number],
            labelBgBorderRadius: 3,
          });
        }
      }
    }

    // Reset fitDone so the fitView effect fires after ELK positions arrive.
    fitDone.current = false;
    let cancelled = false;
    runElkLayout(rawNodes, rawEdges)
      .then((laid) => {
        if (cancelled) return;
        setNodes(laid);
        setEdges(rawEdges);
      })
      .catch((err) => {
        if (cancelled) return;
        // ELK can reject (e.g. a malformed graph). Don't leave the canvas
        // silently blank — fall back to un-laid-out nodes so the user still
        // sees the tables, and surface the cause for debugging.
        console.error('[ErDiagram] ELK layout failed, rendering unlaid nodes:', err);
        setNodes(rawNodes);
        setEdges(rawEdges);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables]);

  // Update node data reactively when selection / hover changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const isDimmed = !!activeId && n.id !== activeId && !activeConnected.has(n.id);
        return {
          ...n,
          data: {
            ...n.data,
            isSelected: n.id === selectedTableId,
            isDimmed,
          },
        };
      }),
    );
  }, [selectedTableId, activeId, activeConnected, setNodes]);

  // Update edge styles reactively
  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => {
        const isActive =
          activeId !== null &&
          (e.source === activeId || e.target === activeId);
        const isDimmed =
          activeId !== null && !isActive;

        const sourceTable = tables.find((t) => t.id === e.source);
        const accent = accentFor(sourceTable?.module_id);

        return {
          ...e,
          style: {
            stroke: isActive ? accent : '#BFC1B7',
            strokeWidth: isActive ? 2.5 : 1.5,
            opacity: isDimmed ? 0.15 : 1,
            transition: 'opacity 150ms ease-out, stroke 150ms ease-out',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isActive ? accent : '#9B9C92',
            width: 10,
            height: 10,
          },
        };
      }),
    );
  }, [activeId, tables, setEdges]);

  // fitView after ELK positions are applied and React Flow has measured nodes.
  // We use `nodes` (not just nodes.length) so the effect re-runs when the
  // same-length table set is replaced (e.g. focus mode switching).
  // `fitView` prop on <ReactFlow> is intentionally NOT set — it would fire on
  // the initial empty/unpositioned state (all nodes at {x:0,y:0}) before ELK
  // positions arrive, collapsing everything to origin.
  useEffect(() => {
    if (nodesInitialized && nodes.length > 0 && !fitDone.current) {
      fitDone.current = true;
      // Small delay lets React Flow finish the final layout paint before fitting.
      const id = requestAnimationFrame(() => {
        fitView({
          padding: 0.12,
          duration: 500,
          maxZoom: 1.0,
        });
      });
      return () => cancelAnimationFrame(id);
    }
  }, [nodesInitialized, nodes, fitView]);

  const handleNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoveredId(node.id);
  }, []);
  const handleNodeMouseLeave = useCallback(() => {
    setHoveredId(null);
  }, []);
  const handlePaneClick = useCallback(() => {
    onSelectTable(null);
  }, [onSelectTable]);

  return (
    <>
      {/* keyframe for inner wrapper entrance — opacity only.
          NEVER animate transform here: React Flow measures node dimensions
          via getBoundingClientRect() after mount. A transform animation
          corrupts those measurements and stacks all nodes at origin.
          Animate only opacity on the inner wrapper div. */}
      <style>{`
        @keyframes erNodeEntrance {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onPaneClick={handlePaneClick}
        minZoom={0.15}
        maxZoom={2.0}
        style={{ background: '#E8E9E2' }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
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
            const d = n.data as TableNodeData | undefined;
            return d?.accent ?? DEFAULT_ACCENT;
          }}
          nodeStrokeColor="transparent"
          nodeBorderRadius={3}
          bgColor="#E8E9E2"
          maskColor="rgba(238,239,233,0.7)"
          style={{
            background: '#E8E9E2',
            border: '1px solid #BFC1B7',
            borderRadius: 6,
          }}
        />
      </ReactFlow>
    </>
  );
}

// ─── public export ────────────────────────────────────────────────────────────

export interface ErDiagramProps {
  tables: DbTable[];
  selectedTableId: string | null;
  onSelectTable: (id: string | null) => void;
}

export function ErDiagram({ tables, selectedTableId, onSelectTable }: ErDiagramProps) {
  return (
    <ReactFlowProvider>
      <ErDiagramInner
        tables={tables}
        selectedTableId={selectedTableId}
        onSelectTable={onSelectTable}
      />
    </ReactFlowProvider>
  );
}
