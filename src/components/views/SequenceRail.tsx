/**
 * SequenceRail — a real sequence-diagram-style rail, synced to the trace.
 *
 * Layout:
 *   • One vertical LANE (column) per participating module, ordered by first
 *     appearance, left→right. Each lane has a header (module label + cluster
 *     color) and a dashed lifeline running top→bottom.
 *   • Each step is a time-ordered ROW (top→bottom = time). A step draws a
 *     horizontal ARROW from the previous step's lane to the current step's
 *     lane, labeled with the step action/description. The very first step has
 *     no predecessor, so it renders as an "entry" marker on its own lane.
 *   • The row for the currently-active step is emphasized (ph-yellow) IN SYNC
 *     with the map trace, because both read the same `activeStep` prop.
 *
 * Pure SVG so arrows, self-calls, and the active-row glow are fully styleable.
 */

import { useMemo } from 'react';
import type { Flow } from '../../types/lighthouse';
import { clusterColor, type Participant } from './flowEngine';

interface Props {
  flow: Flow;
  participants: Participant[];
  activeStep: number;
  onSelectStep: (stepIndex: number) => void;
}

const LANE_W = 150;
const HEADER_H = 56;
const ROW_H = 54;
const LEFT_PAD = 16;
const RIGHT_PAD = 16;

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function SequenceRail({
  flow,
  participants,
  activeStep,
  onSelectStep,
}: Props) {
  const laneIndex = useMemo(
    () => new Map(participants.map((p, i) => [p.id, i])),
    [participants],
  );

  const laneCount = participants.length;
  const width = LEFT_PAD + RIGHT_PAD + laneCount * LANE_W;
  const laneX = (i: number) => LEFT_PAD + i * LANE_W + LANE_W / 2;

  const steps = flow.steps;
  const height = HEADER_H + steps.length * ROW_H + 16;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${Math.max(width, 320)} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Sequence diagram for ${flow.name}`}
        style={{ display: 'block', minWidth: Math.min(width, 640) }}
      >
        <defs>
          <marker
            id="seq-arrow"
            markerWidth={9}
            markerHeight={7}
            refX={8}
            refY={3.5}
            orient="auto"
          >
            <polygon points="0 0, 9 3.5, 0 7" fill="#9B9C92" />
          </marker>
          <marker
            id="seq-arrow-live"
            markerWidth={10}
            markerHeight={8}
            refX={8}
            refY={4}
            orient="auto"
          >
            <polygon points="0 0, 10 4, 0 8" fill="#DD9001" />
          </marker>
        </defs>

        {/* ── Lifelines + lane headers ────────────────────────────────────── */}
        {participants.map((p, i) => {
          const x = laneX(i);
          const accent = clusterColor(p.cluster?.id);
          const laneActive = flow.steps[activeStep]?.node === p.id;
          return (
            <g key={`lane-${p.id}`}>
              {/* Lifeline */}
              <line
                x1={x}
                y1={HEADER_H}
                x2={x}
                y2={height - 8}
                stroke={laneActive ? '#F7A501' : '#D0D1C9'}
                strokeWidth={laneActive ? 2 : 1}
                strokeDasharray="3 4"
                style={{ transition: 'stroke 200ms ease-out' }}
              />
              {/* Header chip */}
              <rect
                x={x - LANE_W / 2 + 8}
                y={8}
                width={LANE_W - 16}
                height={HEADER_H - 16}
                rx={6}
                fill="#FFFFFF"
                stroke={laneActive ? '#F7A501' : '#BFC1B7'}
                strokeWidth={laneActive ? 2 : 1}
                style={{ transition: 'stroke 200ms ease-out' }}
              />
              <rect
                x={x - LANE_W / 2 + 8}
                y={8}
                width={4}
                height={HEADER_H - 16}
                rx={2}
                fill={accent}
              />
              <text
                x={x}
                y={26}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fontFamily="Nunito, system-ui"
                fill="#151515"
              >
                {truncate(p.label, 16)}
              </text>
              <text
                x={x}
                y={40}
                textAnchor="middle"
                fontSize={9}
                fontWeight={600}
                fontFamily="Nunito, system-ui"
                fill="#9B9C92"
                letterSpacing="0.04em"
              >
                {truncate((p.cluster?.label ?? 'module').toUpperCase(), 18)}
              </text>
            </g>
          );
        })}

        {/* ── Step rows (arrows between lanes) ─────────────────────────────── */}
        {steps.map((step, i) => {
          const rowY = HEADER_H + i * ROW_H + ROW_H / 2;
          const toLane = laneIndex.get(step.node);
          if (toLane === undefined) return null;
          const toX = laneX(toLane);

          const prevNode = i > 0 ? steps[i - 1].node : undefined;
          const fromLane =
            prevNode !== undefined ? laneIndex.get(prevNode) : undefined;
          const isActive = i === activeStep;

          const rowStroke = isActive ? '#DD9001' : '#9B9C92';
          const labelColor = isActive ? '#151515' : '#6C6E63';

          // Clickable full-row hit area + active highlight band.
          const band = (
            <rect
              x={2}
              y={rowY - ROW_H / 2 + 2}
              width={Math.max(width, 320) - 4}
              height={ROW_H - 4}
              rx={6}
              fill={isActive ? 'rgba(247,165,1,0.08)' : 'transparent'}
              stroke={isActive ? 'rgba(247,165,1,0.45)' : 'transparent'}
              strokeWidth={1}
              style={{ transition: 'fill 200ms ease-out, stroke 200ms ease-out' }}
            />
          );

          let connector;
          if (fromLane === undefined || fromLane === toLane) {
            // Entry into the flow, OR a self-call on the same lane: draw a small
            // looping/entry glyph on the target lane.
            const selfW = 26;
            if (fromLane === undefined) {
              // Entry marker: arrow coming in from the left margin.
              connector = (
                <line
                  x1={Math.max(toX - 70, 6)}
                  y1={rowY}
                  x2={toX}
                  y2={rowY}
                  stroke={rowStroke}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  markerEnd={isActive ? 'url(#seq-arrow-live)' : 'url(#seq-arrow)'}
                  style={{ transition: 'stroke 200ms ease-out' }}
                />
              );
            } else {
              // Self-call loop.
              connector = (
                <path
                  d={`M ${toX} ${rowY - 8} h ${selfW} v 16 h ${-selfW}`}
                  fill="none"
                  stroke={rowStroke}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  markerEnd={isActive ? 'url(#seq-arrow-live)' : 'url(#seq-arrow)'}
                  style={{ transition: 'stroke 200ms ease-out' }}
                />
              );
            }
          } else {
            const fromX = laneX(fromLane);
            const dir = toX > fromX ? 1 : -1;
            connector = (
              <line
                x1={fromX + dir * 6}
                y1={rowY}
                x2={toX - dir * 6}
                y2={rowY}
                stroke={rowStroke}
                strokeWidth={isActive ? 2.5 : 1.5}
                markerEnd={isActive ? 'url(#seq-arrow-live)' : 'url(#seq-arrow)'}
                style={{ transition: 'stroke 200ms ease-out' }}
              />
            );
          }

          // Activation block (small filled rect) on the target lifeline.
          const activation = (
            <rect
              x={toX - 5}
              y={rowY - ROW_H / 2 + 6}
              width={10}
              height={ROW_H - 12}
              rx={2}
              fill={isActive ? '#F7A501' : '#E5E7E0'}
              stroke={isActive ? '#DD9001' : '#BFC1B7'}
              strokeWidth={1}
              style={{ transition: 'fill 200ms ease-out, stroke 200ms ease-out' }}
            />
          );

          // Label: midpoint of the connector, above the line.
          const labelX =
            fromLane !== undefined && fromLane !== toLane
              ? (laneX(fromLane) + toX) / 2
              : toX + 18;
          const labelAnchor: 'middle' | 'start' =
            fromLane !== undefined && fromLane !== toLane ? 'middle' : 'start';

          return (
            <g
              key={`step-${i}`}
              onClick={() => onSelectStep(i)}
              style={{ cursor: 'pointer' }}
              role="button"
              aria-current={isActive ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${step.description}`}
            >
              {band}
              {/* Step index gutter */}
              <text
                x={8}
                y={rowY + 4}
                fontSize={10}
                fontWeight={700}
                fontFamily="IBM Plex Mono, monospace"
                fill={isActive ? '#DD9001' : '#B6B7AF'}
              >
                {String(i + 1).padStart(2, '0')}
              </text>
              {connector}
              {activation}
              <text
                x={labelX}
                y={rowY - 11}
                textAnchor={labelAnchor}
                fontSize={10.5}
                fontWeight={isActive ? 700 : 500}
                fontFamily="system-ui"
                fill={labelColor}
                style={{ transition: 'fill 200ms ease-out' }}
              >
                {truncate(step.description, 46)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
