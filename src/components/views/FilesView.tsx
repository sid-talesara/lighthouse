/**
 * FilesView — Wave A placeholder.
 *
 * Wave B owns this view: build the real file/module explorer here (e.g. a
 * tree or sortable table of nodes with paths, kinds, "changed recently"
 * flags). Keep the ViewProps contract intact — use onSelectNode to drive
 * selection and onHighlightNodes to emphasise sets.
 *
 * For now it renders a styled preview list of file/module nodes so the tab
 * is useful and demonstrates the selection seam.
 */

import type { ViewProps } from './viewContract';
import { ViewPlaceholder } from './ViewPlaceholder';

export function FilesView({ data, selectedNodeId, onSelectNode }: ViewProps) {
  const items = data.nodes;

  return (
    <ViewPlaceholder
      emoji="📁"
      title="Files"
      blurb="Every module and file in the repo, browsable. Click a row to read it on the map. (Wave B will turn this into a full file tree.)"
    >
      <div className="rounded-ph border border-ph-border bg-ph-surface">
        <div className="border-b border-ph-border-soft px-5 py-3 font-sans text-label uppercase tracking-wider text-ph-ash">
          {items.length} nodes
        </div>
        <ul>
          {items.map((n) => {
            const active = selectedNodeId === n.id;
            return (
              <li key={n.id}>
                <button
                  onClick={() => onSelectNode(active ? null : n.id)}
                  className={[
                    'flex w-full items-center gap-3 border-b border-ph-border-soft px-5 py-3 text-left transition-colors last:border-b-0',
                    active
                      ? 'border-l-2 border-l-ph-yellow bg-ph-canvas'
                      : 'border-l-2 border-l-transparent hover:bg-ph-canvas',
                  ].join(' ')}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-body-sm font-semibold text-ph-ink">
                      {n.label}
                    </span>
                    <span className="block truncate font-mono text-code text-ph-mute">
                      {n.path}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-ph-pill bg-ph-surface-soft px-2.5 py-0.5 font-sans text-label uppercase tracking-wider text-ph-body">
                    {n.kind}
                  </span>
                  {n.changed_recently && (
                    <span className="shrink-0 rounded-ph-pill bg-ph-green-soft px-2.5 py-0.5 font-sans text-label uppercase tracking-wider text-ph-green">
                      changed
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </ViewPlaceholder>
  );
}
