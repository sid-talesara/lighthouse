/**
 * DatabaseView — consumable database schema explorer.
 *
 * Three layers of digestibility:
 *   1. OVERVIEW (default): tables grouped by owning module, collapsible cards
 *      showing table counts — not 87 tables dumped at once.
 *   2. SEARCH: filter by table name or column name; filters inside each group.
 *   3. FOCUS ER: clicking a table enters an ER diagram showing only that table
 *      + its FK-connected neighbors. "Show all" toggle for power users.
 *
 * Table detail panel: columns (PK/FK badges), summary, owning module, and
 * a "View schema source" code viewer for best-effort schema file lookup.
 *
 * ViewProps contract:
 *   selectedNodeId / onSelectNode: cross-links to Architecture tab via module_id.
 *   onHighlightNodes: fires with connected module ids so the map co-highlights.
 */

import { useCallback, useMemo, useState, useEffect } from 'react';
import type { ViewProps } from './viewContract';
import type { DbTable, LighthouseNode } from '../../types/lighthouse';
import { ErDiagram } from './ErDiagram';
import { buildGroups, GroupCard } from './DbGroups';
import { CodeViewer } from '../CodeViewer';

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildModuleAccentMap(nodes: LighthouseNode[]): Map<string, string> {
  const palette = [
    '#2C84E0', '#7C44A6', '#2C8C66', '#DC9300',
    '#1078A3', '#F54E00', '#CD4239', '#6C6E63',
  ];
  const map = new Map<string, string>();
  let i = 0;
  for (const n of nodes) {
    if (!map.has(n.id)) map.set(n.id, palette[i++ % palette.length]);
  }
  return map;
}

function findSchemaSourcePath(table: DbTable, nodes: LighthouseNode[]): string | null {
  if (!table.module_id) return null;
  const node = nodes.find((n) => n.id === table.module_id);
  if (!node) return null;

  // Prefer a key_file that mentions "schema"
  const schemaFile = node.key_files.find((f) => f.toLowerCase().includes('schema'));
  if (schemaFile) return schemaFile;

  // Fall back to path containing "schema"
  if (node.path.toLowerCase().includes('schema')) return node.path;

  // Fall back to first key_file that looks like a .ts/.py/.sql
  const codeFile = node.key_files.find((f) =>
    /\.(ts|tsx|js|py|sql|rb|go|rs)$/.test(f),
  );
  return codeFile ?? null;
}

// ─── FK neighbor computation ─────────────────────────────────────────────────

function fkNeighbors(tableId: string, tables: DbTable[]): Set<string> {
  const s = new Set<string>();
  for (const t of tables) {
    for (const col of t.columns) {
      if (col.fk) {
        if (t.id === tableId) s.add(col.fk);
        if (col.fk === tableId) s.add(t.id);
      }
    }
  }
  return s;
}

// ─── TableDetailPanel ─────────────────────────────────────────────────────────

interface TableDetailPanelProps {
  table: DbTable;
  nodes: LighthouseNode[];
  accentMap: Map<string, string>;
  onClose: () => void;
  onFocusER: () => void;
  onSelectModule: (id: string) => void;
}

