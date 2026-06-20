/**
 * ArchitectureView — Wave A wrapper around the existing MapCanvas.
 *
 * Wave B owns the MapCanvas redesign (see src/components/MapCanvas.tsx and
 * src/components/nodes/*). This wrapper just mounts it under the Architecture
 * tab and translates the shared ViewProps contract into MapCanvas's props.
 * Keep this thin — do not put map logic here.
 */

import { MapCanvas } from '../MapCanvas';
import type { ViewProps } from './viewContract';

export function ArchitectureView({
  data,
  selectedNodeId,
  highlightedNodeIds,
  onSelectNode,
  onOpenWiki,
  showWikiHint,
}: ViewProps) {
  return (
    <div className="relative h-full w-full">
      <MapCanvas
        data={data}
        selectedNodeId={selectedNodeId}
        highlightedNodeIds={highlightedNodeIds}
        onSelectNode={onSelectNode}
        onOpenWiki={onOpenWiki}
        showWikiHint={showWikiHint}
      />
    </div>
  );
}
