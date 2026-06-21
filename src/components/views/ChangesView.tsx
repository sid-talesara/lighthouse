/**
 * ChangesView — PR review as a LEGIBLE blast-radius impact analysis.
 *
 * GitHub's PR view tells you what *lines* changed. It cannot tell you what else
 * in the architecture is at risk. This view does, and — crucially — it leads
 * with plain language so a first-time viewer gets the point in three seconds.
 *
 * Reading order (top → bottom of the right pane):
 *   1. PR header — id · status · author · date · title · summary.
 *   2. Plain-English impact statement — "PR X changed N modules. M others
 *      depend on the changes — review those. Risk: Medium."
 *   3. Metric strip — touched / downstream / areas / lines.
 *   4. "What changed" — the touched modules, grouped by feature area, with
 *      their change type (added / modified / removed).
 *   5. "What it affects" — the downstream dependents, each with how many hops
 *      away it sits.
 *   6. Impact graph — a fully-labeled diagram (column headers + legend) that
 *      backs up the lists visually. Support, not the only thing.
 *
 * Left rail is the PR picker. Clicking any module (in a list or the graph)
 * mirrors the selection onto the Architecture map via onSelectNode +
 * onHighlightNodes.
 *
 * PostHog light theme throughout.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ViewProps } from './viewContract';
import type { ChangeKind, PullRequest } from '../../types/lighthouse';
import { PrTimeline } from './PrTimeline';
import { BlastRadiusGraph } from './BlastRadiusGraph';
import {
  computeBlastRadius,
  groupTouchedByCluster,
  plainEnglishImpact,
  riskRationale,
  type BlastRadius,
  type RiskLevel,
} from './impact-util';

// ─── Palettes ───────────────────────────────────────────────────────────────

const RISK_STYLE: Record<RiskLevel, { fg: string; bg: string; border: string; label: string }> = {
  low: { fg: '#2C8C66', bg: '#D9EDDF', border: '#2C8C66', label: 'Low risk' },
  medium: { fg: '#92400E', bg: '#FEF3C7', border: '#D9A441', label: 'Medium risk' },
  high: { fg: '#CD4239', bg: '#F7D6D3', border: '#CD4239', label: 'High risk' },
};

const CHANGE_STYLE: Record<ChangeKind, { fg: string; bg: string; label: string }> = {
  added: { fg: '#2C8C66', bg: '#D9EDDF', label: 'Added' },
  modified: { fg: '#946100', bg: '#FBEFD2', label: 'Modified' },
  removed: { fg: '#CD4239', bg: '#F7D6D3', label: 'Removed' },
};

const FONT_UI = '"Nunito", system-ui, sans-serif';
const FONT_BODY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';

// ─── Small shared atoms ─────────────────────────────────────────────────────

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <h4
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 800,
          fontFamily: FONT_UI,
          color: '#151515',
          letterSpacing: '0.01em',
        }}
      >
        {title}
      </h4>
      {hint && (
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9B9C92', fontFamily: FONT_BODY, lineHeight: 1.4 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function ChangeBadge({ change }: { change: ChangeKind }) {
  const s = CHANGE_STYLE[change];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 8px',
        borderRadius: 9999,
        background: s.bg,
        color: s.fg,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        fontFamily: FONT_UI,
        flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  );
}

function RiskPill({ risk }: { risk: RiskLevel }) {
  const s = RISK_STYLE[risk];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 9999,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.fg,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.02em',
        fontFamily: FONT_UI,
        flexShrink: 0,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.fg }} />
      {s.label}
    </span>
  );
}

// ─── Empty states ────────────────────────────────────────────────────────────

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
        <h2 style={{ fontSize: 18, fontWeight: 700, fontFamily: FONT_UI, color: '#151515', margin: '0 0 8px' }}>
          No change history yet
        </h2>
        <p style={{ fontSize: 14, color: '#6C6E63', fontFamily: FONT_BODY, margin: 0, lineHeight: 1.5 }}>
          Add <code style={{ fontFamily: FONT_MONO, fontSize: 12 }}>pullRequests</code> to{' '}
          <code style={{ fontFamily: FONT_MONO, fontSize: 12 }}>data.json</code> to review their blast radius here.
        </p>
      </div>
    </div>
  );
}

function NoSelectionState() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
      <div style={{ maxWidth: 380 }}>
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
        <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: FONT_UI, color: '#151515', margin: '0 0 8px' }}>
          Pick a pull request to review its impact
        </h3>
        <p style={{ fontSize: 13, color: '#6C6E63', lineHeight: 1.55, margin: 0, fontFamily: FONT_BODY }}>
          For any PR, we explain in plain English what it changed and trace every module that{' '}
          <strong>depends on</strong> those changes — so you know what to re-check before it ships.
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

// ─── Metric strip ─────────────────────────────────────────────────────────────

function Metric({ value, label, accent }: { value: string | number; label: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span
        style={{
          fontSize: 24,
          fontWeight: 800,
          lineHeight: 1,
          fontFamily: FONT_UI,
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
          fontFamily: FONT_UI,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function MetricStrip({ blast }: { blast: BlastRadius }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        padding: '14px 18px',
        background: '#FFFFFF',
        border: '1px solid #BFC1B7',
        borderRadius: 6,
      }}
    >
      <Metric value={blast.touched.length} label="modules changed" />
      <Metric
        value={blast.affected.length}
        label="depend on it"
        accent={blast.affected.length > 0 ? '#DD9001' : '#151515'}
      />
      <Metric value={blast.clustersSpanned.length} label="feature areas" />
      <Metric value={`+${blast.additions}/-${blast.deletions}`} label="lines changed" />
    </div>
  );
}

// ─── Plain-English impact banner ──────────────────────────────────────────────

function ImpactStatement({ blast }: { blast: BlastRadius }) {
  const impact = plainEnglishImpact(blast);
  const accent = blast.affected.length > 0 ? '#DD9001' : '#2C8C66';
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #BFC1B7',
        borderLeft: `4px solid ${accent}`,
        borderRadius: 6,
        padding: '16px 18px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: '#9B9C92',
            fontFamily: FONT_UI,
          }}
        >
          In plain English
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <RiskPill risk={impact.risk} />
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: '#151515', fontFamily: FONT_BODY }}>
        <strong style={{ fontWeight: 700 }}>{impact.lead}</strong>{' '}
        <span style={{ color: '#4D4F46' }}>{impact.consequence}</span>
      </p>
      <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#6C6E63', fontFamily: FONT_BODY, lineHeight: 1.45 }}>
        Why this risk level: {riskRationale(blast)}
      </p>
    </div>
  );
}

// ─── "What changed" — touched modules grouped by feature area ─────────────────

function WhatChanged({
  blast,
  clusterLabelMap,
  selectedNodeId,
  onPick,
}: {
  blast: BlastRadius;
  clusterLabelMap: Map<string, string>;
  selectedNodeId: string | null;
  onPick: (id: string) => void;
}) {
  const groups = useMemo(() => groupTouchedByCluster(blast, clusterLabelMap), [blast, clusterLabelMap]);
  return (
    <section>
      <SectionHeader
        title="What changed"
        hint="The modules this PR edited, grouped by feature area. Color = the kind of change."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groups.map((g) => (
          <div key={g.clusterId ?? '__none__'}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#9B9C92',
                fontFamily: FONT_UI,
                marginBottom: 6,
              }}
            >
              {g.clusterLabel}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.items.map((t) => (
                <li key={t.id}>
                  <ModuleRow
                    label={t.label}
                    selected={selectedNodeId === t.id}
                    onClick={() => onPick(t.id)}
                    trailing={<ChangeBadge change={t.change} />}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── "What it affects" — downstream dependents ────────────────────────────────

function WhatItAffects({
  blast,
  selectedNodeId,
  onPick,
}: {
  blast: BlastRadius;
  selectedNodeId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <section>
      <SectionHeader
        title="What it affects"
        hint="Other modules that depend on what changed — review these for breakage. The hop count is how many dependency steps away each one sits."
      />
      {blast.affected.length === 0 ? (
        <div
          style={{
            border: '1px dashed #BFC1B7',
            borderRadius: 6,
            padding: '14px 16px',
            background: '#FBFBF9',
            fontSize: 13,
            lineHeight: 1.5,
            color: '#4D4F46',
            fontFamily: FONT_BODY,
          }}
        >
          Nothing in the dependency map relies on the changed module
          {blast.touched.length > 1 ? 's' : ''}.{' '}
          <strong>This change is self-contained</strong> — no downstream ripple to review.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {blast.affected.map((a) => (
            <li key={a.id}>
              <ModuleRow
                label={a.label}
                selected={selectedNodeId === a.id}
                onClick={() => onPick(a.id)}
                trailing={
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      color: a.hops === 1 ? '#DD9001' : '#9B9C92',
                      fontFamily: FONT_MONO,
                      flexShrink: 0,
                    }}
                  >
                    {a.hops} HOP{a.hops > 1 ? 'S' : ''} AWAY
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Shared clickable module row ──────────────────────────────────────────────

function ModuleRow({
  label,
  selected,
  onClick,
  trailing,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  trailing: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: selected ? 'rgba(247,165,1,0.07)' : '#FFFFFF',
        border: selected ? '1px solid #F7A501' : '1px solid #DCDFD2',
        borderRadius: 6,
        font: 'inherit',
        transition: 'border-color 120ms ease-out, background 120ms ease-out',
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = '#9B9C92';
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = '#DCDFD2';
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#151515',
          fontFamily: FONT_UI,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}
      >
        {label}
      </span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center' }}>{trailing}</span>
    </button>
  );
}

// ─── Selected PR header ───────────────────────────────────────────────────────

function PrHeader({ blast, now }: { blast: BlastRadius; now: Date }) {
  const dateStr = new Date(blast.pr.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  void now;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <code
          style={{
            fontSize: 11,
            fontFamily: FONT_MONO,
            color: '#6C6E63',
            background: '#E5E7E0',
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          {blast.pr.id}
        </code>
        <span style={{ fontSize: 12, color: '#6C6E63', fontFamily: FONT_BODY }}>{blast.pr.author}</span>
        <span style={{ fontSize: 12, color: '#9B9C92', fontFamily: FONT_BODY }}>· {dateStr}</span>
      </div>
      <h3
        style={{
          fontSize: 19,
          fontWeight: 800,
          fontFamily: FONT_UI,
          color: '#151515',
          margin: '0 0 6px',
          lineHeight: 1.3,
        }}
      >
        {blast.pr.title}
      </h3>
      <p style={{ fontSize: 13, lineHeight: 1.5, color: '#4D4F46', margin: 0, fontFamily: FONT_BODY }}>
        {blast.pr.summary}
      </p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChangesView({ data, selectedNodeId, onSelectNode, onHighlightNodes }: ViewProps) {
  const prs = useMemo(() => data.pullRequests ?? [], [data.pullRequests]);

  const clusterLabelMap = useMemo(
    () => new Map(data.clusters.map((c) => [c.id, c.label])),
    [data.clusters],
  );

  // Anchor relative dates to the newest PR so demo copy stays stable.
  const now = useMemo(() => {
    if (prs.length === 0) return new Date();
    const newest = prs.reduce((max, p) => (new Date(p.date) > new Date(max) ? p.date : max), prs[0].date);
    return new Date(newest);
  }, [prs]);

  const prsSorted = useMemo(
    () => [...prs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [prs],
  );

  const [selectedPrId, setSelectedPrId] = useState<string | null>(null);

  const selectedPr = useMemo(() => prs.find((p) => p.id === selectedPrId) ?? null, [prs, selectedPrId]);

  const blast = useMemo<BlastRadius | null>(
    () => (selectedPr ? computeBlastRadius(selectedPr, data.edges, data.nodes, data.clusters) : null),
    [selectedPr, data.edges, data.nodes, data.clusters],
  );

  const handleSelectPr = useCallback(
    (pr: PullRequest) => {
      setSelectedPrId(pr.id);
      const b = computeBlastRadius(pr, data.edges, data.nodes, data.clusters);
      const ids = new Set<string>([...b.touched.map((t) => t.id), ...b.affected.map((a) => a.id)]);
      onHighlightNodes(ids);
      onSelectNode(pr.touched[0]?.node_id ?? null);
    },
    [data.edges, data.nodes, data.clusters, onHighlightNodes, onSelectNode],
  );

  const handlePickNode = useCallback(
    (id: string) => {
      onSelectNode(id);
      if (blast) {
        const ids = new Set<string>([...blast.touched.map((t) => t.id), ...blast.affected.map((a) => a.id)]);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#EEEFE9', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #BFC1B7', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: FONT_UI, color: '#151515', margin: 0 }}>Changes</h2>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#9B9C92',
              fontFamily: FONT_UI,
            }}
          >
            pull-request impact review
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#4D4F46', margin: 0, fontFamily: FONT_BODY }}>
          {prs.length} pull requests · {merged} merged
          {open > 0 ? ` · ${open} open` : ''}
          {draft > 0 ? ` · ${draft} draft` : ''} — pick one to see, in plain English, what it changed and what it could break.
        </p>
      </div>

      {/* Body: PR list | impact */}
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
              fontFamily: FONT_UI,
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
                maxWidth: 880,
                margin: '0 auto',
                padding: '20px 24px 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
              }}
            >
              {/* 1. PR header */}
              <PrHeader blast={blast} now={now} />

              {/* 2. Plain-English impact statement */}
              <ImpactStatement blast={blast} />

              {/* 3. Metric strip */}
              <MetricStrip blast={blast} />

              {/* 4 + 5. What changed / What it affects */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 24,
                  alignItems: 'start',
                }}
              >
                <WhatChanged
                  blast={blast}
                  clusterLabelMap={clusterLabelMap}
                  selectedNodeId={selectedNodeId}
                  onPick={handlePickNode}
                />
                <WhatItAffects blast={blast} selectedNodeId={selectedNodeId} onPick={handlePickNode} />
              </div>

              {/* 6. Visual graph — labeled support */}
              <section>
                <SectionHeader
                  title="Impact at a glance"
                  hint="The same information as a diagram: the change on the left, everything that depends on it fanning out to the right."
                />
                <BlastRadiusGraph
                  blast={blast}
                  selectedNodeId={selectedNodeId}
                  onPick={handlePickNode}
                  replayKey={blast.pr.id}
                />
              </section>
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
