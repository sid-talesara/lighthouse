import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  useReactFlow,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';

import type { LighthouseData } from '../types/lighthouse';
import {
  buildIndex,
  buildVisibleGraph,
  type GraphIndex,
} from '../lib/graph';
import { layoutGraph } from '../lib/layout';
import { ClusterNode } from './nodes/ClusterNode';
import { ModuleNode } from './nodes/ModuleNode';
import { FileNode } from './nodes/FileNode';

const nodeTypes = {
  cluster: ClusterNode,
  module: ModuleNode,
  file: FileNode,
};

// Per-node-kind accent colors (mirror the left stripe on the cards). Used to
// tint connected edges on hover and to color minimap dots.
const NODE_ACCENT: Record<string, string> = {
  cluster: '#F54E00', // page red
  module: '#2C84E0', // blue
  file: '#DC9300', // amber
};
const EDGE_QUIET = '#BFC1B7';

// ease-in-out quad — used for the gentle viewport fly-ins.
const easeInOutQuad = (t: number) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
// ease-out cubic — used when reframing after an expand.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function MapCanvasInner({
  data,
  selectedNodeId,
  highlightedNodeIds,
  onSelectNode,
}: MapCanvasProps) {
  const index: GraphIndex = useMemo(() => buildIndex(data), [data]);

  // Expansion state — the spine of the zoom levels. Lives here; App reads the
  // selection/highlight seams instead.
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  // Which node the cursor is over — drives edge emphasis/dimming.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { fitView, setCenter, getNode, getZoom } = useReactFlow();
  const layoutToken = useRef(0);
  const didInitialFit = useRef(false);

  // Rebuild + re-layout whenever the visible structure changes. Selection /
  // highlight changes also rebuild (cheap) so node data stays in sync, but
  // they don't move anything because positions come from the same elk pass.
  useEffect(() => {
    const { nodes: logical, edges: nextEdges } = buildVisibleGraph(data, index, {
      expandedClusters,
      expandedModules,
      selectedNodeId,
      highlightedNodeIds,
    });

    const token = ++layoutToken.current;
    let cancelled = false;
    void layoutGraph(logical, nextEdges).then((positioned) => {
      if (cancelled || token !== layoutToken.current) return;
      setNodes(positioned);
      setEdges(nextEdges);
    });
    return () => {
      cancelled = true;
    };
  }, [data, index, expandedClusters, expandedModules, selectedNodeId, highlightedNodeIds]);

  // Edge emphasis: on hover (or when a node is highlighted) light up the
  // connected edges in the source node's accent color and dim the rest. This
  // runs cheaply in render off the base edges + hoveredId; the highlight-set
  // styling from graph.ts stays as the floor for "lit path" edges.
  const styledEdges = useMemo<Edge[]>(() => {
    if (!hoveredId) return edges;
    const hoveredKind = getNode(hoveredId)?.type ?? 'module';
    const accent = NODE_ACCENT[hoveredKind] ?? '#2C84E0';
    return edges.map((e) => {
      const connected = e.source === hoveredId || e.target === hoveredId;
      const stroke = connected ? accent : EDGE_QUIET;
      return {
        ...e,
        animated: connected || e.animated,
        style: {
          ...e.style,
          stroke,
          strokeWidth: connected ? 2.5 : 1.5,
          opacity: connected ? 1 : 0.12,
          transition: 'stroke 150ms ease-out, opacity 150ms ease-out, stroke-width 150ms ease-out',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: stroke,
        },
      };
    });
  }, [edges, hoveredId, getNode]);

  // Gently refit the viewport after a structural expand/collapse (not on mere
  // selection changes). The structureKey drives this.
  const structureKey = useMemo(
    () => `${[...expandedClusters].sort().join(',')}|${[...expandedModules].sort().join(',')}`,
    [expandedClusters, expandedModules],
  );
  useEffect(() => {
    // Skip the very first run — initial fit is handled by onInit below.
    if (!didInitialFit.current) return;
    const t = setTimeout(() => {
      void fitView({ padding: 0.2, duration: 520, maxZoom: 1.4, ease: easeOutCubic });
    }, 80);
    return () => clearTimeout(t);
  }, [structureKey, fitView]);

  // On selection change, gently pan to bring the selected node into view while
  // KEEPING context — we don't zoom hard (that flings the rest of the map off
  // screen). We pan to center the node but clamp the zoom so neighbours stay
  // visible: never zoom past 1.15, and never zoom *in* from the current level
  // if the user is already comfortably reading. This preserves the map feel.
  useEffect(() => {
    if (!selectedNodeId) return;
    const t = setTimeout(() => {
      const node = getNode(selectedNodeId);
      if (!node) return;
      const w = (node.measured?.width ?? (node.width as number | undefined) ?? 220);
      const h = (node.measured?.height ?? (node.height as number | undefined) ?? 90);
      // Keep the user's current zoom (context-preserving), only nudging up to a
      // readable floor and capping the ceiling so we never over-zoom.
      const current = getZoom();
      const zoom = Math.min(1.15, Math.max(current, 0.75));
      void setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom,
        duration: 500,
      });
    }, 120);
    return () => clearTimeout(t);
  }, [selectedNodeId, nodes, getNode, getZoom, setCenter]);

  const toggleCluster = useCallback((id: string) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const collapseModulesOf = useCallback(
    (clusterId: string) => {
      const mods = index.modulesByCluster.get(clusterId) ?? [];
      const ids = new Set(mods.map((m) => m.id));
      setExpandedModules((prev) => {
        const next = new Set([...prev].filter((m) => !ids.has(m)));
        return next.size === prev.size ? prev : next;
      });
    },
    [index],
  );

  const toggleModule = useCallback((id: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_evt, node) => {
      onSelectNode(node.id);
      if (node.type === 'cluster') {
        const willExpand = !expandedClusters.has(node.id);
        toggleCluster(node.id);
        if (!willExpand) collapseModulesOf(node.id);
      } else if (node.type === 'module') {
        const data2 = node.data as { expandable?: boolean };
        if (data2.expandable) toggleModule(node.id);
      }
    },
    [expandedClusters, toggleCluster, toggleModule, collapseModulesOf, onSelectNode],
  );

  const onNodeMouseEnter: NodeMouseHandler = useCallback(
    (_evt, node) => setHoveredId(node.id),
    [],
  );
  const onNodeMouseLeave: NodeMouseHandler = useCallback(
    () => setHoveredId(null),
    [],
  );

  const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={styledEdges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      onPaneClick={onPaneClick}
      onInit={() => {
        // Frame the cluster graph nicely on first load with a gentle fly-in.
        // Higher maxZoom so cards are comfortably readable on landing (the old
        // 1.1 cap left them tiny on wide canvases).
        window.setTimeout(() => {
          void fitView({ padding: 0.18, duration: 600, maxZoom: 1.5, ease: easeInOutQuad });
          didInitialFit.current = true;
        }, 80);
      }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      fitView
      fitViewOptions={{ padding: 0.18, maxZoom: 1.5 }}
      defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
      minZoom={0.3}
      maxZoom={2.5}
      proOptions={{ hideAttribution: false }}
      className="lh-canvas"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={2.25} color="#B4B6AC" />
      <Controls
        showInteractive={false}
        showZoom
        showFitView
        position="bottom-left"
      />
      <MiniMap
        pannable
        zoomable
        nodeStrokeWidth={2}
        nodeColor={(n) => NODE_ACCENT[n.type ?? 'file'] ?? '#9B9C92'}
        nodeStrokeColor="transparent"
        nodeBorderRadius={3}
        maskColor="rgba(238,239,233,0.7)"
        maskStrokeColor="#BFC1B7"
        maskStrokeWidth={1}
        style={{ background: '#E8E9E2', border: '1px solid #BFC1B7', borderRadius: '6px' }}
      />
    </ReactFlow>
  );
}

export interface MapCanvasProps {
  data: LighthouseData;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  onSelectNode: (id: string | null) => void;
}

export function MapCanvas(props: MapCanvasProps) {
  return (
    <ReactFlowProvider>
      <MapCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
