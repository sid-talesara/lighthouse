/**
 * FlowTrace — the animated module-map trace.
 *
 * Shows the unique modules (services/clusters) the flow touches as labeled
 * nodes arranged in visit order. A yellow pulse travels along the connector
 * each time the active step advances. Clear legend and caption tell the viewer
 * what they're looking at.
 *
 * The animation is driven entirely by the `activeStep` prop (single source of
 * truth lives in FlowPlayer) plus SMIL animateMotion on the live segment.
 */

import { useMemo } from 'react';
import type { Flow } from '../../types/lighthouse';
import {
  clusterColor,
  deriveTraceSegments,
  layoutTrace,
  type Participant,
} from './flowEngine';
import type { Edge } from '../../types/lighthouse';

interface Props {
  flow: Flow;
  participants: Participant[];
  edges: Edge[];
  /** Index into flow.steps of the currently active step. */
  activeStep: number;
  onSelectParticipant: (nodeId: string) => void;
}

const WIDTH = 640;
const HEIGHT = 300;

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Break a label into up to 2 lines at ~14 chars each for legibility. */
function wrapLabel(s: string, maxChars = 14): [string, string | null] {
  if (s.length <= maxChars) return [s, null];
  // Try to break at a space
  const mid = Math.floor(s.length / 2);
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ' ' || s[i] === '-' || s[i] === '/') {
      const dist = Math.abs(i - mid);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
  }
  if (best > 0) {
    return [s.slice(0, best).trim(), s.slice(best + 1).trim()];
  }
  return [s.slice(0, maxChars) + '—', s.slice(maxChars)];
}

