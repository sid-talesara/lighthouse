/**
 * ChangesView — PR / change-evolution dimension.
 *
 * "How the system is changing over time." Three coordinated pieces:
 *
 *  1. EvolutionScrubber — a horizontal, playable timeline across all PRs.
 *     Scrubbing/playing accumulates the system's growth and pushes the
 *     accumulated touched-node set to onHighlightNodes, so the Architecture
 *     tab lights up node-by-node as the system evolves.
 *
 *  2. "What changed recently" strip — surfaces nodes with changed_recently:true.
 *     Clicking it highlights exactly those nodes across the app.
 *
 *  3. PrTimeline — the changelog. Clicking a PR calls onSelectNode(primary
 *     touched node) + onHighlightNodes(all its touched ids), so switching to
 *     the Architecture tab shows precisely what that PR changed.
 *
 * Reflects incoming selectedNodeId: PR cards flag when they touched the
 * currently-selected node.
 *
 * PostHog light theme: cream canvas, flat white cards, olive borders, yellow
 * accent, Nunito + IBM Plex Mono.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ViewProps } from './viewContract';
import type { LighthouseNode, PullRequest } from '../../types/lighthouse';
import { PrTimeline } from './PrTimeline';
import { EvolutionScrubber } from './EvolutionScrubber';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNodeMap(nodes: LighthouseNode[]): Map<string, LighthouseNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

type SortOrder = 'newest' | 'oldest';

// ─── Empty state ──────────────────────────────────────────────────────────────

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
          maxWidth: 420,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔀</div>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: '"Nunito", system-ui, sans-serif',
            color: '#151515',
            margin: '0 0 8px',
          }}
        >
          No change history yet
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
          Add{' '}
          <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12 }}>
            pullRequests
          </code>{' '}
          to <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12 }}>data.json</code>{' '}
          to watch the system evolve here.
        </p>
      </div>
    </div>
  );
}

// ─── Recent-activity strip ────────────────────────────────────────────────────

function RecentStrip({
  recentNodes,
  onHighlight,
  active,
}: {
  recentNodes: LighthouseNode[];
  onHighlight: () => void;
  active: boolean;
}) {
  if (recentNodes.length === 0) return null;
  return (
    <button
      onClick={onHighlight}
      aria-pressed={active}
      style={{
        textAlign: 'left',
        width: '100%',
        cursor: 'pointer',
        background: active ? 'rgba(247,165,1,0.1)' : '#FCFCFA',
        border: active ? '1.5px solid #F7A501' : '1px solid #BFC1B7',
        borderLeft: '4px solid #F7A501',
        borderRadius: 6,
        padding: '14px 18px',
        transition: 'background 120ms ease-out, border-color 120ms ease-out',
        display: 'block',
        font: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#FFFFFF';
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#FCFCFA';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#F7A501',
            animation: 'prPulse 1.6s ease-in-out infinite',
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: '#9B9C92',
            fontFamily: '"Nunito", system-ui, sans-serif',
          }}
        >
          What changed recently
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: '#9B9C92',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          click to highlight on the map ↗
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {recentNodes.map((n) => (
          <span
            key={n.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 10px',
              borderRadius: 9999,
              background: '#FFFFFF',
              border: '1px solid #DCDFD2',
              fontSize: 12,
              fontWeight: 600,
              color: '#4D4F46',
              fontFamily: '"Nunito", system-ui, sans-serif',
            }}
          >
            {n.label}
          </span>
        ))}
      </div>
    </button>
  );
}

// ─── Sort toggle ──────────────────────────────────────────────────────────────

function SortToggle({
  order,
  onChange,
}: {
  order: SortOrder;
  onChange: (o: SortOrder) => void;
}) {
  const opt = (value: SortOrder, label: string) => {
    const isActive = order === value;
    return (
      <button
        onClick={() => onChange(value)}
        aria-pressed={isActive}
        style={{
          padding: '5px 12px',
          border: 'none',
          background: isActive ? '#FFFFFF' : 'transparent',
          borderRadius: 5,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: isActive ? 700 : 600,
          color: isActive ? '#151515' : '#6C6E63',
          fontFamily: '"Nunito", system-ui, sans-serif',
          boxShadow: isActive ? '0 0 0 1px #BFC1B7' : 'none',
          transition: 'all 100ms ease-out',
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 2,
        borderRadius: 7,
        background: '#E5E7E0',
        border: '1px solid #DCDFD2',
      }}
    >
      {opt('newest', 'Newest first')}
      {opt('oldest', 'Oldest first')}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChangesView({
  data,
  selectedNodeId,
  onSelectNode,
  onHighlightNodes,
}: ViewProps) {
  const prs = useMemo(() => data.pullRequests ?? [], [data.pullRequests]);
  const nodeMap = useMemo(() => buildNodeMap(data.nodes), [data.nodes]);

  // Anchor relative dates to the newest PR so demo copy stays stable.
  const now = useMemo(() => {
    if (prs.length === 0) return new Date();
    const newest = prs.reduce(
      (max, p) => (new Date(p.date) > new Date(max) ? p.date : max),
      prs[0].date,
    );
    return new Date(newest);
  }, [prs]);

  // PRs in ascending date order (oldest → newest) — the evolution axis.
  const prsAsc = useMemo(
    () => [...prs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [prs],
  );

  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const prsSorted = useMemo(
    () => (sortOrder === 'newest' ? [...prsAsc].reverse() : prsAsc),
    [prsAsc, sortOrder],
  );

  const recentNodes = useMemo(
    () => data.nodes.filter((n) => n.changed_recently),
    [data.nodes],
  );

  const [selectedPrId, setSelectedPrId] = useState<string | null>(null);
  const [recentActive, setRecentActive] = useState(false);

  // Guard so emitting a highlight set doesn't re-trigger anything.
  const lastEmitRef = useRef<string | null>(null);

  // ── PR select → select primary node + highlight all touched ───────────────
  const handleSelectPr = useCallback(
    (pr: PullRequest) => {
      setSelectedPrId(pr.id);
      setRecentActive(false);
      lastEmitRef.current = `pr:${pr.id}`;
      const ids = new Set(pr.touched.map((t) => t.node_id));
      const primary = pr.touched[0]?.node_id ?? null;
      onSelectNode(primary);
      onHighlightNodes(ids);
    },
    [onSelectNode, onHighlightNodes],
  );

  // ── Recent strip → highlight all changed_recently nodes ───────────────────
  const handleHighlightRecent = useCallback(() => {
    setRecentActive(true);
    setSelectedPrId(null);
    lastEmitRef.current = 'recent';
    const ids = new Set(recentNodes.map((n) => n.id));
    onHighlightNodes(ids);
    if (recentNodes[0]) onSelectNode(recentNodes[0].id);
  }, [recentNodes, onSelectNode, onHighlightNodes]);

  // ── Scrubber → accumulated highlight set ──────────────────────────────────
  const handleEvolve = useCallback(
    (highlight: Set<string>, cursorPrId: string) => {
      lastEmitRef.current = `evo:${cursorPrId}`;
      onHighlightNodes(highlight);
      setSelectedPrId(null);
      setRecentActive(false);
    },
    [onHighlightNodes],
  );

  // ── Clear ephemeral selection state if external selection clears it ───────
  useEffect(() => {
    if (selectedNodeId === null) {
      setSelectedPrId(null);
    }
  }, [selectedNodeId]);

  if (prs.length === 0) {
    return <EmptyState />;
  }

  const merged = prs.filter((p) => p.status === 'merged').length;
  const open = prs.filter((p) => p.status === 'open').length;
  const draft = prs.filter((p) => p.status === 'draft').length;

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
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #BFC1B7',
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              fontFamily: '"Nunito", system-ui, sans-serif',
              color: '#151515',
              margin: 0,
            }}
          >
            Changes
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
            how the system is changing over time
          </span>
        </div>
        <p
          style={{
            fontSize: 13,
            color: '#4D4F46',
            margin: 0,
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          }}
        >
          {prs.length} pull requests · {merged} merged
          {open > 0 ? ` · ${open} open` : ''}
          {draft > 0 ? ` · ${draft} draft` : ''} · {recentNodes.length} modules changed recently
        </p>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div
          style={{
            maxWidth: 760,
            margin: '0 auto',
            padding: '20px 20px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Evolution scrubber — the wow */}
          <EvolutionScrubber prsAsc={prsAsc} nodeMap={nodeMap} onEvolve={handleEvolve} />

          {/* What changed recently */}
          <RecentStrip
            recentNodes={recentNodes}
            onHighlight={handleHighlightRecent}
            active={recentActive}
          />

          {/* Changelog header + sort */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 4,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: '#9B9C92',
                fontFamily: '"Nunito", system-ui, sans-serif',
              }}
            >
              Changelog
            </div>
            <SortToggle order={sortOrder} onChange={setSortOrder} />
          </div>

          {/* PR timeline */}
          <PrTimeline
            prs={prsSorted}
            nodeMap={nodeMap}
            now={now}
            selectedPrId={selectedPrId}
            selectedNodeId={selectedNodeId}
            onSelectPr={handleSelectPr}
          />

          {/* Ghost hint */}
          <p
            style={{
              textAlign: 'center',
              fontSize: 11,
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              color: '#BFC1B7',
              margin: '8px 0 0',
            }}
          >
            ▶ play the evolution   ·   click a PR to light up what it changed ↗
          </p>
        </div>
      </div>

      <style>{`
        @keyframes prPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