function TableDetailPanel({
  table,
  nodes,
  accentMap,
  onClose,
  onFocusER,
  onSelectModule,
}: TableDetailPanelProps) {
  const [showSource, setShowSource] = useState(false);
  const accent = accentMap.get(table.module_id ?? '') ?? '#9B9C92';
  const owningNode = nodes.find((n) => n.id === table.module_id);
  const schemaPath = findSchemaSourcePath(table, nodes);

  const pkCols = table.columns.filter((c) => c.pk);
  const fkCols = table.columns.filter((c) => c.fk);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 300,
        background: '#FFFFFF',
        borderLeft: '1px solid #BFC1B7',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        fontFamily: '"Nunito", system-ui, sans-serif',
        animation: 'dbPanelIn 180ms ease-out both',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes dbPanelIn {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* accent top bar */}
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />

      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          padding: '12px 14px 10px',
          borderBottom: '1px solid #E5E7E0',
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#151515',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {table.name}
          </div>

          {owningNode && (
            <button
              onClick={() => onSelectModule(table.module_id!)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 3,
                background: `${accent}14`,
                border: 'none',
                borderRadius: 4,
                padding: '2px 7px',
                cursor: 'pointer',
                fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                fontSize: 9,
                color: accent,
                fontWeight: 600,
              }}
              title="Go to module in Architecture"
            >
              {owningNode.label}
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1 4h6M4 1l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#9B9C92',
            fontSize: 16,
            lineHeight: 1,
            padding: '2px 4px',
            flexShrink: 0,
            borderRadius: 4,
          }}
          title="Close"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* summary */}
      {table.summary && (
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid #E5E7E0',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 12,
            color: '#4D4F46',
            lineHeight: 1.5,
            flexShrink: 0,
          }}
        >
          {table.summary}
        </div>
      )}

      {/* stats row */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '8px 14px',
          borderBottom: '1px solid #E5E7E0',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: '#6C6E63',
            background: '#E5E7E0',
            borderRadius: 4,
            padding: '2px 7px',
          }}
        >
          {table.columns.length} columns
        </span>
        {pkCols.length > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#DC9300',
              background: '#FEF3C7',
              borderRadius: 4,
              padding: '2px 7px',
            }}
          >
            {pkCols.length} PK
          </span>
        )}
        {fkCols.length > 0 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#1078A3',
              background: '#DCEAF6',
              borderRadius: 4,
              padding: '2px 7px',
            }}
          >
            {fkCols.length} FK
          </span>
        )}
      </div>

      {/* action buttons */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 14px',
          borderBottom: '1px solid #E5E7E0',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onFocusER}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            height: 30,
            background: '#F7A501',
            border: '1px solid #DD9001',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: '"Nunito", system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 700,
            color: '#23251D',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Focus ER
        </button>
        {schemaPath && (
          <button
            onClick={() => setShowSource((v) => !v)}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              height: 30,
              background: showSource ? '#E5E7E0' : '#FFFFFF',
              border: '1px solid #BFC1B7',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: '"Nunito", system-ui, sans-serif',
              fontSize: 11,
              fontWeight: 600,
              color: '#4D4F46',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="1.5" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4 4h4M4 6h4M4 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {showSource ? 'Hide source' : 'View source'}
          </button>
        )}
      </div>

      {/* scrollable columns list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* columns */}
        <div style={{ borderBottom: showSource ? '1px solid #E5E7E0' : 'none' }}>
          {table.columns.map((col, i) => (
            <div
              key={col.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderBottom: i < table.columns.length - 1 ? '1px solid #F4F4F0' : 'none',
                background: col.pk ? '#FFFEF7' : 'transparent',
              }}
            >
              {/* PK badge */}
              {col.pk && (
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#DC9300',
                    background: '#FEF3C7',
                    borderRadius: 3,
                    padding: '1px 4px',
                    flexShrink: 0,
                  }}
                >
                  PK
                </span>
              )}
              {/* FK badge */}
              {col.fk && !col.pk && (
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#1078A3',
                    background: '#DCEAF6',
                    borderRadius: 3,
                    padding: '1px 4px',
                    flexShrink: 0,
                  }}
                >
                  FK
                </span>
              )}
              {/* spacer when neither */}
              {!col.pk && !col.fk && <span style={{ width: 20, flexShrink: 0 }} />}

              {/* column name */}
              <span
                style={{
                  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                  fontSize: 11,
                  color: col.pk ? '#151515' : '#23251D',
                  fontWeight: col.pk ? 600 : 400,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.name}
              </span>

              {/* type */}
              <span
                style={{
                  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                  fontSize: 10,
                  color: '#9B9C92',
                  flexShrink: 0,
                }}
              >
                {col.type}
              </span>

              {/* FK target */}
              {col.fk && (
                <span
                  style={{
                    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                    fontSize: 9,
                    color: '#1078A3',
                    flexShrink: 0,
                    maxWidth: 72,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={`→ ${col.fk}`}
                >
                  → {col.fk}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* code viewer */}
        {showSource && schemaPath && (
          <div style={{ padding: '12px 0 0' }}>
            <div
              style={{
                padding: '0 14px 8px',
                fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                fontSize: 10,
                color: '#9B9C92',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Schema source
            </div>
            <CodeViewer path={schemaPath} maxHeight="30vh" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ER Focus mode wrapper ────────────────────────────────────────────────────

interface ErFocusModeProps {
  tables: DbTable[];
  focusTableId: string;
  showAll: boolean;
  onToggleShowAll: () => void;
  onSelectTable: (id: string | null) => void;
}

function ErFocusMode({
  tables,
  focusTableId,
  showAll,
  onToggleShowAll,
  onSelectTable,
}: ErFocusModeProps) {
  const neighbors = useMemo(
    () => fkNeighbors(focusTableId, tables),
    [focusTableId, tables],
  );

  const visibleTables = useMemo(() => {
    if (showAll) return tables;
    return tables.filter((t) => t.id === focusTableId || neighbors.has(t.id));
  }, [tables, focusTableId, neighbors, showAll]);

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      {/* mode banner */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#FFFFFF',
          border: '1px solid #BFC1B7',
          borderRadius: 6,
          padding: '6px 10px',
          boxShadow: '0 1px 4px rgba(21,21,21,0.10)',
          fontFamily: '"Nunito", system-ui, sans-serif',
          fontSize: 11,
          color: '#4D4F46',
        }}
      >
        <span style={{ fontWeight: 600 }}>
          Focus: {visibleTables.length} of {tables.length} tables
        </span>
        <span style={{ color: '#BFC1B7' }}>·</span>
        <button
          onClick={onToggleShowAll}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#2C84E0',
            fontSize: 11,
            fontWeight: 600,
            padding: 0,
            fontFamily: '"Nunito", system-ui, sans-serif',
          }}
        >
          {showAll ? 'Back to focus' : 'Show all'}
        </button>
      </div>

      <ErDiagram
        tables={visibleTables}
        selectedTableId={focusTableId}
        onSelectTable={onSelectTable}
      />
    </div>
  );
}

// ─── Overview mode ────────────────────────────────────────────────────────────

interface OverviewModeProps {
  tables: DbTable[];
  nodes: LighthouseNode[];
  clusters: import('../../types/lighthouse').Cluster[];
  accentMap: Map<string, string>;
  filterText: string;
  selectedTableId: string | null;
  onSelectTable: (id: string) => void;
}

function OverviewMode({
  tables,
  nodes,
  clusters,
  accentMap: _accentMap,
  filterText,
  selectedTableId,
  onSelectTable,
}: OverviewModeProps) {
  const groups = useMemo(
    () => buildGroups(tables, nodes, clusters),
    [tables, nodes, clusters],
  );

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // Auto-expand top 3 by default so first impression isn't empty
    const top3 = groups.slice(0, 3).map((g) => g.id);
    return new Set(top3);
  });

  // Re-initialize when groups change
  useEffect(() => {
    setExpandedGroups((prev) => {
      if (prev.size > 0) return prev;
      const top3 = groups.slice(0, 3).map((g) => g.id);
      return new Set(top3);
    });
  }, [groups]);

  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Filter: find tables matching query
  const matchingTableCount = useMemo(() => {
    if (!filterText) return null;
    const q = filterText.toLowerCase();
    return tables.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.columns.some((c) => c.name.toLowerCase().includes(q)),
    ).length;
  }, [filterText, tables]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {filterText && matchingTableCount !== null && (
        <div
          style={{
            fontFamily: '"Nunito", system-ui, sans-serif',
            fontSize: 11,
            color: '#9B9C92',
            padding: '0 2px 4px',
          }}
        >
          {matchingTableCount === 0
            ? 'No tables match'
            : `${matchingTableCount} table${matchingTableCount === 1 ? '' : 's'} match`}
        </div>
      )}

      {groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          isExpanded={expandedGroups.has(group.id)}
          onToggle={() => toggleGroup(group.id)}
          selectedTableId={selectedTableId}
          onSelectTable={onSelectTable}
          filterText={filterText}
        />
      ))}
    </div>
  );
}

