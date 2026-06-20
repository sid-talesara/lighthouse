import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
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

export interface MapCanvasProps {
  data: LighthouseData;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  onSelectNode: (id: string | null) => void;
}

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
  const { fitView } = useReactFlow();
  const layoutToken = useRef(0);

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

  // Gently refit the viewport after a structural expand/collapse (not on mere
  // selection changes). The structureKey drives this.
  const structureKey = useMemo(
    () => `${[...expandedClusters].sort().join(',')}|${[...expandedModules].sort().join(',')}`,
    [expandedClusters, expandedModules],
  );
  useEffect(() => {
    const t = setTimeout(() => {
      void fitView({ padding: 0.22, duration: 520 });
    }, 60);
    return () => clearTimeout(t);
  }, [structureKey, fitView]);

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

  const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      fitView
      fitViewOptions={{ padding: 0.22 }}
      minZoom={0.18}
      maxZoom={2.2}
      proOptions={{ hideAttribution: false }}
      className="lh-canvas"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#BFC1B7" />
      <Controls showInteractive={false} position="bottom-right" />
      <MiniMap
        pannable
        zoomable
        nodeStrokeWidth={2}
        nodeColor={(n) =>
          n.type === 'cluster' ? '#2C84E0' : n.type === 'module' ? '#1078A3' : '#9B9C92'
        }
        nodeStrokeColor="transparent"
        nodeBorderRadius={3}
        maskColor="rgba(238,239,233,0.7)"
        style={{ background: '#E8E9E2', border: '1px solid #BFC1B7', borderRadius: '6px' }}
      />
    </ReactFlow>
  );
}

export function MapCanvas(props: MapCanvasProps) {
  return (
    <ReactFlowProvider>
      <MapCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
