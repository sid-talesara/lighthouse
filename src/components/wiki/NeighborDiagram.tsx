/**
 * NeighborDiagram — custom SVG mini dependency graph for the wiki drawer.
 *
 * Deliberately NOT a second @xyflow/react instance (that would add bundle
 * weight, a second layout engine, and scroll-fighting). For 3–12 neighbors a
 * bespoke SVG is ~80 lines, renders instantly, and matches the design exactly.
 *
 * Layout:
 *   incoming neighbors  → left column   (point INTO the center node)
 *   center node         → middle (yellow circle)
 *   outgoing neighbors  → right column  (center points OUT to them)
 *
 * Clicking a neighbor pill calls onNavigate(id) → drawer pushes that wiki page.
 */

import { useState } from 'react';
import type { NeighborRef } from '../../lib/assembleWiki';

interface Props {
  centerLabel: string;
  neighbors: NeighborRef[];
  onNavigate: (id: string) => void;
}

const PILL_W = 150;
const PILL_H = 30;
const ROW_GAP = 14;
const CANVAS_W = 520;
const CENTER_R = 38;
const PAD_Y = 28;

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function NeighborDiagram({ centerLabel, neighbors, onNavigate }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const MAX = 8;
  const incoming = neighbors.filter((n) => n.direction === 'in');
  const outgoing = neighbors.filter((n) => n.direction === 'out');
  const inShown = incoming.slice(0, MAX);
  const outShown = outgoing.slice(0, MAX);

  const rows = Math.max(inShown.length, outShown.length, 1);
  const colHeight = rows * (PILL_H + ROW_GAP) - ROW_GAP;
  const height = Math.max(180, colHeight + PAD_Y * 2);

  const leftX = 16;
  const rightX = CANVAS_W - PILL_W - 16;
  const centerX = CANVAS_W / 2;
  const centerY = height / 2;

  // Distribute a column's pills vertically centered around centerY.
  const colY = (count: number, i: number) => {
    const total = count * (PILL_H + ROW_GAP) - ROW_GAP;
    const start = centerY - total / 2;
    return start + i * (PILL_H + ROW_GAP);
  };

  const edge = (
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    key: string,
    active: boolean,
  ) => {
    const midX = (sx + ex) / 2;
    const d = `M ${sx},${sy} C ${midX},${sy} ${midX},${ey} ${ex},${ey}`;
    return (
      <path
        key={key}
        d={d}
        fill="none"
        stroke={active ? '#DD9001' : '#BFC1B7'}
        strokeWidth={active ? 2 : 1.5}
        markerEnd={active ? 'url(#wiki-arrow-active)' : 'url(#wiki-arrow)'}
        style={{ transition: 'stroke 120ms ease-out' }}
      />
    );
  };

  return (
    <div className="overflow-x-auto rounded-ph border border-ph-border bg-[#EEEFE9]">
      <svg
        viewBox={`0 0 ${CANVAS_W} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Dependency mini-diagram"
      >
        <defs>
          <marker id="wiki-arrow" markerWidth={8} markerHeight={6} refX={7} refY={3} orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#BFC1B7" />
          </marker>
          <marker
            id="wiki-arrow-active"
            markerWidth={8}
            markerHeight={6}
            refX={7}
            refY={3}
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#DD9001" />
          </marker>
        </defs>

        {/* Incoming edges: neighbor (right edge) → center (left edge) */}
        {inShown.map((n, i) => {
          const y = colY(inShown.length, i) + PILL_H / 2;
          const active = hovered === n.node.id;
          return edge(
            leftX + PILL_W,
            y,
            centerX - CENTER_R,
            centerY,
            `in-e-${n.node.id}`,
            active,
          );
        })}

        {/* Outgoing edges: center (right edge) → neighbor (left edge) */}
        {outShown.map((n, i) => {
          const y = colY(outShown.length, i) + PILL_H / 2;
          const active = hovered === n.node.id;
          return edge(
            centerX + CENTER_R,
            centerY,
            rightX,
            y,
            `out-e-${n.node.id}`,
            active,
          );
        })}

        {/* Edge kind labels (incoming) */}
        {inShown.map((n, i) => {
          const y = colY(inShown.length, i) + PILL_H / 2;
          const mx = (leftX + PILL_W + centerX - CENTER_R) / 2;
          return (
            <text
              key={`in-l-${n.node.id}`}
              x={mx}
              y={(y + centerY) / 2 - 5}
              textAnchor="middle"
              fill="#9B9C92"
              fontSize={9}
              fontFamily="system-ui"
            >
              {n.kind}
            </text>
          );
        })}
        {outShown.map((n, i) => {
          const y = colY(outShown.length, i) + PILL_H / 2;
          const mx = (centerX + CENTER_R + rightX) / 2;
          return (
            <text
              key={`out-l-${n.node.id}`}
              x={mx}
              y={(y + centerY) / 2 - 5}
              textAnchor="middle"
              fill="#9B9C92"
              fontSize={9}
              fontFamily="system-ui"
            >
              {n.kind}
            </text>
          );
        })}

        {/* Center node */}
        <circle cx={centerX} cy={centerY} r={CENTER_R} fill="#F7A501" stroke="#DD9001" strokeWidth={1.5} />
        <text
          x={centerX}
          y={centerY}
          textAnchor="middle"
          dy="0.35em"
          fill="#151515"
          fontSize={11}
          fontWeight={700}
          fontFamily="Nunito, system-ui"
        >
          {truncate(centerLabel, 12)}
        </text>

        {/* Neighbor pills */}
        {inShown.map((n, i) => (
          <NeighborPill
            key={`in-p-${n.node.id}`}
            x={leftX}
            y={colY(inShown.length, i)}
            label={n.node.label}
            active={hovered === n.node.id}
            onEnter={() => setHovered(n.node.id)}
            onLeave={() => setHovered(null)}
            onClick={() => onNavigate(n.node.id)}
          />
        ))}
        {outShown.map((n, i) => (
          <NeighborPill
            key={`out-p-${n.node.id}`}
            x={rightX}
            y={colY(outShown.length, i)}
            label={n.node.label}
            active={hovered === n.node.id}
            onEnter={() => setHovered(n.node.id)}
            onLeave={() => setHovered(null)}
            onClick={() => onNavigate(n.node.id)}
          />
        ))}

        {/* Column captions */}
        <text x={leftX} y={14} fill="#9B9C92" fontSize={9} fontWeight={700} fontFamily="Nunito, system-ui" letterSpacing="0.08em">
          INCOMING {incoming.length > 0 ? `(${incoming.length})` : ''}
        </text>
        <text x={rightX} y={14} fill="#9B9C92" fontSize={9} fontWeight={700} fontFamily="Nunito, system-ui" letterSpacing="0.08em">
          OUTGOING {outgoing.length > 0 ? `(${outgoing.length})` : ''}
        </text>

        {/* Overflow note */}
        {incoming.length > MAX && (
          <text x={leftX} y={height - 6} fill="#9B9C92" fontSize={9} fontFamily="system-ui">
            +{incoming.length - MAX} more incoming
          </text>
        )}
        {outgoing.length > MAX && (
          <text x={rightX} y={height - 6} fill="#9B9C92" fontSize={9} fontFamily="system-ui">
            +{outgoing.length - MAX} more outgoing
          </text>
        )}
      </svg>
    </div>
  );
}

function NeighborPill({
  x,
  y,
  label,
  active,
  onEnter,
  onLeave,
  onClick,
}: {
  x: number;
  y: number;
  label: string;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  return (
    <g
      style={{ cursor: 'pointer' }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      role="button"
      aria-label={`Open ${label} wiki`}
    >
      <rect
        x={x}
        y={y}
        width={PILL_W}
        height={PILL_H}
        rx={6}
        fill="#FFFFFF"
        stroke={active ? '#9B9C92' : '#BFC1B7'}
        strokeWidth={active ? 1.5 : 1}
        style={{ transition: 'stroke 120ms ease-out' }}
      />
      <text
        x={x + 12}
        y={y + PILL_H / 2}
        dy="0.35em"
        fill={active ? '#151515' : '#4D4F46'}
        fontSize={11}
        fontFamily="system-ui"
      >
        {truncate(label, 18)}
      </text>
    </g>
  );
}
