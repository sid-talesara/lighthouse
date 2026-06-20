/**
 * FunctionsView — call graph dimension.
 *
 * Renders the full function call graph via CallGraph (React Flow + ELK).
 * Provides a module-group filter bar at the top.
 */

import { useMemo, useState } from 'react';
import type { ViewProps } from './viewContract';
import type { LighthouseNode } from '../../types/lighthouse';
import { CallGraph } from './CallGraph';
import { OpenWikiOverlay } from './OpenWikiOverlay';

export function FunctionsView({
  data,
  selectedNodeId,
  highlightedNodeIds,
  onSelectNode,
  onHighlightNodes,
  onOpenWiki,
}: ViewProps) {
  const functions = data.functions ?? [];
  const calls = data.calls ?? [];

  // Build a map from node id → LighthouseNode for module label resolution
  const nodeMap = useMemo(() => {
    const m = new Map<string, LighthouseNode>();
    for (const n of data.nodes) m.set(n.id, n);
    return m;
  }, [data.nodes]);

  // All unique module ids that appear in functions
  const moduleIds = useMemo(
    () => [...new Set(functions.map((f) => f.module_id))],
    [functions],
  );

  // Filter state — null = show all
  const [filterModuleId, setFilterModuleId] = useState<string | null>(null);

  const visibleFunctions = useMemo(
    () =>
      filterModuleId
        ? functions.filter((f) => f.module_id === filterModuleId)
        : functions,
    [functions, filterModuleId],
  );

  if (functions.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: '#EEEFE9',
        }}
      >
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #BFC1B7',
            borderRadius: 6,
            padding: '32px',
            maxWidth: 380,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: '"Nunito", system-ui, sans-serif',
              fontSize: 18,
              fontWeight: 700,
              color: '#151515',
              marginBottom: 8,
            }}
          >
            No functions in data.json yet.
          </div>
          <div
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 14,
              color: '#6C6E63',
            }}
          >
            Add a <code>functions</code> array to data.json to see the call graph.
          </div>
        </div>
      </div>
    );
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
      {/* ── Top filter bar ───────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          background: '#FFFFFF',
          borderBottom: '1px solid #BFC1B7',
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        {/* Title */}
        <span
          style={{
            fontFamily: '"Nunito", system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#9B9C92',
            marginRight: 4,
            flexShrink: 0,
          }}
        >
          Module
        </span>

        {/* All pill */}
        <FilterPill
          label={`All (${functions.length})`}
          active={filterModuleId === null}
          onClick={() => setFilterModuleId(null)}
          accentColor="#F7A501"
        />

        {/* Per-module pills */}
        {moduleIds.map((mid) => {
          const lhNode = nodeMap.get(mid);
          const label = lhNode?.label ?? mid;
          const count = functions.filter((f) => f.module_id === mid).length;
          return (
            <FilterPill
              key={mid}
              label={`${label} (${count})`}
              active={filterModuleId === mid}
              onClick={() => setFilterModuleId(filterModuleId === mid ? null : mid)}
              accentColor={MODULE_ACCENT[mid] ?? '#9B9C92'}
            />
          );
        })}

        {/* Stats */}
        <span
          style={{
            marginLeft: 'auto',
            flexShrink: 0,
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 10,
            color: '#9B9C92',
          }}
        >
          {visibleFunctions.length} fn · {calls.length} calls
        </span>
      </div>

      {/* ── Call graph canvas ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <CallGraph
          functions={visibleFunctions}
          calls={calls}
          nodeMap={nodeMap}
          selectedNodeId={selectedNodeId}
          highlightedNodeIds={highlightedNodeIds}
          onSelectNode={onSelectNode}
          onHighlightNodes={onHighlightNodes}
        />
        <OpenWikiOverlay data={data} selectedNodeId={selectedNodeId} onOpenWiki={onOpenWiki} />
      </div>
    </div>
  );
}

// ─── Module accent colors (duplicated from CallGraph for the filter bar) ──────

const MODULE_ACCENT: Record<string, string> = {
  mod_api_domain_controllers:   '#2C84E0',
  mod_execution_run_services:   '#7C44A6',
  mod_db_models:                '#DC9300',
  mod_execution_queues:         '#2C8C66',
  mod_execution_workers:        '#F54E00',
  mod_ai_step_generation:       '#1078A3',
  mod_ai_code_generation:       '#1078A3',
  mod_python_runner:            '#CD4239',
  mod_execution_artifacts:      '#6C6E63',
  mod_ws_server:                '#2C84E0',
  mod_recorder_engine:          '#DC9300',
  mod_extension_content:        '#7C44A6',
  mod_extension_background:     '#7C44A6',
  mod_ai_chat:                  '#1078A3',
  mod_ai_failure_healing:       '#CD4239',
  mod_frontend_test_management: '#2C84E0',
  mod_frontend_app_shell:       '#2C8C66',
  mod_public_api:               '#F54E00',
};

// ─── FilterPill ───────────────────────────────────────────────────────────────

interface FilterPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
  accentColor: string;
}

function FilterPill({ label, active, onClick, accentColor }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 9px',
        borderRadius: 9999,
        border: active ? `1.5px solid ${accentColor}` : '1px solid #BFC1B7',
        background: active ? `${accentColor}18` : '#FFFFFF',
        color: active ? accentColor : '#4D4F46',
        fontFamily: '"Nunito", system-ui, sans-serif',
        fontSize: 11,
        fontWeight: active ? 700 : 600,
        letterSpacing: '0.01em',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'all 75ms ease-out',
        whiteSpace: 'nowrap',
      }}
    >
      {active && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: accentColor,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </button>
  );
}
