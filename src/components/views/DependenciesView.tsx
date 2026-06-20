/**
 * DependenciesView — Wave A placeholder.
 *
 * Wave B owns this view: build the real dependency explorer here (e.g. a
 * directed adjacency view, dependency matrix, or "what imports X" panel from
 * data.edges). Keep the ViewProps contract intact — use onHighlightNodes to
 * light up a node's neighbours and onSelectNode for focus.
 *
 * For now it renders a styled preview list of edges grouped nowhere fancy —
 * just source → target with the edge kind — so the tab is informative.
 */

import { useMemo } from 'react';

import type { ViewProps } from './viewContract';
import { ViewPlaceholder } from './ViewPlaceholder';

export function DependenciesView({ data, onHighlightNodes }: ViewProps) {
  const labelOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of data.nodes) m.set(n.id, n.label);
    for (const c of data.clusters) m.set(c.id, c.label);
    return (id: string) => m.get(id) ?? id;
  }, [data.nodes, data.clusters]);

  return (
    <ViewPlaceholder
      emoji="🔗"
      title="Dependencies"
      blurb="Who imports who. Every edge in the graph, source to target. (Wave B will make this an interactive dependency explorer.)"
    >
      <div className="rounded-ph border border-ph-border bg-ph-surface">
        <div className="border-b border-ph-border-soft px-5 py-3 font-sans text-label uppercase tracking-wider text-ph-ash">
          {data.edges.length} edges
        </div>
        <ul>
          {data.edges.map((e, i) => (
            <li
              key={`${e.source}->${e.target}-${i}`}
              className="flex items-center gap-2 border-b border-ph-border-soft px-5 py-2.5 last:border-b-0"
            >
              <button
                onClick={() => onHighlightNodes(new Set([e.source, e.target]))}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                title="Highlight both nodes on the map"
              >
                <span className="truncate font-sans text-body-sm font-semibold text-ph-ink">
                  {labelOf(e.source)}
                </span>
                <span className="shrink-0 font-mono text-code text-ph-ash">→</span>
                <span className="truncate font-sans text-body-sm font-semibold text-ph-ink">
                  {labelOf(e.target)}
                </span>
              </button>
              <span className="shrink-0 rounded-ph-pill bg-ph-blue-soft px-2.5 py-0.5 font-sans text-label uppercase tracking-wider text-ph-blue-teal">
                {e.kind}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ViewPlaceholder>
  );
}