export function FlowTrace({
  flow,
  participants,
  edges,
  activeStep,
  onSelectParticipant,
}: Props) {
  // participant id → index
  const participantIndex = useMemo(
    () => new Map(participants.map((p, i) => [p.id, i])),
    [participants],
  );

  const layout = useMemo(
    () => layoutTrace(participants.length, WIDTH, HEIGHT),
    [participants.length],
  );

  const segments = useMemo(
    () => deriveTraceSegments(flow, participantIndex, edges),
    [flow, participantIndex, edges],
  );

  const activeNodeId = flow.steps[activeStep]?.node;
  const activeParticipant =
    activeNodeId !== undefined ? participantIndex.get(activeNodeId) : undefined;

  const liveSegment = segments.find((s) => s.toStep === activeStep);

  const visitedParticipant = (idx: number) =>
    participants[idx] !== undefined && participants[idx].firstStep <= activeStep;

  return (
    <div
      style={{
        background: '#EEEFE9',
        borderRadius: 6,
        border: '1px solid #BFC1B7',
        overflow: 'hidden',
      }}
    >
      {/* ── Visual title + legend ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px 6px',
          borderBottom: '1px solid #DCDFD2',
          background: '#F5F5F0',
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
          Module map — visit order
        </span>
        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <LegendItem
            symbol={<Circle fill="#F7A501" stroke="#DD9001" r={7} />}
            label="Active module"
          />
          <LegendItem
            symbol={<Circle fill="#FFFFFF" stroke="#2C84E0" r={7} />}
            label="Visited"
          />
          <LegendItem
            symbol={<Circle fill="#FFFFFF" stroke="#DCDFD2" r={7} opacity={0.6} />}
            label="Upcoming"
          />
          <LegendItem
            symbol={<PulseDot />}
            label="Request pulse"
          />
        </div>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`Module map for flow: ${flow.name}`}
        style={{ display: 'block' }}
      >
        <defs>
          <marker
            id="trace-arrow"
            markerWidth={8}
            markerHeight={6}
            refX={6}
            refY={3}
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#BFC1B7" />
          </marker>
          <marker
            id="trace-arrow-live"
            markerWidth={9}
            markerHeight={7}
            refX={6}
            refY={3.5}
            orient="auto"
          >
            <polygon points="0 0, 9 3.5, 0 7" fill="#F7A501" />
          </marker>
          <marker
            id="trace-arrow-visited"
            markerWidth={8}
            markerHeight={6}
            refX={6}
            refY={3}
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#BFC1B7" />
          </marker>
        </defs>

        {/* ── Connectors (one per transition) ─────────────────────────────── */}
        {segments.map((seg) => {
          const a = layout.points[seg.fromParticipant];
          const b = layout.points[seg.toParticipant];
          if (!a || !b) return null;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const sx = a.x + ux * (layout.nodeR + 2);
          const sy = a.y + uy * (layout.nodeR + 2);
          const ex = b.x - ux * (layout.nodeR + 6);
          const ey = b.y - uy * (layout.nodeR + 6);

          const isLive = liveSegment === seg;
          const isPast = seg.toStep < activeStep;
          const isFuture = seg.toStep > activeStep;

          const stroke = isLive ? '#F7A501' : isPast ? '#BFC1B7' : '#DCDFD2';
          const dashed = !seg.real;

          // Edge kind label — shown on past segments to explain the connection
          const midX = (sx + ex) / 2;
          const midY = (sy + ey) / 2;
          const kindLabel = seg.real
            ? (seg.kind === 'calls' ? 'calls' : seg.kind === 'imports' ? 'uses' : 'depends')
            : '';

          return (
            <g key={`seg-${seg.toStep}`}>
              <line
                x1={sx}
                y1={sy}
                x2={ex}
                y2={ey}
                stroke={stroke}
                strokeWidth={isLive ? 2.5 : 1.5}
                strokeDasharray={dashed ? '5 4' : undefined}
                markerEnd={isLive ? 'url(#trace-arrow-live)' : 'url(#trace-arrow)'}
                opacity={isFuture ? 0.4 : 1}
                style={{ transition: 'stroke 220ms ease-out, opacity 220ms ease-out' }}
              />
              {/* Edge kind label on the connector midpoint (past segments) */}
              {isPast && kindLabel && (
                <text
                  x={midX}
                  y={midY - 5}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fontFamily="IBM Plex Mono, monospace"
                  fill="#9B9C92"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {kindLabel}
                </text>
              )}
              {/* Moving pulse dot on the live segment */}
              {isLive && (
                <circle
                  key={`pulse-${seg.toStep}`}
                  r={6}
                  fill="#F7A501"
                  stroke="#DD9001"
                  strokeWidth={1.5}
                >
                  <animateMotion
                    dur="0.85s"
                    fill="freeze"
                    keyPoints="0;1"
                    keyTimes="0;1"
                    calcMode="spline"
                    keySplines="0.42 0 0.58 1"
                    path={`M ${sx} ${sy} L ${ex} ${ey}`}
                  />
                  <animate
                    attributeName="opacity"
                    dur="0.85s"
                    values="0;1;1"
                    keyTimes="0;0.15;1"
                    fill="freeze"
                  />
                </circle>
              )}
            </g>
          );
        })}

        {/* ── Participant nodes ───────────────────────────────────────────── */}
        {participants.map((p, idx) => {
          const pt = layout.points[idx];
          if (!pt) return null;
          const isActive = idx === activeParticipant;
          const visited = visitedParticipant(idx);
          const accent = clusterColor(p.cluster?.id);

          const fill = isActive ? '#F7A501' : '#FFFFFF';
          const border = isActive ? '#DD9001' : visited ? accent : '#DCDFD2';
          const labelColor = isActive ? '#151515' : visited ? '#4D4F46' : '#9B9C92';

          const [line1, line2] = wrapLabel(truncate(p.label, 28), 15);

          return (
            <g
              key={p.id}
              transform={`translate(${pt.x},${pt.y})`}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectParticipant(p.id)}
              role="button"
              aria-label={`${p.label}${isActive ? ' (active)' : ''}`}
            >
              {/* Pop ring when active */}
              {isActive && (
                <circle
                  r={layout.nodeR + 8}
                  fill="none"
                  stroke="#F7A501"
                  strokeWidth={2}
                  opacity={0.3}
                  style={{ animation: 'flowNodePop 600ms ease-out both' }}
                />
              )}
              <circle
                r={layout.nodeR}
                fill={fill}
                stroke={border}
                strokeWidth={isActive ? 2.5 : visited ? 2 : 1.5}
                opacity={visited || isActive ? 1 : 0.5}
                style={{
                  transition: 'fill 220ms ease-out, stroke 220ms ease-out, opacity 220ms ease-out',
                }}
              />
              {/* Cluster accent dot (skip when active — yellow fill owns it) */}
              {!isActive && visited && (
                <circle cx={0} cy={-layout.nodeR + 8} r={4} fill={accent} />
              )}
              {/* Step number badge */}
              <text
                x={0}
                y={line2 ? -2 : 5}
                textAnchor="middle"
                fontSize={13}
                fontWeight={800}
                fontFamily="Nunito, system-ui"
                fill={isActive ? '#151515' : visited ? '#4D4F46' : '#B6B7AF'}
              >
                {p.firstStep + 1}
              </text>
              {/* Module label below the node — wrapped */}
              <text
                x={0}
                y={layout.nodeR + 18}
                textAnchor="middle"
                fontSize={11}
                fontWeight={isActive ? 700 : visited ? 600 : 400}
                fontFamily="Nunito, system-ui"
                fill={labelColor}
                style={{ transition: 'fill 220ms ease-out' }}
              >
                {line1}
              </text>
              {line2 && (
                <text
                  x={0}
                  y={layout.nodeR + 31}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={isActive ? 700 : visited ? 600 : 400}
                  fontFamily="Nunito, system-ui"
                  fill={labelColor}
                  style={{ transition: 'fill 220ms ease-out' }}
                >
                  {line2}
                </text>
              )}
              {/* Cluster name below module label */}
              {p.cluster && (
                <text
                  x={0}
                  y={layout.nodeR + (line2 ? 44 : 31)}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={500}
                  fontFamily="IBM Plex Mono, monospace"
                  fill={visited || isActive ? accent : '#C5C6BE'}
                  letterSpacing="0.03em"
                  style={{ transition: 'fill 220ms ease-out' }}
                >
                  {truncate(p.cluster.label.toUpperCase(), 18)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* ── Caption ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '6px 14px 8px',
          borderTop: '1px solid #DCDFD2',
          background: '#F5F5F0',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
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
          Each circle = a module/service. The number shows visit order. The yellow pulse = the request moving through the system. Click any module to jump to that step.
        </span>
      </div>

      <style>{`
        @keyframes flowNodePop {
          from { transform: scale(0.6); opacity: 0.6; }
          to   { transform: scale(1.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Legend helpers ───────────────────────────────────────────────────────────

function Circle({
  fill,
  stroke,
  r,
  opacity = 1,
}: {
  fill: string;
  stroke: string;
  r: number;
  opacity?: number;
}) {
  return (
    <svg width={r * 2 + 2} height={r * 2 + 2} style={{ display: 'block' }}>
      <circle
        cx={r + 1}
        cy={r + 1}
        r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        opacity={opacity}
      />
    </svg>
  );
}

function PulseDot() {
  return (
    <svg width={16} height={16} style={{ display: 'block' }}>
      <circle cx={8} cy={8} r={5} fill="#F7A501" stroke="#DD9001" strokeWidth={1.5} />
    </svg>
  );
}

function LegendItem({
  symbol,
  label,
}: {
  symbol: React.ReactNode;
  label: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {symbol}
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
