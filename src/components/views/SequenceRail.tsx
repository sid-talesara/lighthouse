/**
 * SequenceRail — a real sequence-diagram-style rail, synced to the trace.
 *
 * Layout:
 *   • One vertical LANE (column) per participating module, ordered by first
 *     appearance, left→right. Each lane has a header (module label + cluster
 *     color chip) and a dashed lifeline running top→bottom.
 *   • Each step is a time-ordered ROW (top→bottom = time). A step draws a
 *     horizontal ARROW from the previous step's lane to the current step's
 *     lane, labeled with what happens at that step (plain language).
 *   • The row for the currently-active step is highlighted in yellow — in sync
 *     with the map trace, because both read the same `activeStep` prop.
 *   • A legend and caption explain what the lanes and arrows represent.
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

const LANE_W = 160;
const HEADER_H = 64;
const ROW_H = 58;
const LEFT_PAD = 28;
const RIGHT_PAD = 16;

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Break label into two lines at ~15 chars for SVG header readability. */
function wrapLabel(s: string, maxChars = 15): [string, string | null] {
  if (s.length <= maxChars) return [s, null];
  const words = s.split(/\s+/);
  if (words.length >= 2) {
    // Try to split roughly in half by word
    let first = '';
    let second = '';
    let placed = false;
    for (const w of words) {
      if (!placed && (first + ' ' + w).trim().length > maxChars) {
        placed = true;
        second = w;
      } else if (placed) {
        second += ' ' + w;
      } else {
        first = first ? first + ' ' + w : w;
      }
    }
    if (first && second) return [first.trim(), second.trim()];
  }
  return [s.slice(0, maxChars) + '—', s.slice(maxChars)];
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
  const height = HEADER_H + steps.length * ROW_H + 20;

  return (
    <div>
      {/* ── Legend + caption ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '6px 12px',
          borderBottom: '1px solid #DCDFD2',
          background: '#F5F5F0',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontFamily: '"Nunito", system-ui, sans-serif',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#6C6E63',
            flexShrink: 0,
          }}
        >
          Sequence — time flows top → bottom
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SequenceLegendItem
            symbol={
              <svg width={32} height={14} style={{ display: 'block' }}>
                <line x1={2} y1={7} x2={24} y2={7} stroke="#DD9001" strokeWidth={2} />
                <polygon points="22,4 30,7 22,10" fill="#DD9001" />
              </svg>
            }
            label="Active step (request moves here)"
          />
          <SequenceLegendItem
            symbol={
              <svg width={32} height={14} style={{ display: 'block' }}>
                <line x1={2} y1={7} x2={24} y2={7} stroke="#9B9C92" strokeWidth={1.5} />
                <polygon points="22,4 30,7 22,10" fill="#9B9C92" />
              </svg>
            }
            label="Past step"
          />
          <SequenceLegendItem
            symbol={
              <svg width={10} height={14} style={{ display: 'block' }}>
                <line x1={5} y1={0} x2={5} y2={14} stroke="#D0D1C9" strokeWidth={1} strokeDasharray="3 3" />
              </svg>
            }
            label="Module lifeline"
          />
          <SequenceLegendItem
            symbol={
              <svg width={12} height={14} style={{ display: 'block' }}>
                <rect x={1} y={2} width={10} height={10} rx={2} fill="#F7A501" stroke="#DD9001" strokeWidth={1} />
              </svg>
            }
            label="Activation block"
          />
        </div>
      </div>

      {/* ── Diagram ─────────────────────────────────────────────────────────── */}
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

          {/* ── Lane headers + lifelines ─────────────────────────────────────── */}
          {participants.map((p, i) => {
            const x = laneX(i);
            const accent = clusterColor(p.cluster?.id);
            const laneActive = flow.steps[activeStep]?.node === p.id;
            const [line1, line2] = wrapLabel(p.label, 17);

            return (
              <g key={`lane-${p.id}`}>
                {/* Lifeline */}
                <line
                  x1={x}
                  y1={HEADER_H}
                  x2={x}
                  y2={height - 10}
                  stroke={laneActive ? '#F7A501' : '#D0D1C9'}
                  strokeWidth={laneActive ? 2 : 1}
                  strokeDasharray="4 4"
                  style={{ transition: 'stroke 200ms ease-out' }}
                />

                {/* Header card */}
                <rect
                  x={x - LANE_W / 2 + 6}
                  y={6}
                  width={LANE_W - 12}
                  height={HEADER_H - 12}
                  rx={6}
                  fill="#FFFFFF"
                  stroke={laneActive ? '#F7A501' : accent}
                  strokeWidth={laneActive ? 2 : 1.5}
                  style={{ transition: 'stroke 200ms ease-out' }}
                />
                {/* Color accent stripe on left of header */}
                <rect
                  x={x - LANE_W / 2 + 6}
                  y={6}
                  width={4}
                  height={HEADER_H - 12}
                  rx={2}
                  fill={accent}
                />
                {/* Module name — line 1 */}
                <text
                  x={x + 2}
                  y={line2 ? 24 : 28}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fontFamily="Nunito, system-ui"
                  fill="#151515"
                >
                  {line1}
                </text>
                {/* Module name — line 2 */}
                {line2 && (
                  <text
                    x={x + 2}
                    y={37}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fontFamily="Nunito, system-ui"
                    fill="#151515"
                  >
                    {truncate(line2, 18)}
                  </text>
                )}
                {/* Cluster label below module name */}
                <text
                  x={x + 2}
                  y={line2 ? 51 : 43}
                  textAnchor="middle"
                  fontSize={8.5}
                  fontWeight={600}
                  fontFamily="IBM Plex Mono, monospace"
                  fill={accent}
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
            const isPast = i < activeStep;

            const rowStroke = isActive ? '#DD9001' : isPast ? '#9B9C92' : '#C5C6BE';
            const labelColor = isActive ? '#151515' : isPast ? '#4D4F46' : '#9B9C92';

            // Clickable full-row hit area + active highlight band.
            const band = (
              <rect
                x={2}
                y={rowY - ROW_H / 2 + 2}
                width={Math.max(width, 320) - 4}
                height={ROW_H - 4}
                rx={6}
                fill={
                  isActive
                    ? 'rgba(247,165,1,0.08)'
                    : isPast
                    ? 'transparent'
                    : 'transparent'
                }
                stroke={isActive ? 'rgba(247,165,1,0.45)' : 'transparent'}
                strokeWidth={1}
                style={{ transition: 'fill 200ms ease-out, stroke 200ms ease-out' }}
              />
            );

            let connector;
            if (fromLane === undefined || fromLane === toLane) {
              if (fromLane === undefined) {
                // Entry marker: arrow coming in from the left margin.
                connector = (
                  <line
                    x1={Math.max(toX - 80, LEFT_PAD - 6)}
                    y1={rowY}
                    x2={toX - 6}
                    y2={rowY}
                    stroke={rowStroke}
                    strokeWidth={isActive ? 2.5 : 1.5}
                    markerEnd={isActive ? 'url(#seq-arrow-live)' : 'url(#seq-arrow)'}
                    style={{ transition: 'stroke 200ms ease-out' }}
                  />
                );
              } else {
                // Self-call loop.
                const selfW = 28;
                connector = (
                  <path
                    d={`M ${toX} ${rowY - 10} h ${selfW} v 20 h ${-selfW}`}
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
                  x1={fromX + dir * 8}
                  y1={rowY}
                  x2={toX - dir * 8}
                  y2={rowY}
                  stroke={rowStroke}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  markerEnd={isActive ? 'url(#seq-arrow-live)' : 'url(#seq-arrow)'}
                  style={{ transition: 'stroke 200ms ease-out' }}
                />
              );
            }

            // Activation block on the target lifeline.
            const activation = (
              <rect
                x={toX - 5}
                y={rowY - ROW_H / 2 + 8}
                width={10}
                height={ROW_H - 16}
                rx={2}
                fill={isActive ? '#F7A501' : isPast ? '#E5E7E0' : '#F0F0EC'}
                stroke={isActive ? '#DD9001' : '#BFC1B7'}
                strokeWidth={1}
                style={{ transition: 'fill 200ms ease-out, stroke 200ms ease-out' }}
              />
            );

            // Step description label — placed above the connector, centered.
            const labelX =
              fromLane !== undefined && fromLane !== toLane
                ? (laneX(fromLane) + toX) / 2
                : toX + 20;
            const labelAnchor: 'middle' | 'start' =
              fromLane !== undefined && fromLane !== toLane ? 'middle' : 'start';

            // Truncate to ~48 chars for the SVG row — full text shows in detail strip below
            const shortDesc = truncate(step.description, 48);

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
                {/* Step number gutter — left margin */}
                <text
                  x={10}
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
                {/* Description above the arrow */}
                <text
                  x={labelX}
                  y={rowY - 13}
                  textAnchor={labelAnchor}
                  fontSize={10.5}
                  fontWeight={isActive ? 700 : isPast ? 500 : 400}
                  fontFamily="system-ui, sans-serif"
                  fill={labelColor}
                  style={{ transition: 'fill 200ms ease-out' }}
                >
                  {shortDesc}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Caption ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '6px 12px 8px',
          borderTop: '1px solid #DCDFD2',
          background: '#F5F5F0',
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
          Each column = one module/service. Time flows top → bottom. Arrows show which module the request moves to at each step. Click any row to jump to that step.
        </span>
      </div>
    </div>
  );
}

// ─── Legend helper ────────────────────────────────────────────────────────────

function SequenceLegendItem({
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