// ─── DatabaseView ─────────────────────────────────────────────────────────────

type ViewMode = 'overview' | 'er';

export function DatabaseView({
  data,
  selectedNodeId,
  highlightedNodeIds,
  onSelectNode,
  onHighlightNodes,
}: ViewProps) {
  const tables = useMemo(() => data.dbTables ?? [], [data.dbTables]);
  const nodes = useMemo(() => data.nodes ?? [], [data.nodes]);
  const clusters = useMemo(() => data.clusters ?? [], [data.clusters]);

  const accentMap = useMemo(
    () => buildModuleAccentMap(nodes),
    [nodes],
  );

  // ── search ────────────────────────────────────────────────────────────────
  const [filterText, setFilterText] = useState('');

  // ── view mode ─────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [erShowAll, setErShowAll] = useState(false);

  // ── table selection ───────────────────────────────────────────────────────
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);

  // Reflect incoming selectedNodeId → table
  const selectedFromParent = useMemo<string | null>(() => {
    if (!selectedNodeId) return null;
    const match = tables.find((t) => t.module_id === selectedNodeId || t.id === selectedNodeId);
    return match?.id ?? null;
  }, [selectedNodeId, tables]);

  // Reflect incoming highlightedNodeIds → table
  const highlightedTableId = useMemo<string | null>(() => {
    if (highlightedNodeIds.size === 0) return null;
    const match = tables.find((t) => t.module_id && highlightedNodeIds.has(t.module_id));
    return match?.id ?? null;
  }, [highlightedNodeIds, tables]);

  const selectedTableId = localSelectedId ?? highlightedTableId ?? selectedFromParent;
  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;

  const handleSelectTable = useCallback(
    (id: string | null) => {
      setLocalSelectedId(id);

      if (!id) {
        onSelectNode(null);
        onHighlightNodes(new Set());
        return;
      }

      const table = tables.find((t) => t.id === id);
      if (table?.module_id) {
        onSelectNode(table.module_id);
      }

      // Highlight connected modules
      const connected = new Set<string>();
      const neighbors = fkNeighbors(id, tables);
      for (const nid of neighbors) {
        const neighbor = tables.find((t) => t.id === nid);
        if (neighbor?.module_id) connected.add(neighbor.module_id);
      }
      if (table?.module_id) connected.add(table.module_id);
      onHighlightNodes(connected);
    },
    [tables, onSelectNode, onHighlightNodes],
  );

  const handleFocusER = useCallback(() => {
    setViewMode('er');
    setErShowAll(false);
  }, []);

  const handleClosePanel = useCallback(() => {
    setLocalSelectedId(null);
    onSelectNode(null);
    onHighlightNodes(new Set());
    // Don't exit ER mode on close — user may want to click another node
  }, [onSelectNode, onHighlightNodes]);

  const handleSelectModule = useCallback(
    (id: string) => {
      onSelectNode(id);
    },
    [onSelectNode],
  );

  const totalFkCount = useMemo(
    () => tables.reduce((s, t) => s + t.columns.filter((c) => c.fk).length, 0),
    [tables],
  );

  if (tables.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: '#EEEFE9',
          fontFamily: '"Nunito", system-ui, sans-serif',
          color: '#6C6E63',
          fontSize: 14,
        }}
      >
        No tables in data.json yet.
      </div>
    );
  }

  const panelOpen = selectedTable !== null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#EEEFE9',
        overflow: 'hidden',
      }}
    >
      {/* ── toolbar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          background: '#FFFFFF',
          borderBottom: '1px solid #BFC1B7',
          flexShrink: 0,
          fontFamily: '"Nunito", system-ui, sans-serif',
          flexWrap: 'wrap',
        }}
      >
        {/* title + counts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#151515' }}>Database</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#9B9C92',
              background: '#E5E7E0',
              borderRadius: 4,
              padding: '2px 7px',
            }}
          >
            {tables.length} tables
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#9B9C92',
              background: '#E5E7E0',
              borderRadius: 4,
              padding: '2px 7px',
            }}
          >
            {totalFkCount} FK
          </span>
        </div>

        {/* search box */}
        <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            style={{
              position: 'absolute',
              left: 9,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9B9C92',
              pointerEvents: 'none',
            }}
          >
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Filter tables or columns…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{
              width: '100%',
              height: 30,
              paddingLeft: 28,
              paddingRight: filterText ? 28 : 10,
              background: '#EEEFE9',
              border: '1px solid #BFC1B7',
              borderRadius: 6,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 12,
              color: '#23251D',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              style={{
                position: 'absolute',
                right: 7,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#9B9C92',
                fontSize: 14,
                padding: 0,
                lineHeight: 1,
              }}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* view mode toggle */}
        <div
          style={{
            display: 'flex',
            border: '1px solid #BFC1B7',
            borderRadius: 6,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {(['overview', 'er'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '5px 12px',
                background: viewMode === mode ? '#F7A501' : '#FFFFFF',
                border: 'none',
                borderRight: mode === 'overview' ? '1px solid #BFC1B7' : 'none',
                cursor: 'pointer',
                fontFamily: '"Nunito", system-ui, sans-serif',
                fontSize: 11,
                fontWeight: 600,
                color: viewMode === mode ? '#23251D' : '#6C6E63',
              }}
            >
              {mode === 'overview' ? 'Groups' : 'ER Diagram'}
            </button>
          ))}
        </div>
      </div>

      {/* ── main content area ── */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* left pane: overview or ER */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            marginRight: panelOpen ? 300 : 0,
            transition: 'margin-right 180ms ease-out',
          }}
        >
          {viewMode === 'overview' ? (
            <OverviewMode
              tables={tables}
              nodes={nodes}
              clusters={clusters}
              accentMap={accentMap}
              filterText={filterText}
              selectedTableId={selectedTableId}
              onSelectTable={(id) => handleSelectTable(id)}
            />
          ) : selectedTableId && viewMode === 'er' ? (
            <ErFocusMode
              tables={tables}
              focusTableId={selectedTableId}
              showAll={erShowAll}
              onToggleShowAll={() => setErShowAll((v) => !v)}
              onSelectTable={handleSelectTable}
            />
          ) : (
            /* Full ER diagram (no table selected yet) */
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  zIndex: 10,
                  background: '#FFFFFF',
                  border: '1px solid #BFC1B7',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontFamily: '"Nunito", system-ui, sans-serif',
                  fontSize: 11,
                  color: '#6C6E63',
                  boxShadow: '0 1px 4px rgba(21,21,21,0.10)',
                }}
              >
                Click a table to focus on its relationships
              </div>
              <ErDiagram
                tables={tables}
                selectedTableId={selectedTableId}
                onSelectTable={handleSelectTable}
              />
            </div>
          )}
        </div>

        {/* right detail panel */}
        {panelOpen && selectedTable && (
          <TableDetailPanel
            table={selectedTable}
            nodes={nodes}
            accentMap={accentMap}
            onClose={handleClosePanel}
            onFocusER={handleFocusER}
            onSelectModule={handleSelectModule}
          />
        )}
      </div>
    </div>
  );
}
