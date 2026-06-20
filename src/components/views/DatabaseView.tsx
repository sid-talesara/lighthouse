/**
 * DatabaseView — ER diagram for the database schema dimension.
 *
 * Renders `data.dbTables` as an interactive ER diagram using @xyflow/react
 * + elkjs for layout. FK columns become directed edges between table nodes.
 *
 * ViewProps contract:
 *   - selectedNodeId / onSelectNode: a selected table maps to its module_id
 *     so the Architecture tab can show where the table's code lives.
 *   - highlightedNodeIds: incoming highlighted node ids are reflected as
 *     table selections when a table's module_id matches.
 *   - onHighlightNodes: called with the set of module_ids of connected tables
 *     so the rest of the app can co-highlight the relevant code modules.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ViewProps } from './viewContract';
import { ErDiagram } from './ErDiagram';

// ─── Legend chip ──────────────────────────────────────────────────────────────

const MODULE_ACCENT: Record<string, string> = {
  mod_db_models:           '#2C84E0',
  mod_shared_contracts:    '#7C44A6',
  mod_execution_artifacts: '#2C8C66',
  mod_recorder_engine:     '#DC9300',
  mod_public_api:          '#1078A3',
  mod_ai_chat:             '#F54E00',
  mod_ai_failure_healing:  '#CD4239',
};

const MODULE_LABELS: Record<string, string> = {
  mod_db_models:           'db_models',
  mod_shared_contracts:    'shared_contracts',
  mod_execution_artifacts: 'execution_artifacts',
  mod_recorder_engine:     'recorder_engine',
  mod_public_api:          'public_api',
  mod_ai_chat:             'ai_chat',
  mod_ai_failure_healing:  'ai_failure_healing',
};

interface LegendChipProps {
  color: string;
  label: string;
}
function LegendChip({ color, label }: LegendChipProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        fontSize: 10,
        color: '#4D4F46',
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: color,
          flexShrink: 0,
        }}
      />
      {label}
    </div>
  );
}

// ─── info panel for selected table ───────────────────────────────────────────

interface TableInfoPanelProps {
  tableId: string | null;
  tables: import('../../types/lighthouse').DbTable[];
  onClose: () => void;
}
function TableInfoPanel({ tableId, tables, onClose }: TableInfoPanelProps) {
  const table = tables.find((t) => t.id === tableId);
  if (!table) return null;

  const accent = MODULE_ACCENT[table.module_id ?? ''] ?? '#9B9C92';

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 264,
        background: '#FFFFFF',
        border: '1.5px solid #BFC1B7',
        borderRadius: 6,
        boxShadow: '0 1px 3px rgba(20,20,20,0.10)',
        zIndex: 10,
        overflow: 'hidden',
        fontFamily: '"Nunito", system-ui, sans-serif',
        animation: 'erPanelIn 180ms ease-out both',
      }}
    >
      <style>{`
        @keyframes erPanelIn {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0);   }
        }
      `}</style>
      {/* accent bar */}
      <div style={{ height: 3, background: accent }} />

      <div style={{ padding: '12px 14px 4px' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#151515',
                lineHeight: 1.3,
              }}
            >
              {table.name}
            </div>
            {table.module_id && (
              <div
                style={{
                  fontSize: 9,
                  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                  color: accent,
                  marginTop: 2,
                }}
              >
                {MODULE_LABELS[table.module_id] ?? table.module_id}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9B9C92',
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
              flexShrink: 0,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {table.summary && (
          <p
            style={{
              fontSize: 11,
              color: '#6C6E63',
              lineHeight: 1.45,
              margin: '0 0 10px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {table.summary}
          </p>
        )}

        {/* stats row */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginBottom: 10,
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
            {table.columns.length} cols
          </span>
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
            {table.columns.filter((c) => c.pk).length} PK ·{' '}
            {table.columns.filter((c) => c.fk).length} FK
          </span>
        </div>
      </div>

      {/* columns detail */}
      <div
        style={{
          borderTop: '1px solid #E5E7E0',
          maxHeight: 180,
          overflowY: 'auto',
        }}
      >
        {table.columns.map((col) => (
          <div
            key={col.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 14px',
              borderBottom: '1px solid #F4F4F0',
            }}
          >
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
            {!col.pk && !col.fk && <span style={{ width: 20, flexShrink: 0 }} />}
            <span
              style={{
                fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                fontSize: 10,
                color: '#23251D',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {col.name}
            </span>
            <span
              style={{
                fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                fontSize: 9,
                color: '#9B9C92',
                flexShrink: 0,
              }}
            >
              {col.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DatabaseView ─────────────────────────────────────────────────────────────

export function DatabaseView({
  data,
  selectedNodeId,
  highlightedNodeIds,
  onSelectNode,
  onHighlightNodes,
}: ViewProps) {
  const tables = useMemo(() => data.dbTables ?? [], [data.dbTables]);

  // Map incoming selectedNodeId back to a table if it matches a module_id.
  const selectedFromParent = useMemo<string | null>(() => {
    if (!selectedNodeId) return null;
    const match = tables.find((t) => t.module_id === selectedNodeId || t.id === selectedNodeId);
    return match?.id ?? null;
  }, [selectedNodeId, tables]);

  // Reflect incoming highlightedNodeIds: if any module matches, select that table.
  const highlightedTableId = useMemo<string | null>(() => {
    if (highlightedNodeIds.size === 0) return null;
    const match = tables.find((t) => t.module_id && highlightedNodeIds.has(t.module_id));
    return match?.id ?? null;
  }, [highlightedNodeIds, tables]);

  // Local selection — tracks which table the user clicked in this view.
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);

  // Effective selected table: local click > incoming highlight > incoming select
  const selectedTableId = localSelectedId ?? highlightedTableId ?? selectedFromParent;

  // Unique modules present in data (for legend)
  const presentModules = useMemo(
    () => [...new Set(tables.map((t) => t.module_id).filter(Boolean))] as string[],
    [tables],
  );

  const handleSelectTable = useCallback(
    (id: string | null) => {
      setLocalSelectedId(id);

      if (!id) {
        onSelectNode(null);
        onHighlightNodes(new Set());
        return;
      }

      // Link to Architecture: send module_id so the Architecture tab can show
      // where this table's code lives.
      const table = tables.find((t) => t.id === id);
      if (table?.module_id) {
        onSelectNode(table.module_id);
      }

      // Highlight connected modules (FK neighbors)
      const connected = new Set<string>();
      for (const t of tables) {
        for (const col of t.columns) {
          if (col.fk) {
            if (t.id === id && col.fk) {
              const target = tables.find((tb) => tb.id === col.fk);
              if (target?.module_id) connected.add(target.module_id);
            }
            if (col.fk === id) {
              if (t.module_id) connected.add(t.module_id);
            }
          }
        }
      }
      if (table?.module_id) connected.add(table.module_id);
      onHighlightNodes(connected);
    },
    [tables, onSelectNode, onHighlightNodes],
  );

  const handleClosePanel = useCallback(() => {
    setLocalSelectedId(null);
    onSelectNode(null);
    onHighlightNodes(new Set());
  }, [onSelectNode, onHighlightNodes]);

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

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#EEEFE9',
      }}
    >
      {/* ── toolbar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 16px',
          background: '#FFFFFF',
          borderBottom: '1px solid #BFC1B7',
          flexShrink: 0,
          fontFamily: '"Nunito", system-ui, sans-serif',
        }}
      >
        {/* title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#151515' }}>
            Database
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#9B9C92',
              background: '#E5E7E0',
              borderRadius: 4,
              padding: '2px 7px',
              letterSpacing: '0.03em',
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
              letterSpacing: '0.03em',
            }}
          >
            {tables.reduce((s, t) => s + t.columns.filter((c) => c.fk).length, 0)} FK relations
          </span>
        </div>

        {/* spacer */}
        <div style={{ flex: 1 }} />

        {/* legend */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          {presentModules.map((mod) => (
            <LegendChip
              key={mod}
              color={MODULE_ACCENT[mod] ?? '#9B9C92'}
              label={MODULE_LABELS[mod] ?? mod}
            />
          ))}

          {/* badge legend */}
          <div style={{ width: 1, height: 12, background: '#E5E7E0', margin: '0 2px' }} />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 9,
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              color: '#DC9300',
              background: '#FEF3C7',
              borderRadius: 3,
              padding: '2px 5px',
            }}
          >
            PK
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 9,
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              color: '#1078A3',
              background: '#DCEAF6',
              borderRadius: 3,
              padding: '2px 5px',
            }}
          >
            FK
          </div>
        </div>
      </div>

      {/* ── diagram canvas ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ErDiagram
          tables={tables}
          selectedTableId={selectedTableId}
          onSelectTable={handleSelectTable}
        />

        {/* info panel overlay */}
        <TableInfoPanel
          tableId={selectedTableId}
          tables={tables}
          onClose={handleClosePanel}
        />
      </div>
    </div>
  );
}
