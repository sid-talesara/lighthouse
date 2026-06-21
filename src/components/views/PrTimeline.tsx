/**
 * PrTimeline — the compact PR selector for the blast-radius review.
 *
 * A trimmed, well-designed pick-list: each PR is a flat PostHog card showing
 * title · author · relative date · status badge · +adds/-dels. Selecting a card
 * is what drives the blast-radius computation in ChangesView — this list is the
 * input device, the impact graph + summary are the payoff.
 *
 * A PR that touched the currently-selected node is subtly flagged.
 */

import type {
  ChangeKind,
  LighthouseNode,
  PullRequest,
  PullRequestStatus,
} from '../../types/lighthouse';

// ─── Palette helpers ──────────────────────────────────────────────────────────

export const CHANGE_COLOR: Record<ChangeKind, string> = {
  added: '#2C8C66', // green
  modified: '#DC9300', // amber
  removed: '#CD4239', // red
};

interface StatusStyle {
  bg: string;
  fg: string;
  label: string;
}

const STATUS_STYLE: Record<PullRequestStatus, StatusStyle> = {
  merged: { bg: '#E7D8EE', fg: '#7C44A6', label: 'Merged' },
  open: { bg: '#D9EDDF', fg: '#2C8C66', label: 'Open' },
  draft: { bg: '#E5E7E0', fg: '#6C6E63', label: 'Draft' },
};

// ─── Relative date ────────────────────────────────────────────────────────────

/** Relative-time string anchored to the dataset's newest PR (demo-stable). */
export function relativeDate(iso: string, now: Date): string {
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  const days = Math.round(ms / 86_400_000);
  if (days <= 0) return 'latest';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function authorInitials(author: string): string {
  const parts = author.replace(/[._-]/g, ' ').trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const second = parts[1]?.[0] ?? '';
  return (first + second).toUpperCase();
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PullRequestStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 8px',
        borderRadius: 9999,
        background: s.bg,
        color: s.fg,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.03em',
        fontFamily: '"Nunito", system-ui, sans-serif',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: s.fg,
          ...(status === 'open' ? { animation: 'prPulse 1.6s ease-in-out infinite' } : {}),
        }}
      />
      {s.label}
    </span>
  );
}

// ─── Mini +adds/-dels ─────────────────────────────────────────────────────────

function MiniStat({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          color: '#2C8C66',
        }}
      >
        +{additions.toLocaleString()}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          color: '#CD4239',
        }}
      >
        -{deletions.toLocaleString()}
      </span>
    </span>
  );
}

// ─── Touched-modules summary (labeled, not cryptic dots) ──────────────────────

function TouchedSummary({ pr }: { pr: PullRequest }) {
  const count = pr.touched.length;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {pr.touched.slice(0, 6).map((t, i) => (
          <span
            key={`${t.node_id}-${i}`}
            title={t.change}
            style={{ width: 7, height: 7, borderRadius: '50%', background: CHANGE_COLOR[t.change] }}
          />
        ))}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#6C6E63',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {count} module{count === 1 ? '' : 's'} changed
      </span>
    </span>
  );
}

// ─── PR card (compact selector item) ──────────────────────────────────────────

interface PrCardProps {
  pr: PullRequest;
  now: Date;
  selected: boolean;
  selectedNodeId: string | null;
  onSelect: (pr: PullRequest) => void;
}

function PrCard({ pr, now, selected, selectedNodeId, onSelect }: PrCardProps) {
  const touchesSelected =
    !!selectedNodeId && pr.touched.some((t) => t.node_id === selectedNodeId);

  return (
    <button
      onClick={() => onSelect(pr)}
      aria-pressed={selected}
      style={{
        textAlign: 'left',
        width: '100%',
        cursor: 'pointer',
        background: selected ? 'rgba(247,165,1,0.06)' : '#FFFFFF',
        border: selected ? '1.5px solid #F7A501' : '1px solid #BFC1B7',
        borderLeft: selected ? '4px solid #F7A501' : '4px solid #BFC1B7',
        borderRadius: 6,
        padding: '12px 14px',
        boxShadow: selected ? '0 0 0 3px rgba(247,165,1,0.14)' : 'none',
        transition: 'border-color 120ms ease-out, box-shadow 120ms ease-out, background 120ms ease-out',
        display: 'block',
        font: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = '#9B9C92';
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = '#BFC1B7';
      }}
    >
      {/* Top row: status + relative date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <StatusBadge status={pr.status} />
        {touchesSelected && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#F7A501',
              fontFamily: '"Nunito", system-ui, sans-serif',
            }}
          >
            ● selected
          </span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: '#9B9C92',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
          title={formatDate(pr.date)}
        >
          {relativeDate(pr.date, now)}
        </span>
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          fontFamily: '"Nunito", system-ui, sans-serif',
          color: '#151515',
          margin: '0 0 8px',
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {pr.title}
      </h3>

      {/* Author + stat */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#E5E7E0',
            color: '#4D4F46',
            fontSize: 8,
            fontWeight: 700,
            fontFamily: '"Nunito", system-ui, sans-serif',
            flexShrink: 0,
          }}
        >
          {authorInitials(pr.author)}
        </span>
        <span
          style={{
            fontSize: 11.5,
            color: '#6C6E63',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {pr.author}
        </span>
        {(pr.additions != null || pr.deletions != null) && (
          <span style={{ marginLeft: 'auto' }}>
            <MiniStat additions={pr.additions ?? 0} deletions={pr.deletions ?? 0} />
          </span>
        )}
      </div>

      {/* Touched summary */}
      <TouchedSummary pr={pr} />
    </button>
  );
}

// ─── Timeline / selector list ─────────────────────────────────────────────────

export interface PrTimelineProps {
  prs: PullRequest[];
  /** Retained for API compatibility; not used by the compact card. */
  nodeMap?: Map<string, LighthouseNode>;
  now: Date;
  selectedPrId: string | null;
  selectedNodeId: string | null;
  onSelectPr: (pr: PullRequest) => void;
}

export function PrTimeline({
  prs,
  now,
  selectedPrId,
  selectedNodeId,
  onSelectPr,
}: PrTimelineProps) {
  return (
    <ol
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {prs.map((pr) => (
        <li key={pr.id}>
          <PrCard
            pr={pr}
            now={now}
            selected={pr.id === selectedPrId}
            selectedNodeId={selectedNodeId}
            onSelect={onSelectPr}
          />
        </li>
      ))}
    </ol>
  );
}
