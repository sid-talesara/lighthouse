/**
 * FlowsView — Wave A placeholder.
 *
 * Wave B owns this view: build the real flow walkthrough here (e.g. an
 * animated step-by-step path that highlights nodes on the map as the user
 * advances through a flow's steps). Keep the ViewProps contract intact — use
 * onHighlightNodes to light a flow's nodes and onSelectNode to focus a step.
 *
 * For now it renders each flow as a card with its ordered steps, and clicking
 * a flow highlights all of its nodes — demonstrating the highlight seam.
 */

import type { ViewProps } from './viewContract';
import { ViewPlaceholder } from './ViewPlaceholder';

export function FlowsView({ data, onHighlightNodes, onSelectNode }: ViewProps) {
  return (
    <ViewPlaceholder
      emoji="🧭"
      title="Flows"
      blurb="Trace how a request or action moves through the system, step by step. (Wave B will animate these across the map.)"
    >
      {data.flows.length === 0 ? (
        <div className="rounded-ph border border-ph-border bg-ph-surface p-6 font-body text-body-sm text-ph-mute">
          No flows in data.json yet.
        </div>
      ) : (
        data.flows.map((flow) => (
          <div
            key={flow.name}
            className="rounded-ph border border-ph-border bg-ph-surface"
          >
            <button
              onClick={() =>
                onHighlightNodes(new Set(flow.steps.map((s) => s.node)))
              }
              className="flex w-full items-center justify-between border-b border-ph-border-soft px-5 py-4 text-left transition-colors hover:bg-ph-canvas"
              title="Highlight all nodes in this flow"
            >
              <h3 className="font-display text-heading-md text-ph-ink">
                {flow.name}
              </h3>
              <span className="shrink-0 rounded-ph-pill bg-ph-surface-soft px-2.5 py-0.5 font-sans text-label uppercase tracking-wider text-ph-body">
                {flow.steps.length} steps
              </span>
            </button>
            <ol className="px-5 py-3">
              {flow.steps.map((step, i) => (
                <li key={`${flow.name}-${i}`} className="flex gap-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ph-pill bg-ph-yellow font-sans text-label font-bold text-ph-ink">
                    {i + 1}
                  </span>
                  <button
                    onClick={() => onSelectNode(step.node)}
                    className="flex-1 text-left"
                    title="Select this node"
                  >
                    <span className="block font-mono text-code text-ph-mute">
                      {step.node}
                    </span>
                    <span className="block font-body text-body-sm text-ph-body">
                      {step.description}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
    </ViewPlaceholder>
  );
}
