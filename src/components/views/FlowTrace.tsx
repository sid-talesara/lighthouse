/**
 * FlowTrace — the animated map trace.
 *
 * A bespoke SVG (NOT React Flow) that lays out a flow's participant nodes as a
 * small focused graph and draws the path connecting them in step order. As the
 * active step advances, a PULSE travels along the connector from the previous
 * step's node to the current one, the active node pops with ph-yellow, visited
 * nodes go muted-done, and upcoming nodes stay faded.
 *
 * The animation is driven entirely by the `activeStep` prop (single source of
 * truth lives in FlowPlayer) plus a CSS keyframe on the live segment — no
 * internal timers here, so it can never drift from the sequence rail.
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
const HEIGHT = 320;

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
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

  // The node id of the active step and the previous step (drives pop + pulse).
  const activeNodeId = flow.steps[activeStep]?.node;
  const activeParticipant =
    activeNodeId !== undefined ? participantIndex.get(activeNodeId) : undefined;

  // The "live" segment is the one whose toStep === activeStep — i.e. the
  // transition INTO the current step. It gets the moving pulse.
  const liveSegment = segments.find((s) => s.toStep === activeStep);

  // For static styling: which participants are visited (first appear ≤ active).
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
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`Map trace for ${flow.name}`}
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
        </defs>

        {/* ── Connectors (one per transition) ─────────────────────────────── */}
        {segments.map((seg) => {
          const a = layout.points[seg.fromParticipant];
          const b = layout.points[seg.toParticipant];
          if (!a || !b) return null;

          // Shorten the line so it stops at the node circumference (cleaner
          // arrowheads, and the pulse lands on the rim).
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

          const stroke = isLive ? '#F7A501' : isPast ? '#BFC1B7' : '#DCDFD2';
          const dashed = !seg.real;

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
                opacity={seg.toStep > activeStep ? 0.5 : 1}
                style={{ transition: 'stroke 220ms ease-out, opacity 220ms ease-out' }}
              />
              {/* Moving pulse dot — only on the live segment. Animated purely
                  in CSS via SMIL-free keyframes keyed off the segment id so it
                  restarts cleanly each time a new step becomes active. */}
              {isLive && (
                <circle
                  key={`pulse-${seg.toStep}`}
                  r={5}
                  fill="#F7A501"
                  stroke="#DD9001"
                  strokeWidth={1}
                >
                  {/* SMIL motion — reliable across browsers for SVG, restarts
                      cleanly because the element is keyed per active step. */}
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
                    keyTimes="0;0.2;1"
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
                  r={layout.nodeR + 7}
                  fill="none"
                  stroke="#F7A501"
                  strokeWidth={2}
                  opacity={0.35}
                  style={{ animation: 'flowNodePop 600ms ease-out both' }}
                />
              )}
              <circle
                r={layout.nodeR}
                fill={fill}
                stroke={border}
                strokeWidth={isActive ? 2.5 : 1.5}
                opacity={visited || isActive ? 1 : 0.6}
                style={{
                  transition:
                    'fill 220ms ease-out, stroke 220ms ease-out, opacity 220ms ease-out',
                }}
              />
              {/* Cluster accent dot (skip when active — yellow fill owns it) */}
              {!isActive && (
                <circle cx={0} cy={-layout.nodeR + 8} r={3.5} fill={accent} />
              )}
              {/* Order index badge */}
              <text
                x={0}
                y={2}
                textAnchor="middle"
                fontSize={13}
                fontWeight={800}
                fontFamily="Nunito, system-ui"
                fill={isActive ? '#151515' : labelColor}
              >
                {p.firstStep + 1}
              </text>
              {/* Label below the node */}
              <text
                x={0}
                y={layout.nodeR + 16}
                textAnchor="middle"
                fontSize={11}
                fontWeight={isActive ? 700 : 500}
                fontFamily="Nunito, system-ui"
                fill={labelColor}
                style={{ transition: 'fill 220ms ease-out' }}
              >
                {truncate(p.label, 18)}
              </text>
            </g>
          );
        })}
      </svg>

      <style>{`
        @keyframes flowNodePop {
          from { transform: scale(0.6); opacity: 0.6; }
          to   { transform: scale(1.15); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
