/**
 * ChangesView — PR review, reimagined as BLAST-RADIUS IMPACT analysis.
 *
 * GitHub's PR view tells you what *lines* changed. It cannot tell you what else
 * in the architecture is at risk. This view does:
 *
 *   1. PR selector (left rail) — pick a PR.
 *   2. Blast-radius graph (center) — a focused, animated impact diagram. The
 *      touched modules pulse, then everything that transitively DEPENDS ON them
 *      lights up outward, ring by ring (see impact-util.ts + BlastRadiusGraph).
 *   3. Impact / risk summary (right) — a reviewer's at-a-glance card: modules
 *      touched, downstream affected, clusters spanned, +adds/-dels, risk signal.
 *
 * Clicking any node in the graph still pushes onSelectNode + onHighlightNodes so
 * "show on map" context persists — but the primary value is now in-view.
 *
 * PostHog light theme throughout: cream canvas, flat white cards, olive borders,
 * yellow accent, Nunito + IBM Plex Mono.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ViewProps } from './viewContract';
import type { PullRequest } from '../../types/lighthouse';
import { PrTimeline } from './PrTimeline';
import { BlastRadiusGraph } from './BlastRadiusGraph';
import {
  computeBlastRadius,
  riskRationale,
  type BlastRadius,
  type RiskLevel,
} from './impact-util';

// ─── Risk palette ─────────────────────────────────────────────────────────────

const RISK_STYLE: Record<RiskLevel, { fg: string; bg: string; label: string }> = {
  low: { fg: '#2C8C66', bg: '#D9EDDF', label: 'Low risk' },
  medium: { fg: '#92400E', bg: '#FEF3C7', label: 'Medium risk' },
  high: { fg: '#CD4239', bg: '#F7D6D3', label: 'High risk' },
};

// ─── Empty state ──────────────────────────────────────────────────────────────

function NoDataState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 48 }}>
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
          <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12 }}>pullRequests</code>{' '}
          to <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 12 }}>data.json</code>{' '}
          to review their blast radius here.
        </p>
      </div>
    </div>
  );
}

function NoSelectionState() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <div
          style={{
            margin: '0 auto 16px',
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(247,165,1,0.12)',
            border: '1px solid #F7A501',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RippleGlyph />
        </div>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 800,
            fontFamily: '"Nunito", system-ui, sans-serif',
            color: '#151515',
            margin: '0 0 8px',
          }}
        >
          Pick a PR to see its blast radius
        </h3>
        <p
          style={{
            fontSize: 13,
            color: '#6C6E63',
            lineHeight: 1.55,
            margin: 0,
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          }}
        >
          We trace every module that transitively <strong>depends on</strong> what the PR
          touched — the impact GitHub can&rsquo;t show you — and rank the risk.
        </p>
      </div>
    </div>
  );
}

function RippleGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden>
      <circle cx="15" cy="15" r="3.5" fill="#F7A501" />
      <circle cx="15" cy="15" r="8" stroke="#DD9001" strokeWidth="1.5" opacity="0.6" />
      <circle cx="15" cy="15" r="13" stroke="#DD9001" strokeWidth="1.5" opacity="0.3" />
    </svg>
  );
}

// ─── Summary metric ───────────────────────────────────────────────────────────

function Metric({
  value,
  label,
  accent,
}: {
  value: string | number;
  label: string;
  accent?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span
        style={{
          fontSize: 26,
          fontWeight: 800,
          lineHeight: 1,
          fontFamily: '"Nunito", system-ui, sans-serif',
          color: accent ?? '#151515',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      <span
        style={{
          marginTop: 5,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: '#9B9C92',
          fontFamily: '"Nunito", system-ui, sans-serif',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Risk gauge ───────────────────────────────────────────────────────────────

function RiskGauge({ blast }: { blast: BlastRadius }) {
  const s = RISK_STYLE[blast.risk];
  return (
    <div
      style={{
        border: `1px solid ${s.fg}`,
        background: s.bg,
        borderRadius: 6,
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: s.fg,
            fontFamily: '"Nunito", system-ui, sans-serif',
            letterSpacing: '0.02em',
          }}
        >
          {s.label.toUpperCase()}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 700,
            color: s.fg,
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          }}
        >
          {blast.riskScore}/100
        </span>
      </div>
      {/* Score bar */}
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'rgba(21,21,21,0.08)',
          overflow: 'hidden',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: `${blast.riskScore}%`,
            height: '100%',
            background: s.fg,
            borderRadius: 3,
            transition: 'width 500ms cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.45,
          color: '#4D4F46',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        {riskRationale(blast)}
      </p>
    </div>
  );
}

