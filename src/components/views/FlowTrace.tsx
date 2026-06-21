/**
 * FlowTrace — the aligned, zoomable flow diagram (the marquee visual).
 *
 * This is NOT a scattered node cloud. It is a single, deliberately-aligned
 * top-to-bottom diagram: every step is a card stacked in execution order on a
 * shared centre axis, joined by straight, labeled connectors (the edge verb —
 * calls / uses / depends). The newcomer reads it like a recipe, top to bottom.
 *
 *   • Vertical centre rail keeps everything aligned on one axis.
 *   • One card per step, in order, with a left cluster-accent stripe, step
 *     number, module label, owning cluster/service, and the relevant function.
 *   • Connectors carry the handoff verb so the path "reads".
 *   • The active step glows yellow; visited steps are solid; upcoming dimmed.
 *   • A travelling yellow pulse animates the active handoff.
 *   • The whole diagram lives inside ZoomPanViewport → wheel-zoom, drag-pan,
 *     and zoom/fit controls. As the step advances the viewport re-centres on
 *     the active card so detail stays in frame.
 *
 * Driven entirely by the `steps` (ResolvedStep[]) + `activeStep` props so it can
 * never drift from the tour panel.
 */

import { useEffect, useMemo, useRef } from 'react';
import { ZoomPanViewport, type ZoomPanHandle } from './ZoomPanViewport';
import type { ResolvedStep } from './flowEngine';

interface Props {
  steps: ResolvedStep[];
  /** Index into steps of the currently active step. */
  activeStep: number;
  onSelectStep: (stepIndex: number) => void;
}

// ── Aligned vertical layout geometry ──────────────────────────────────────────
const CARD_W = 360;
const CARD_H = 96;
const V_GAP = 56; // vertical gap between cards (connector lives here)
const TOP_PAD = 28;
const SIDE_PAD = 40;
const CENTER_X = SIDE_PAD + CARD_W / 2;
const CONTENT_W = CARD_W + SIDE_PAD * 2;

