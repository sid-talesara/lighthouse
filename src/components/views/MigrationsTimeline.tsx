/**
 * MigrationsTimeline — ordered migration history for DatabaseView.
 *
 * Renders data.dbMigrations as a vertical timeline:
 *   - Date badge + migration name
 *   - Summary (one-liner)
 *   - Click to expand and view the migration file source via CodeViewer
 *
 * PostHog-flat styling (no Tailwind classes — inline styles only to match
 * the DatabaseView aesthetic).
 */

import { useState } from 'react';
import type { DbMigration } from '../../types/lighthouse';
import { CodeViewer } from '../CodeViewer';

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── MigrationRow ─────────────────────────────────────────────────────────────

interface MigrationRowProps {
  migration: DbMigration;
  isLast: boolean;
  accent: string;
}

function MigrationRow({ migration, isLast, accent }: MigrationRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {/* timeline rail */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flexShrink: 0,
          width: 32,
          paddingTop: 2,
        }}
      >
        {/* dot */}
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: open ? accent : '#BFC1B7',
            border: `2px solid ${open ? accent : '#9B9C92'}`,
            flexShrink: 0,
            transition: 'background 150ms ease-out, border-color 150ms ease-out',
          }}
        />
        {/* connector line */}
        {!isLast && (
          <div
            style={{
              flex: 1,
              width: 2,
              background: '#E5E7E0',
              minHeight: 20,
              marginTop: 4,
            }}
          />
        )}
      </div>

      {/* content card */}
      <div
        style={{
          flex: 1,
          marginBottom: isLast ? 0 : 12,
          marginLeft: 8,
        }}
      >
        {/* header row — clickable */}
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            background: open ? `${accent}0C` : '#FFFFFF',
            border: `1px solid ${open ? accent : '#BFC1B7'}`,
            borderRadius: 6,
            padding: '8px 12px',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 120ms ease-out, border-color 120ms ease-out',
          }}
        >
          {/* migration id badge */}
          <span
            style={{
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              fontSize: 10,
              fontWeight: 700,
              color: accent,
              background: `${accent}18`,
              borderRadius: 4,
              padding: '1px 6px',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              marginTop: 1,
            }}
          >
            {migration.id}
          </span>

          {/* name + summary */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: '"Nunito", system-ui, sans-serif',
                fontSize: 12,
                fontWeight: 700,
                color: '#151515',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {migration.name}
            </div>
            {migration.summary && (
              <div
                style={{
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontSize: 11,
                  color: '#4D4F46',
                  lineHeight: 1.4,
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {migration.summary}
              </div>
            )}
          </div>

          {/* date */}
          {migration.date && (
            <span
              style={{
                fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                fontSize: 9,
                color: '#9B9C92',
                flexShrink: 0,
                marginTop: 2,
                whiteSpace: 'nowrap',
              }}
            >
              {formatDate(migration.date)}
            </span>
          )}

          {/* chevron */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            style={{
              flexShrink: 0,
              marginTop: 3,
              color: '#9B9C92',
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease-out',
            }}
          >
            <path
              d="M3 1.5l3.5 3.5L3 8.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* expanded: file source */}
        {open && (
          <div style={{ marginTop: 6, borderRadius: 6, overflow: 'hidden' }}>
            <CodeViewer path={migration.file} maxHeight="28vh" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MigrationsTimeline ───────────────────────────────────────────────────────

interface MigrationsTimelineProps {
  migrations: DbMigration[];
}

export function MigrationsTimeline({ migrations }: MigrationsTimelineProps) {
  if (migrations.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontFamily: '"Nunito", system-ui, sans-serif',
          fontSize: 13,
          color: '#9B9C92',
        }}
      >
        No migrations in data.json yet.
      </div>
    );
  }

  // Stable accent cycle — same palette as DatabaseView
  const PALETTE = [
    '#2C84E0', '#7C44A6', '#2C8C66', '#DC9300',
    '#1078A3', '#F54E00', '#CD4239', '#6C6E63',
  ];

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 16px 24px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: '"Nunito", system-ui, sans-serif',
            fontSize: 12,
            fontWeight: 700,
            color: '#4D4F46',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Migration history
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
          {migrations.length}
        </span>
      </div>

      {/* timeline */}
      {migrations.map((m, i) => (
        <MigrationRow
          key={m.id}
          migration={m}
          isLast={i === migrations.length - 1}
          accent={PALETTE[i % PALETTE.length]}
        />
      ))}
    </div>
  );
}
