/**
 * DbGroups — grouped table overview for DatabaseView.
 *
 * Renders DbTable[] organized by module/cluster into collapsible group cards.
 * This is the default "overview" mode — shows table counts per group,
 * not all 87 tables at once.
 */

import { useMemo } from 'react';
import type { DbTable, LighthouseNode, Cluster } from '../../types/lighthouse';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TableGroup {
  id: string;
  label: string;
  clusterId: string | null;
  clusterLabel: string | null;
  accent: string;
  tables: DbTable[];
}

// ─── Accent colors per module ─────────────────────────────────────────────────

const MODULE_ACCENT_PALETTE = [
  '#2C84E0', // blue
  '#7C44A6', // purple
  '#2C8C66', // green
  '#DC9300', // amber
  '#1078A3', // teal
  '#F54E00', // red-brand
  '#CD4239', // semantic red
  '#6C6E63', // gray
  '#7C44A6', // purple (repeat for overflow)
  '#2C8C66',
];

function accentForIdx(idx: number): string {
  return MODULE_ACCENT_PALETTE[idx % MODULE_ACCENT_PALETTE.length];
}

// ─── Build groups ─────────────────────────────────────────────────────────────

export function buildGroups(
  tables: DbTable[],
  nodes: LighthouseNode[],
  clusters: Cluster[],
): TableGroup[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const clusterMap = new Map(clusters.map((c) => [c.id, c]));

  // Assign accent by module_id (stable palette mapping)
  const moduleIds = [...new Set(tables.map((t) => t.module_id).filter(Boolean))] as string[];
  const moduleAccent = new Map(moduleIds.map((id, i) => [id, accentForIdx(i)]));

  // Group by module_id
  const grouped = new Map<string | '__other__', DbTable[]>();
  for (const t of tables) {
    const key = t.module_id ?? '__other__';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }

  const result: TableGroup[] = [];
  let idx = 0;

  for (const [key, grpTables] of grouped) {
    if (key === '__other__') continue;
    const node = nodeMap.get(key);
    const cluster = node?.parent ? clusterMap.get(node.parent) : null;
    result.push({
      id: key,
      label: node?.label ?? key.replace(/^mod_/, ''),
      clusterId: cluster?.id ?? null,
      clusterLabel: cluster?.label ?? null,
      accent: moduleAccent.get(key) ?? accentForIdx(idx),
      tables: grpTables,
    });
    idx++;
  }

  // "Other" group at the end
  const other = grouped.get('__other__') ?? [];
  if (other.length > 0) {
    result.push({
      id: '__other__',
      label: 'Other',
      clusterId: null,
      clusterLabel: null,
      accent: '#9B9C92',
      tables: other,
    });
  }

  // Sort by group table count descending
  result.sort((a, b) => b.tables.length - a.tables.length);
  return result;
}

// ─── GroupCard ────────────────────────────────────────────────────────────────

interface GroupCardProps {
  group: TableGroup;
  isExpanded: boolean;
  onToggle: () => void;
  selectedTableId: string | null;
  onSelectTable: (id: string) => void;
  filterText: string;
}

export function GroupCard({
  group,
  isExpanded,
  onToggle,
  selectedTableId,
  onSelectTable,
  filterText,
}: GroupCardProps) {
  const filteredTables = useMemo(() => {
    if (!filterText) return group.tables;
    const q = filterText.toLowerCase();
    return group.tables.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.columns.some((c) => c.name.toLowerCase().includes(q)),
    );
  }, [group.tables, filterText]);

  // Auto-expand if filter matches
  const shouldShowExpanded = isExpanded || (filterText.length > 0 && filteredTables.length > 0);

  const fkCount = group.tables.reduce(
    (s, t) => s + t.columns.filter((c) => c.fk).length,
    0,
  );

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #BFC1B7',
        borderRadius: 6,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* accent top bar */}
      <div style={{ height: 3, background: group.accent }} />

      {/* header row */}
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {/* chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            flexShrink: 0,
            transform: shouldShowExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 150ms ease-out',
            color: '#9B9C92',
          }}
        >
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* dot */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: group.accent,
            flexShrink: 0,
          }}
        />

        {/* label */}
        <span
          style={{
            fontFamily: '"Nunito", system-ui, sans-serif',
            fontSize: 13,
            fontWeight: 700,
            color: '#151515',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {group.label}
        </span>

        {/* cluster breadcrumb */}
        {group.clusterLabel && (
          <span
            style={{
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              fontSize: 9,
              color: '#9B9C92',
              flexShrink: 0,
            }}
          >
            {group.clusterLabel}
          </span>
        )}

        {/* counts */}
        <span
          style={{
            fontFamily: '"Nunito", system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 600,
            color: '#6C6E63',
            background: '#E5E7E0',
            borderRadius: 4,
            padding: '2px 7px',
            flexShrink: 0,
          }}
        >
          {group.tables.length} tables
        </span>
        {fkCount > 0 && (
          <span
            style={{
              fontFamily: '"Nunito", system-ui, sans-serif',
              fontSize: 11,
              fontWeight: 600,
              color: '#1078A3',
              background: '#DCEAF6',
              borderRadius: 4,
              padding: '2px 7px',
              flexShrink: 0,
            }}
          >
            {fkCount} FK
          </span>
        )}
      </button>

      {/* table list */}
      {shouldShowExpanded && filteredTables.length > 0 && (
        <div style={{ borderTop: '1px solid #E5E7E0' }}>
          {filteredTables.map((t, i) => {
            const isSelected = t.id === selectedTableId;
            const pkCols = t.columns.filter((c) => c.pk);
            const fkCols = t.columns.filter((c) => c.fk);
            return (
              <button
                key={t.id}
                onClick={() => onSelectTable(t.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px 8px 28px',
                  background: isSelected ? `${group.accent}12` : 'none',
                  border: 'none',
                  borderBottom: i < filteredTables.length - 1 ? '1px solid #F4F4F0' : 'none',
                  borderLeft: isSelected ? `3px solid ${group.accent}` : '3px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {/* table name */}
                <span
                  style={{
                    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                    fontSize: 11,
                    color: isSelected ? '#151515' : '#23251D',
                    fontWeight: isSelected ? 600 : 400,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.name}
                </span>

                {/* col count */}
                <span
                  style={{
                    fontFamily: '"Nunito", system-ui, sans-serif',
                    fontSize: 10,
                    color: '#9B9C92',
                    flexShrink: 0,
                  }}
                >
                  {t.columns.length}c
                </span>

                {/* PK badge */}
                {pkCols.length > 0 && (
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
                {fkCols.length > 0 && (
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
                    {fkCols.length} FK
                  </span>
                )}

                {/* right arrow */}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  style={{ flexShrink: 0, color: isSelected ? group.accent : '#BFC1B7' }}
                >
                  <path d="M3 1.5l3.5 3.5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            );
          })}
        </div>
      )}

      {/* empty filtered state */}
      {shouldShowExpanded && filteredTables.length === 0 && filterText && (
        <div
          style={{
            borderTop: '1px solid #E5E7E0',
            padding: '10px 28px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 12,
            color: '#9B9C92',
          }}
        >
          No match in this group
        </div>
      )}
    </div>
  );
}
