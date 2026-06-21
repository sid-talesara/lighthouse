/**
 * Shared view contract — Wave A foundation.
 *
 * All four top-level views (Architecture, Files, Dependencies, Flows) receive
 * the SAME props so they are swappable behind the view-switcher tab bar in
 * App.tsx. Wave B agents replace each view's internals but MUST keep this
 * exact props shape so App.tsx never needs to change.
 *
 * Contract:
 *   - data:                the full LighthouseData (repo, clusters, nodes,
 *                          edges, flows, sections). Read-only.
 *   - selectedNodeId:      the node currently selected anywhere in the app
 *                          (null when nothing is selected). A view should
 *                          reflect this selection if relevant.
 *   - highlightedNodeIds:  the set of node ids the app wants emphasised
 *                          (driven by section clicks AND by "ask the map"
 *                          LLM answers). A view should visually highlight
 *                          these if relevant.
 *   - onSelectNode:        call with a node id to select it (or null to
 *                          clear). App keeps the ReadingPanel + map in sync.
 *   - onHighlightNodes:    call with a Set of node ids to drive the global
 *                          highlight set (e.g. "show these 4 files").
 *
 * Every view is self-contained: it may render its own layout/empty-states,
 * but it owns no global state — all cross-view coordination flows through
 * these callbacks back up to App.tsx.
 */

import type { LighthouseData } from '../../types/lighthouse';
import type { GenerateModel } from '../../lib/generateOptions';

export interface ViewProps {
  /** The full dataset (read-only). */
  data: LighthouseData;
  /** The node id selected across the app, or null. */
  selectedNodeId: string | null;
  /** The set of node ids the app wants emphasised. */
  highlightedNodeIds: Set<string>;
  /** Select a node (or null to clear). */
  onSelectNode: (id: string | null) => void;
  /** Drive the global highlight set. */
  onHighlightNodes: (ids: Set<string>) => void;
  /** Open the rich module-wiki drawer for a node/cluster id. */
  onOpenWiki?: (id: string) => void;
  /** True until the user first opens a wiki — drives onboarding hints. */
  showWikiHint?: boolean;
  /** Repository path used by local Codex-backed query surfaces. */
  repoPath?: string;
  /** Local Codex model used by query surfaces. */
  model?: GenerateModel;
  /** Open the Ask tab with a contextual question from a diagram/detail surface. */
  onAskContext?: (question: string) => void;
}

/** The top-level views, in tab order. */
export type ViewId =
  | 'architecture'
  | 'wiki'
  | 'files'
  | 'dependencies'
  | 'flows'
  | 'changes'
  | 'services'
  | 'database'
  | 'functions';
