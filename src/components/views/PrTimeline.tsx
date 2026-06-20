/**
 * PrTimeline — the chronological changelog of pull requests.
 *
 * Renders each PR as a flat PostHog-style card:
 *   title · author · relative date · status badge (merged/open/draft)
 *   summary · +additions/-deletions stat bar · touched-node list with
 *   add/modify/remove dots (green/amber/red).
 *
 * Clicking a card calls onSelectPr(pr) which the parent uses to drive
 * onSelectNode(primary touched node) + onHighlightNodes(all touched ids),
 * lighting up the Architecture tab with exactly what that PR changed.
 *
 * A node touched by the incoming selectedNodeId is subtly flagged so you can
 * see which PRs touched the currently-selected node.
 */

import type {
  ChangeKind,
  LighthouseNode,
  PullRequest,
  PullRequestStatus,
} from '../../types/lighthouse';

// ─── Palette helpers ──────────────────────────────────────────────────────────

const CHANGE_COLOR: Record<ChangeKind, string> = {
  added: '#2C8C66', // green
  modified: '#DC9300', // amber
  removed: '#CD4239', // red
};

const CHANGE_LABEL: Record<ChangeKind, string> = {
  added: 'added',
  modified: 'modified',
  removed: 'removed',
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
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Initials avatar ──────────────────────────────────────────────────────────

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
        gap: 5,
        padding: '2px 10px',
        borderRadius: 9999,
        background: s.bg,
        color: s.fg,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.03em',
        fontFamily: '"Nunito", system-ui, sans-serif',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: s.fg,
          ...(status === 'open' ? { animation: 'prPulse 1.6s ease-in-out infinite' } : {}),
        }}
      />
      {s.label}
    </span>
  );
}

// ─── Stat bar (+adds / -dels) ─────────────────────────────────────────────────

function StatBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions || 1;
  const addPct = (additions / total) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          color: '#2C8C66',
        }}
      >
        +{additions.toLocaleString()}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          color: '#CD4239',
        }}
      >
        -{deletions.toLocaleString()}
      </span>
      <span
        style={{
          flex: 1,
          maxWidth: 120,
          display: 'flex',
          height: 6,
          borderRadius: 3,
          overflow: 'hidden',
          background: '#E5E7E0',
        }}
      >
        <span style={{ width: `${addPct}%`, background: '#2C8C66' }} />
        <span style={{ flex: 1, background: '#CD4239' }} />
      </span>
    </div>
  );
}

// ─── Touched node chip ────────────────────────────────────────────────────────

function TouchedChip({
  label,
  change,
  flagged,
}: {
  label: string;
  change: ChangeKind;
  flagged: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 9999,
        background: flagged ? 'rgba(247,165,1,0.14)' : '#FFFFFF',
        border: flagged ? '1px solid #F7A501' : '1px solid #DCDFD2',
        fontSize: 12,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        color: '#4D4F46',
        maxWidth: 240,
      }}
      title={`${label} — ${CHANGE_LABEL[change]}`}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: CHANGE_COLOR[change],
        }}
      />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </span>
  );
}

// ─── PR card ──────────────────────────────────────────────────────────────────

interface PrCardProps {
  pr: PullRequest;
  nodeMap: Map<string, LighthouseNode>;
  now: Date;
  selected: boolean;
  /** node id selected elsewhere in the app (to flag which PRs touched it). */
  selectedNodeId: string | null;
  onSelect: (pr: PullRequest) => void;
}

function PrCard({ pr, nodeMap, now, selected, selectedNodeId, onSelect }: PrCardProps) {
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
        background: selected ? 'rgba(247,165,1,0.05)' : '#FFFFFF',
        border: selected ? '1.5px solid #F7A501' : '1px solid #BFC1B7',
        borderLeft: selected ? '4px solid #F7A501' : '4px solid #BFC1B7',
        borderRadius: 6,
        padding: '16px 18px',
        boxShadow: selected ? '0 0 0 3px rgba(247,165,1,0.15)' : 'none',
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
      {/* Header row: id, status, date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <code
          style={{
            fontSize: 11,
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            color: '#6C6E63',
            background: '#E5E7E0',
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          {pr.id}
        </code>
        <StatusBadge status={pr.status} />
        {touchesSelected && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#F7A501',
              fontFamily: '"Nunito", system-ui, sans-serif',
            }}
          >
            touched selected
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              color: '#9B9C92',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
            title={formatDate(pr.date)}
          >
            {relativeDate(pr.date, now)}
          </span>
        </span>
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: 15,
          fontWeight: 700,
          fontFamily: '"Nunito", system-ui, sans-serif',
          color: '#151515',
          margin: '0 0 6px',
          lineHeight: 1.35,
        }}
      >
        {pr.title}
      </h3>

      {/* Author + date line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#E5E7E0',
            color: '#4D4F46',
            fontSize: 9,
            fontWeight: 700,
            fontFamily: '"Nunito", system-ui, sans-serif',
          }}
        >
          {authorInitials(pr.author)}
        </span>
        <span
          style={{
            fontSize: 12,
            color: '#6C6E63',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {pr.author} · {formatDate(pr.date)}
        </span>
      </div>

      {/* Summary */}
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: '#4D4F46',
          margin: '0 0 12px',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        {pr.summary}
      </p>

      {/* Stat bar */}
      {(pr.additions != null || pr.deletions != null) && (
        <div style={{ marginBottom: 12 }}>
          <StatBar additions={pr.additions ?? 0} deletions={pr.deletions ?? 0} />
        </div>
      )}

      {/* Touched nodes */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {pr.touched.map((t) => {
          const node = nodeMap.get(t.node_id);
          return (
            <TouchedChip
              key={t.node_id}
              label={node?.label ?? t.node_id}
              change={t.change}
              flagged={!!selectedNodeId && t.node_id === selectedNodeId}
            />
          );
        })}
      </div>
    </button>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export interface PrTimelineProps {
  prs: PullRequest[];
  nodeMap: Map<string, LighthouseNode>;
  now: Date;
  selectedPrId: string | null;
  selectedNodeId: string | null;
  onSelectPr: (pr: PullRequest) => void;
}

export function PrTimeline({
  prs,
  nodeMap,
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
        gap: 14,
      }}
    >
      {prs.map((pr) => (
        <li key={pr.id}>
          <PrCard
            pr={pr}
            nodeMap={nodeMap}
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
