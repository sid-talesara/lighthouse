/**
 * FlowsView — animated step-by-step flow walkthrough (Wave B).
 *
 * Features:
 *  - Flow selector tabs (one tab per flow in data.flows).
 *  - For the selected flow: renders an animated vertical timeline via
 *    FlowPlayer with Prev / Next / Play controls.
 *  - Cross-view linking:
 *      • As the active step changes → calls onSelectNode(step.node) and
 *        onHighlightNodes(new Set([step.node])).
 *      • If selectedNodeId (from another view) matches a step in the current
 *        flow → the player jumps to that step.
 *  - PostHog-inspired: cream canvas, white cards, olive borders, yellow accent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ViewProps } from './viewContract';
import { FlowPlayer } from './FlowPlayer';

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        padding: 48,
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #BFC1B7',
          borderRadius: 6,
          padding: '32px 40px',
          maxWidth: 400,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>🧭</div>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: '"Nunito", system-ui, sans-serif',
            color: '#151515',
            margin: '0 0 8px',
          }}
        >
          No flows yet
        </h2>
        <p
          style={{
            fontSize: 14,
            color: '#6C6E63',
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Add flows to <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12 }}>data.json</code> to
          see animated walkthroughs here.
        </p>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FlowsView({
  data,
  selectedNodeId,
  onSelectNode,
  onHighlightNodes,
}: ViewProps) {
  const [activeFlowIndex, setActiveFlowIndex] = useState(0);

  // Track the most recent step change to avoid feedback loops
  const lastEmittedNodeRef = useRef<string | null>(null);

  // Current flow (guarded against out-of-bounds)
  const currentFlow = data.flows[activeFlowIndex] ?? data.flows[0];

  // ── Cross-view: resolve incoming selectedNodeId to a forced step index ────
  const forcedStepIndex = useMemo<number | undefined>(() => {
    if (!selectedNodeId || !currentFlow) return undefined;
    // Don't force back to a step we just emitted ourselves
    if (selectedNodeId === lastEmittedNodeRef.current) return undefined;
    const idx = currentFlow.steps.findIndex((s) => s.node === selectedNodeId);
    return idx >= 0 ? idx : undefined;
  }, [selectedNodeId, currentFlow]);

  // ── Handle step changes from FlowPlayer ───────────────────────────────────
  const handleStepChange = useCallback(
    (stepIndex: number, nodeId: string) => {
      // Record what we're emitting so the inbound-select guard works
      lastEmittedNodeRef.current = nodeId;
      onSelectNode(nodeId);
      onHighlightNodes(new Set([nodeId]));
      void stepIndex; // used by FlowPlayer internally; param kept for future use
    },
    [onSelectNode, onHighlightNodes],
  );

  // ── When user switches flows, reset highlight to first step's node ─────────
  useEffect(() => {
    const flow = data.flows[activeFlowIndex];
    if (flow && flow.steps[0]) {
      lastEmittedNodeRef.current = flow.steps[0].node;
      onSelectNode(flow.steps[0].node);
      onHighlightNodes(new Set([flow.steps[0].node]));
    }
    // Only re-run when the active flow index changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFlowIndex]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (!data.flows.length) {
    return <EmptyState />;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#EEEFE9',
        overflow: 'hidden',
      }}
    >
      {/* ── View header ────────────────────────────────────────────────────── */}
      <div
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #BFC1B7',
          padding: '16px 20px 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              fontFamily: '"Nunito", system-ui, sans-serif',
              color: '#151515',
              margin: 0,
            }}
          >
            Flows
          </h2>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#9B9C92',
              fontFamily: '"Nunito", system-ui, sans-serif',
            }}
          >
            watch execution move through the system
          </span>
        </div>

        {/* ── Flow selector tabs ──────────────────────────────────────────── */}
        <nav
          style={{ display: 'flex', gap: 0 }}
          role="tablist"
          aria-label="Flow selector"
        >
          {data.flows.map((flow, i) => {
            const isActive = i === activeFlowIndex;
            return (
              <button
                key={flow.name}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveFlowIndex(i)}
                style={{
                  padding: '8px 14px',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #F7A501' : '2px solid transparent',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 400,
                  fontFamily: '"Nunito", system-ui, sans-serif',
                  color: isActive ? '#151515' : '#6C6E63',
                  transition: 'color 75ms, border-color 75ms',
                  whiteSpace: 'nowrap',
                  marginBottom: -1,
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.color = '#23251D';
                    (e.currentTarget as HTMLButtonElement).style.borderBottomColor = '#BFC1B7';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.color = '#6C6E63';
                    (e.currentTarget as HTMLButtonElement).style.borderBottomColor = 'transparent';
                  }
                }}
              >
                {flow.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Flow content (scrollable) ───────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {currentFlow ? (
          <div
            style={{
              background: '#FFFFFF',
              margin: '16px',
              borderRadius: 6,
              border: '1px solid #BFC1B7',
              overflow: 'hidden',
            }}
          >
            {/* Flow name + step count header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid #DCDFD2',
              }}
            >
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: '"Nunito", system-ui, sans-serif',
                  color: '#151515',
                  margin: 0,
                }}
              >
                {currentFlow.name}
              </h3>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 10px',
                  borderRadius: 9999,
                  background: '#E5E7E0',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: '#4D4F46',
                  fontFamily: '"Nunito", system-ui, sans-serif',
                }}
              >
                {currentFlow.steps.length} steps
              </span>
            </div>

            {/* The animated trace + sequence player */}
            <FlowPlayer
              key={`flow-${activeFlowIndex}`}
              flow={currentFlow}
              data={data}
              onStepChange={handleStepChange}
              forcedStepIndex={forcedStepIndex}
            />
          </div>
        ) : null}

        {/* Ghost hint below — PostHog style */}
        <p
          style={{
            textAlign: 'center',
            fontSize: 11,
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            color: '#BFC1B7',
            padding: '0 20px 24px',
            margin: 0,
          }}
        >
          ▶ play to watch the pulse travel   click a node or sequence row to jump   syncs the map ↗
        </p>
      </div>
    </div>
  );
}
