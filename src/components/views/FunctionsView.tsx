/**
 * FunctionsView — enriched call-graph dimension.
 *
 * V2:
 *  - Functions visually grouped by service/module (service swimlanes via ELK)
 *  - Detail panel with name, signature, summary, module/service, callers, callees, code snippet
 *  - Cross-service edges emphasised (dashed + colored) vs intra-service (subtle)
 *  - Filter bar: by service (grouped) or by module
 *  - PostHog LIGHT theme throughout
 */

import { useMemo, useState, useCallback } from 'react';
import type { ViewProps } from './viewContract';
import type { FunctionNode, LighthouseNode, Service } from '../../types/lighthouse';
import { CallGraph, moduleColor } from './CallGraph';
import { FunctionDetailPanel } from './FunctionDetailPanel';
import { OpenWikiOverlay } from './OpenWikiOverlay';

// ─── Service kind labels ───────────────────────────────────────────────────────

const SERVICE_KIND_COLOR: Record<string, string> = {
  frontend: '#2C84E0',
  backend:  '#7C44A6',
  worker:   '#F54E00',
  realtime: '#2C8C66',
  gateway:  '#DC9300',
  db:       '#1078A3',
  external: '#CD4239',
  other:    '#9B9C92',
};

function svcColor(kind: string): string {
  return SERVICE_KIND_COLOR[kind] ?? '#9B9C92';
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'service' | 'module';

interface FilterState {
  mode: FilterMode;
  id: string | null; // service id or module id
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FunctionsView({
  data,
  selectedNodeId,
  highlightedNodeIds,
  onSelectNode,
  onHighlightNodes,
  onOpenWiki,
  onAskContext,
}: ViewProps) {
  const functions = data.functions ?? [];
  const calls = data.calls ?? [];
  const services = data.services ?? [];

  // Build maps
  const nodeMap = useMemo(() => {
    const m = new Map<string, LighthouseNode>();
    for (const n of data.nodes) m.set(n.id, n);
    return m;
  }, [data.nodes]);

  const serviceByModuleId = useMemo(() => {
    const m = new Map<string, Service>();
    for (const svc of services) {
      for (const mid of svc.module_ids ?? []) {
        m.set(mid, svc);
      }
    }
    return m;
  }, [services]);

  // Services that actually have functions
  const activeServices = useMemo(() => {
    const svcIds = new Set(
      functions
        .map((f) => serviceByModuleId.get(f.module_id)?.id)
        .filter(Boolean) as string[],
    );
    return services.filter((s) => svcIds.has(s.id));
  }, [functions, services, serviceByModuleId]);

  // All unique module ids that appear in functions
  const moduleIds = useMemo(
    () => [...new Set(functions.map((f) => f.module_id))],
    [functions],
  );

  // Filter state
  const [filter, setFilter] = useState<FilterState>({ mode: 'all', id: null });

  const visibleFunctions = useMemo(() => {
    if (filter.mode === 'all' || !filter.id) return functions;
    if (filter.mode === 'service') {
      const svc = services.find((s) => s.id === filter.id);
      if (!svc) return functions;
      return functions.filter((f) => svc.module_ids?.includes(f.module_id));
    }
    // module
    return functions.filter((f) => f.module_id === filter.id);
  }, [functions, filter, services]);

  // Selected function for the detail panel
  const [selectedFnId, setSelectedFnId] = useState<string | null>(null);
  const [detailFn, setDetailFn] = useState<FunctionNode | null>(null);

  const handleSelectFn = useCallback((fn: FunctionNode | null) => {
    setDetailFn(fn);
    if (!fn) setSelectedFnId(null);
  }, []);

  const handleSetSelectedFnId = useCallback(
    (id: string | null) => {
      setSelectedFnId(id);
      if (!id) setDetailFn(null);
    },
    [],
  );

  // Clicking a chip in the detail panel selects that function
  const handleSelectFnById = useCallback(
    (id: string) => {
      const fn = functions.find((f) => f.id === id) ?? null;
      setDetailFn(fn);
      setSelectedFnId(id);
      if (fn) {
        onSelectNode(fn.module_id);
      }
    },
    [functions, onSelectNode],
  );

  // Detail panel data
  const detailModule = detailFn ? (nodeMap.get(detailFn.module_id) ?? null) : null;
  const detailService = detailFn
    ? (serviceByModuleId.get(detailFn.module_id) ?? null)
    : null;

  const callersOf = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of calls) {
      if (!m.has(c.to)) m.set(c.to, new Set());
      m.get(c.to)!.add(c.from);
    }
    return m;
  }, [calls]);

  const calleesOf = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of calls) {
      if (!m.has(c.from)) m.set(c.from, new Set());
      m.get(c.from)!.add(c.to);
    }
    return m;
  }, [calls]);

  const callerFns = useMemo(() => {
    if (!detailFn) return [];
    const ids = callersOf.get(detailFn.id) ?? new Set<string>();
    return functions.filter((f) => ids.has(f.id));
  }, [detailFn, callersOf, functions]);

  const calleeFns = useMemo(() => {
    if (!detailFn) return [];
    const ids = calleesOf.get(detailFn.id) ?? new Set<string>();
    return functions.filter((f) => ids.has(f.id));
  }, [detailFn, calleesOf, functions]);

  // Filter pill toggle handler
  const handleFilterClick = useCallback(
    (mode: FilterMode, id: string | null) => {
      setFilter((prev) => {
        if (prev.mode === mode && prev.id === id) return { mode: 'all', id: null };
        return { mode, id };
      });
    },
    [],
  );

  if (functions.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: '#EEEFE9',
      }}>
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #BFC1B7',
          borderRadius: 6,
          padding: '32px',
          maxWidth: 380,
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: '"Nunito", system-ui, sans-serif',
            fontSize: 18,
            fontWeight: 700,
            color: '#151515',
            marginBottom: 8,
          }}>
            No functions in data.json yet.
          </div>
          <div style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 14,
            color: '#6C6E63',
          }}>
            Add a <code>functions</code> array to data.json to see the call graph.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#EEEFE9',
      overflow: 'hidden',
    }}>
      {/* ── Top filter bar ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        background: '#FFFFFF',
        borderBottom: '1px solid #BFC1B7',
        flexShrink: 0,
        overflowX: 'auto',
        minHeight: 42,
      }}>
        {/* Group label */}
        <span style={{
          fontFamily: '"Nunito", system-ui, sans-serif',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#9B9C92',
          marginRight: 2,
          flexShrink: 0,
        }}>
          Service
        </span>

        {/* All pill */}
        <FilterPill
          label={`All (${functions.length})`}
          active={filter.mode === 'all'}
          accentColor="#F7A501"
          onClick={() => handleFilterClick('all', null)}
        />

        {/* Per-service pills */}
        {activeServices.map((svc) => {
          const count = functions.filter((f) =>
            svc.module_ids?.includes(f.module_id),
          ).length;
          const color = svcColor(svc.kind);
          return (
            <FilterPill
              key={svc.id}
              label={`${svc.name} (${count})`}
              active={filter.mode === 'service' && filter.id === svc.id}
              accentColor={color}
              onClick={() => handleFilterClick('service', svc.id)}
            />
          );
        })}

        {/* Divider */}
        {activeServices.length > 0 && moduleIds.length > 0 && (
          <div style={{
            width: 1,
            height: 18,
            background: '#BFC1B7',
            flexShrink: 0,
            marginLeft: 2,
            marginRight: 2,
          }} />
        )}

        {/* Module label */}
        <span style={{
          fontFamily: '"Nunito", system-ui, sans-serif',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#9B9C92',
          marginRight: 2,
          flexShrink: 0,
        }}>
          Module
        </span>

        {/* Per-module pills */}
        {moduleIds.map((mid) => {
          const lhNode = nodeMap.get(mid);
          const label = lhNode?.label ?? mid;
          const count = functions.filter((f) => f.module_id === mid).length;
          const color = moduleColor(mid);
          return (
            <FilterPill
              key={mid}
              label={`${label} (${count})`}
              active={filter.mode === 'module' && filter.id === mid}
              accentColor={color}
              onClick={() => handleFilterClick('module', mid)}
            />
          );
        })}

        {/* Stats */}
        <span style={{
          marginLeft: 'auto',
          flexShrink: 0,
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 10,
          color: '#9B9C92',
        }}>
          {visibleFunctions.length} fn · {calls.length} calls
        </span>
      </div>

      {/* ── Main area: graph + optional detail panel ─────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative' }}>
        {/* Graph canvas */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <CallGraph
            functions={visibleFunctions}
            calls={calls}
            nodeMap={nodeMap}
            services={services}
            selectedNodeId={selectedNodeId}
            highlightedNodeIds={highlightedNodeIds}
            onSelectNode={onSelectNode}
            onHighlightNodes={onHighlightNodes}
            onSelectFn={handleSelectFn}
            selectedFnId={selectedFnId}
            setSelectedFnId={handleSetSelectedFnId}
          />
          <OpenWikiOverlay
            data={data}
            selectedNodeId={selectedNodeId}
            onOpenWiki={onOpenWiki}
            onAskContext={onAskContext}
          />
        </div>

        {/* Detail panel — slides in when a function is selected */}
        {detailFn && (
          <FunctionDetailPanel
            fn={detailFn}
            moduleNode={detailModule}
            service={detailService}
            callerFns={callerFns}
            calleeFns={calleeFns}
            accentColor={moduleColor(detailFn.module_id)}
            onSelectFn={handleSelectFnById}
            onAskContext={onAskContext}
            onClose={() => {
              setDetailFn(null);
              setSelectedFnId(null);
              onSelectNode(null);
              onHighlightNodes(new Set());
            }}
          />
        )}
      </div>

      {/* Legend — cross-service edge indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '5px 14px',
        background: '#FFFFFF',
        borderTop: '1px solid #BFC1B7',
        flexShrink: 0,
      }}>
        {/* Cross-service edge legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="32" height="10" viewBox="0 0 32 10" fill="none">
            <line
              x1="0" y1="5" x2="28" y2="5"
              stroke="#7C44A6"
              strokeWidth="2"
              strokeDasharray="5 3"
            />
            <polygon points="28,2 32,5 28,8" fill="#7C44A6" />
          </svg>
          <span style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 11,
            color: '#6C6E63',
          }}>
            Cross-service call
          </span>
        </div>

        {/* Intra-service edge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="32" height="10" viewBox="0 0 32 10" fill="none">
            <line
              x1="0" y1="5" x2="28" y2="5"
              stroke="#BFC1B7"
              strokeWidth="1.5"
            />
            <polygon points="28,2 32,5 28,8" fill="#BFC1B7" />
          </svg>
          <span style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 11,
            color: '#6C6E63',
          }}>
            Intra-service call
          </span>
        </div>

        <span style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 11,
          color: '#9B9C92',
          marginLeft: 'auto',
        }}>
          Click a function to see callers, callees, and source
        </span>
      </div>
    </div>
  );
}

// ─── FilterPill ───────────────────────────────────────────────────────────────

interface FilterPillProps {
  label: string;
  active: boolean;
  accentColor: string;
  onClick: () => void;
}

function FilterPill({ label, active, accentColor, onClick }: FilterPillProps) {
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
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: accentColor,
          flexShrink: 0,
        }} />
      )}
      {label}
    </button>
  );
}
