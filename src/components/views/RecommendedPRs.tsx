/**
 * RecommendedPRs — the "here's what mattered" entry points.
 *
 * Surfaces the few highest-impact PRs as flat cards at the top of the Changes
 * view. Impact is ranked by impact-util.rankRecommendedPrs (modules touched,
 * downstream dependents, feature areas spanned, churn, file count). Each card
 * leads with a risk pill and the key numbers so the user can pick the PR that
 * shaped the codebase most — then dive into the full review below.
 *
 * Clicking a card selects that PR (same handler the timeline uses).
 *
 * PostHog light theme.
 */

import type { PullRequest } from '../../types/lighthouse';
import type { RankedPr, RiskLevel } from './impact-util';

const FONT_UI = '"Nunito", system-ui, sans-serif';
const FONT_BODY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';

const RISK_STYLE: Record<RiskLevel, { fg: string; bg: string; label: string }> = {
  low: { fg: '#2C8C66', bg: '#D9EDDF', label: 'Low risk' },
  medium: { fg: '#92400E', bg: '#FEF3C7', label: 'Medium risk' },
  high: { fg: '#CD4239', bg: '#F7D6D3', label: 'High risk' },
};

function RiskTag({ risk }: { risk: RiskLevel }) {
  const s = RISK_STYLE[risk];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 9px',
        borderRadius: 9999,
        background: s.bg,
        color: s.fg,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.02em',
        fontFamily: FONT_UI,
        flexShrink: 0,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.fg }} />
      {s.label}
    </span>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span
        style={{
          fontSize: 17,
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
          marginTop: 3,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.04em',
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

interface Props {
  ranked: RankedPr[];
  selectedPrId: string | null;
  onSelectPr: (pr: PullRequest) => void;
}

export function RecommendedPRs({ ranked, selectedPrId, onSelectPr }: Props) {
  if (ranked.length === 0) return null;
  const top = ranked.slice(0, 3);

  return (
    <section>
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
          Recommended — the changes that mattered most
        </h4>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9B9C92', fontFamily: FONT_BODY, lineHeight: 1.4 }}>
          Highest-impact pull requests, ranked by how much of the architecture they reshaped and what depends on them.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
        }}
      >
        {top.map((r, i) => {
          const selected = r.pr.id === selectedPrId;
          return (
            <button
              key={r.pr.id}
              onClick={() => onSelectPr(r.pr)}
              aria-pressed={selected}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                background: selected ? 'rgba(247,165,1,0.06)' : '#FFFFFF',
                border: selected ? '1.5px solid #F7A501' : '1px solid #BFC1B7',
                borderRadius: 8,
                padding: 14,
                font: 'inherit',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                transition: 'border-color 120ms ease-out, background 120ms ease-out',
              }}
              onMouseEnter={(e) => {
                if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = '#9B9C92';
              }}
              onMouseLeave={(e) => {
                if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = '#BFC1B7';
              }}
            >
              {/* Top row: rank + risk */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#23251D',
                    color: '#EEEFE9',
                    fontSize: 11,
                    fontWeight: 800,
                    fontFamily: FONT_UI,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <code
                  style={{
                    fontSize: 10.5,
                    fontFamily: FONT_MONO,
                    color: '#6C6E63',
                    background: '#E5E7E0',
                    borderRadius: 4,
                    padding: '1px 6px',
                  }}
                >
                  {r.pr.id}
                </code>
                <span style={{ marginLeft: 'auto' }}>
                  <RiskTag risk={r.blast.risk} />
                </span>
              </div>

              {/* Title */}
              <h3
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: FONT_UI,
                  color: '#151515',
                  lineHeight: 1.35,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {r.pr.title}
              </h3>

              {/* Stats */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 8,
                  paddingTop: 8,
                  borderTop: '1px solid #DCDFD2',
                }}
              >
                <Stat value={String(r.blast.touched.length)} label="modules" />
                <Stat
                  value={String(r.blast.affected.length)}
                  label="depend"
                  accent={r.blast.affected.length > 0 ? '#DD9001' : undefined}
                />
                <Stat value={String(r.fileCount)} label="files" />
                <Stat value={`+${r.blast.additions}`} label="lines" accent="#2C8C66" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