// ─── Summary panel ────────────────────────────────────────────────────────────

function ImpactSummary({
  blast,
  onPick,
}: {
  blast: BlastRadius;
  onPick: (id: string) => void;
}) {
  const sectionLabel = (t: string) => (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#9B9C92',
        fontFamily: '"Nunito", system-ui, sans-serif',
        marginBottom: 8,
      }}
    >
      {t}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Metric row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          padding: '14px 16px',
          background: '#FFFFFF',
          border: '1px solid #BFC1B7',
          borderRadius: 6,
        }}
      >
        <Metric value={blast.touched.length} label="modules touched" />
        <Metric
          value={blast.affected.length}
          label="downstream affected"
          accent={blast.affected.length > 0 ? '#DD9001' : '#151515'}
        />
        <Metric value={blast.clustersSpanned.length} label="areas spanned" />
        <Metric value={`+${blast.additions}/-${blast.deletions}`} label="lines changed" />
      </div>

      {/* Risk */}
      <RiskGauge blast={blast} />

      {/* Areas spanned */}
      {blast.clusterLabels.length > 0 && (
        <div>
          {sectionLabel('Feature areas spanned')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {blast.clusterLabels.map((c) => (
              <span
                key={c.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '3px 10px',
                  borderRadius: 9999,
                  background: '#E5E7E0',
                  border: '1px solid #DCDFD2',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#4D4F46',
                  fontFamily: '"Nunito", system-ui, sans-serif',
                }}
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Downstream list */}
      <div>
        {sectionLabel(
          blast.affected.length > 0
            ? `At-risk dependents (${blast.affected.length})`
            : 'At-risk dependents',
        )}
        {blast.affected.length === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              lineHeight: 1.5,
              color: '#6C6E63',
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            }}
          >
            Nothing in the dependency map relies on the touched module
            {blast.touched.length > 1 ? 's' : ''}. This change is self-contained.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {blast.affected.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => onPick(a.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    background: '#FFFFFF',
                    border: '1px solid #DCDFD2',
                    borderRadius: 6,
                    font: 'inherit',
                    transition: 'border-color 120ms ease-out',
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = '#9B9C92')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = '#DCDFD2')}
                >
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: '#151515',
                      fontFamily: '"Nunito", system-ui, sans-serif',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.label}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      flexShrink: 0,
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      color: '#9B9C92',
                      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                    }}
                  >
                    {a.hops} HOP{a.hops > 1 ? 'S' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
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

  // Anchor relative dates to the newest PR so demo copy stays stable.
  const now = useMemo(() => {
    if (prs.length === 0) return new Date();
    const newest = prs.reduce(
      (max, p) => (new Date(p.date) > new Date(max) ? p.date : max),
      prs[0].date,
    );
    return new Date(newest);
  }, [prs]);

  // Newest-first selector ordering.
  const prsSorted = useMemo(
    () => [...prs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [prs],
  );

  const [selectedPrId, setSelectedPrId] = useState<string | null>(null);

  const selectedPr = useMemo(
    () => prs.find((p) => p.id === selectedPrId) ?? null,
    [prs, selectedPrId],
  );

  const blast = useMemo<BlastRadius | null>(
    () =>
      selectedPr
        ? computeBlastRadius(selectedPr, data.edges, data.nodes, data.clusters)
        : null,
    [selectedPr, data.edges, data.nodes, data.clusters],
  );

  // ── PR select → compute blast radius + push "show on map" context ──────────
  const handleSelectPr = useCallback(
    (pr: PullRequest) => {
      setSelectedPrId(pr.id);
      const b = computeBlastRadius(pr, data.edges, data.nodes, data.clusters);
      // Highlight touched + affected so the Architecture map mirrors the ripple.
      const ids = new Set<string>([
        ...b.touched.map((t) => t.id),
        ...b.affected.map((a) => a.id),
      ]);
      onHighlightNodes(ids);
      onSelectNode(pr.touched[0]?.node_id ?? null);
    },
    [data.edges, data.nodes, data.clusters, onHighlightNodes, onSelectNode],
  );

  // ── Click a node in the graph / summary → select + persist highlight ───────
  const handlePickNode = useCallback(
    (id: string) => {
      onSelectNode(id);
      if (blast) {
        const ids = new Set<string>([
          ...blast.touched.map((t) => t.id),
          ...blast.affected.map((a) => a.id),
        ]);
        ids.add(id);
        onHighlightNodes(ids);
      } else {
        onHighlightNodes(new Set([id]));
      }
    },
    [blast, onSelectNode, onHighlightNodes],
  );

  // Clear local PR selection if the app clears the global selection.
  useEffect(() => {
    if (selectedNodeId === null) setSelectedPrId(null);
  }, [selectedNodeId]);

  if (prs.length === 0) return <NoDataState />;

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
      {/* Header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #BFC1B7', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
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
            blast-radius impact review
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
          {draft > 0 ? ` · ${draft} draft` : ''} — pick one to trace what it puts at risk
        </p>
      </div>

      {/* Body: selector | impact */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left rail: PR selector */}
        <div
          style={{
            width: 320,
            flexShrink: 0,
            borderRight: '1px solid #BFC1B7',
            background: '#F4F5F0',
            overflowY: 'auto',
            padding: '16px 14px',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#9B9C92',
              fontFamily: '"Nunito", system-ui, sans-serif',
              marginBottom: 10,
              paddingLeft: 2,
            }}
          >
            Pull requests
          </div>
          <PrTimeline
            prs={prsSorted}
            now={now}
            selectedPrId={selectedPrId}
            selectedNodeId={selectedNodeId}
            onSelectPr={handleSelectPr}
          />
        </div>

        {/* Right: impact area */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          {!blast ? (
            <NoSelectionState />
          ) : (
            <div
              style={{
                maxWidth: 1080,
                margin: '0 auto',
                padding: '20px 24px 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
              }}
            >
              {/* Selected PR header */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
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
                    {blast.pr.id}
                  </code>
                  <span
                    style={{
                      fontSize: 12,
                      color: '#9B9C92',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                    }}
                  >
                    {blast.pr.author}
                  </span>
                </div>
                <h3
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    fontFamily: '"Nunito", system-ui, sans-serif',
                    color: '#151515',
                    margin: '0 0 6px',
                    lineHeight: 1.3,
                  }}
                >
                  {blast.pr.title}
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: '#4D4F46',
                    margin: 0,
                    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                  }}
                >
                  {blast.pr.summary}
                </p>
              </div>

              {/* Two-column: graph + summary */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 320px',
                  gap: 18,
                  alignItems: 'start',
                }}
              >
                {/* Impact graph */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#9B9C92',
                      fontFamily: '"Nunito", system-ui, sans-serif',
                      marginBottom: 8,
                    }}
                  >
                    Impact graph
                    <span style={{ color: '#BFC1B7', marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>
                      change ripples right → through everything that depends on it
                    </span>
                  </div>
                  <BlastRadiusGraph
                    blast={blast}
                    selectedNodeId={selectedNodeId}
                    onPick={handlePickNode}
                    replayKey={blast.pr.id}
                  />
                  {/* Legend */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 14,
                      marginTop: 10,
                      fontSize: 11,
                      color: '#6C6E63',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                    }}
                  >
                    <LegendDot color="#2C8C66" label="added" />
                    <LegendDot color="#DC9300" label="modified" />
                    <LegendDot color="#CD4239" label="removed" />
                    <LegendDot color="#9B9C92" label="affected dependent" />
                    <span style={{ marginLeft: 'auto', color: '#9B9C92' }}>
                      click any node to show it on the map ↗
                    </span>
                  </div>
                </div>

                {/* Summary */}
                <div style={{ minWidth: 0 }}>
                  <ImpactSummary blast={blast} onPick={handlePickNode} />
                </div>
              </div>
            </div>
          )}
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}