function cardTop(i: number): number {
  return TOP_PAD + i * (CARD_H + V_GAP);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function FlowTrace({ steps, activeStep, onSelectStep }: Props) {
  const zoomRef = useRef<ZoomPanHandle | null>(null);

  const contentHeight = useMemo(
    () => (steps.length > 0 ? cardTop(steps.length - 1) + CARD_H + TOP_PAD : 200),
    [steps.length],
  );

  // Re-centre the viewport on the active card whenever the step advances.
  useEffect(() => {
    const handle = zoomRef.current;
    if (!handle) return;
    const top = cardTop(activeStep);
    handle.focusRect({ x: SIDE_PAD, y: top, width: CARD_W, height: CARD_H });
  }, [activeStep]);

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 6,
        border: '1px solid #BFC1B7',
        overflow: 'hidden',
      }}
    >
      {/* ── Title + legend ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          borderBottom: '1px solid #DCDFD2',
          background: '#FAFAF7',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: '"Nunito", system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#6C6E63',
          }}
        >
          Flow diagram — read top → bottom
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <LegendItem swatch="#F7A501" label="Active" filled />
          <LegendItem swatch="#2C84E0" label="Visited" />
          <LegendItem swatch="#DCDFD2" label="Upcoming" />
        </div>
      </div>

      {/* ── Zoomable aligned diagram ────────────────────────────────────────── */}
      <ZoomPanViewport
        ref={zoomRef}
        contentWidth={CONTENT_W}
        contentHeight={contentHeight}
        height={480}
      >
        <svg
          width={CONTENT_W}
          height={contentHeight}
          viewBox={`0 0 ${CONTENT_W} ${contentHeight}`}
          role="img"
          aria-label="Aligned flow diagram"
          style={{ display: 'block' }}
        >
          <defs>
            <marker
              id="ft-arrow"
              markerWidth={9}
              markerHeight={9}
              refX={4.5}
              refY={8}
              orient="auto"
            >
              <path d="M1 1 L4.5 8 L8 1" fill="none" stroke="#BFC1B7" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker
              id="ft-arrow-live"
              markerWidth={11}
              markerHeight={11}
              refX={5.5}
              refY={9}
              orient="auto"
            >
              <path d="M1 1 L5.5 9 L10 1" fill="none" stroke="#DD9001" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>

          {/* ── Connectors between consecutive steps ──────────────────────── */}
          {steps.map((step, i) => {
            if (i === 0) return null;
            const y1 = cardTop(i - 1) + CARD_H;
            const y2 = cardTop(i);
            const isLive = i === activeStep;
            const isPast = i < activeStep;
            const stroke = isLive ? '#F7A501' : isPast ? '#9FB0BE' : '#DCDFD2';
            const verb = step.sameAsPrev ? 'same module' : step.inVerb ?? 'flows to';
            const midY = (y1 + y2) / 2;

            return (
              <g key={`conn-${i}`}>
                <line
                  x1={CENTER_X}
                  y1={y1}
                  x2={CENTER_X}
                  y2={y2 - 2}
                  stroke={stroke}
                  strokeWidth={isLive ? 2.5 : 1.5}
                  markerEnd={isLive ? 'url(#ft-arrow-live)' : 'url(#ft-arrow)'}
                  opacity={i > activeStep ? 0.55 : 1}
                  style={{ transition: 'stroke 220ms ease-out, opacity 220ms ease-out' }}
                />
                {/* Verb chip on the connector */}
                <g transform={`translate(${CENTER_X}, ${midY})`}>
                  <rect
                    x={-(verb.length * 3.4 + 10)}
                    y={-9}
                    width={verb.length * 6.8 + 20}
                    height={18}
                    rx={9}
                    fill="#FFFFFF"
                    stroke={isLive ? '#F7A501' : '#DCDFD2'}
                    strokeWidth={isLive ? 1.5 : 1}
                    style={{ transition: 'stroke 220ms ease-out' }}
                  />
                  <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fontFamily="IBM Plex Mono, monospace"
                    fill={isLive ? '#B17816' : '#9B9C92'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {verb}
                  </text>
                </g>
                {/* Travelling pulse on the live connector */}
                {isLive && (
                  <circle r={5} fill="#F7A501" stroke="#DD9001" strokeWidth={1.5}>
                    <animateMotion
                      dur="0.7s"
                      fill="freeze"
                      keyPoints="0;1"
                      keyTimes="0;1"
                      calcMode="spline"
                      keySplines="0.42 0 0.58 1"
                      path={`M ${CENTER_X} ${y1} L ${CENTER_X} ${y2 - 2}`}
                    />
                  </circle>
                )}
              </g>
            );
          })}

          {/* ── Step cards (aligned on the centre axis) ───────────────────── */}
          {steps.map((step, i) => {
            const top = cardTop(i);
            const isActive = i === activeStep;
            const visited = i < activeStep;
            const accent = step.color;

            const cardFill = isActive ? '#FFFBF2' : '#FFFFFF';
            const cardStroke = isActive ? '#F7A501' : visited ? '#BFC1B7' : '#DCDFD2';
            const opacity = isActive ? 1 : visited ? 1 : 0.72;

            return (
              <g
                key={step.nodeId + '-' + i}
                transform={`translate(${SIDE_PAD}, ${top})`}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectStep(i)}
                role="button"
                aria-label={`Step ${i + 1}: ${step.label}`}
                aria-current={isActive ? 'step' : undefined}
                opacity={opacity}
              >
                {/* Card body */}
                <rect
                  x={0}
                  y={0}
                  width={CARD_W}
                  height={CARD_H}
                  rx={8}
                  fill={cardFill}
                  stroke={cardStroke}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  style={{ transition: 'stroke 220ms ease-out, fill 220ms ease-out' }}
                />
                {/* Cluster accent stripe */}
                <rect x={0} y={0} width={6} height={CARD_H} rx={3} fill={accent} />

                {/* Step-number medallion */}
                <circle
                  cx={34}
                  cy={CARD_H / 2}
                  r={17}
                  fill={isActive ? '#F7A501' : visited ? accent : '#EEEFE9'}
                  stroke={isActive ? '#DD9001' : visited ? accent : '#DCDFD2'}
                  strokeWidth={1.5}
                  style={{ transition: 'fill 220ms ease-out' }}
                />
                <text
                  x={34}
                  y={CARD_H / 2 + 5}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight={800}
                  fontFamily="Nunito, system-ui"
                  fill={isActive || visited ? '#FFFFFF' : '#9B9C92'}
                >
                  {i + 1}
                </text>

                {/* Module label */}
                <text
                  x={62}
                  y={30}
                  fontSize={15}
                  fontWeight={800}
                  fontFamily="Nunito, system-ui"
                  fill="#151515"
                >
                  {truncate(step.label, 30)}
                </text>

                {/* Cluster · Service line */}
                <text
                  x={62}
                  y={50}
                  fontSize={10.5}
                  fontWeight={600}
                  fontFamily="IBM Plex Mono, monospace"
                  fill={accent}
                  letterSpacing="0.03em"
                >
                  {truncate(
                    [step.cluster?.label, step.service?.name]
                      .filter(Boolean)
                      .join('  ·  ')
                      .toUpperCase() || 'MODULE',
                    40,
                  )}
                </text>

                {/* Function / file hint */}
                <text
                  x={62}
                  y={72}
                  fontSize={10.5}
                  fontFamily="IBM Plex Mono, monospace"
                  fill="#6C6E63"
                >
                  {step.fn
                    ? truncate(step.fn.name + '()', 42)
                    : truncate(step.path ?? '', 42)}
                </text>

                {/* Short description sliver */}
                <text
                  x={62}
                  y={90}
                  fontSize={10}
                  fontFamily="system-ui, sans-serif"
                  fill="#9B9C92"
                >
                  {truncate(step.description, 46)}
                </text>
              </g>
            );
          })}
        </svg>
      </ZoomPanViewport>

      {/* ── Caption ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '7px 14px',
          borderTop: '1px solid #DCDFD2',
          background: '#FAFAF7',
        }}
      >
        <span
          style={{
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 10,
            color: '#9B9C92',
            letterSpacing: '0.02em',
          }}
        >
          Each card is one step, in order. Connector labels show how control passes (calls / uses / depends). Scroll to zoom, drag to pan, or click a card to jump there.
        </span>
      </div>
    </div>
  );
}

// ─── Legend helper ────────────────────────────────────────────────────────────

function LegendItem({
  swatch,
  label,
  filled = false,
}: {
  swatch: string;
  label: string;
  filled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <svg width={14} height={14} style={{ display: 'block' }}>
        <rect
          x={1.5}
          y={1.5}
          width={11}
          height={11}
          rx={3}
          fill={filled ? swatch : '#FFFFFF'}
          stroke={swatch}
          strokeWidth={1.5}
        />
      </svg>
      <span
        style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 10,
          color: '#6C6E63',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  );
}
