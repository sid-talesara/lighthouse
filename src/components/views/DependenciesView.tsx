/**
 * DependenciesView — Wave B: real directed dependency graph.
 *
 * Renders all nodes and edges from data as a PostHog-styled directed graph
 * using @xyflow/react + elkjs auto-layout (layered, left-to-right).
 *
 * Interaction contract:
 *   - Clicking a node calls onSelectNode(id) and pushes the node + its direct
 *     neighbors into onHighlightNodes, dimming everything else.
 *   - Incoming selectedNodeId / highlightedNodeIds are reflected in the graph
 *     (border highlight / opacity dim) without re-running layout.
 *   - Edge kinds (depends / calls / imports) can be toggled via the legend.
 */

import type { ViewProps } from './viewContract';
import { DepsGraph } from './DepsGraph';
import { OpenWikiOverlay } from './OpenWikiOverlay';

export function DependenciesView(props: ViewProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <DepsGraph {...props} />
      <OpenWikiOverlay
        data={props.data}
        selectedNodeId={props.selectedNodeId}
        onOpenWiki={props.onOpenWiki}
      />
    </div>
  );
}
