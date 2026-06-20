/**
 * BlastRadiusGraph — custom SVG impact diagram for a PR's blast radius.
 *
 * NOT React Flow (by design — see NeighborDiagram.tsx for the same reasoning).
 * A bespoke SVG gives us full control over the RIPPLE animation, which is the
 * whole point: when a PR is selected the touched nodes pulse first, then their
 * downstream dependents light up outward, ring by ring, as a wave.
 *
 * Layout:
 *   - Touched nodes in a vertical stack at the LEFT (the origin of change),
 *     colored by change kind (added=green, modified=amber, removed=red).
 *   - Affected dependents in COLUMNS by hop distance, increasing to the right.
 *   - Directional edges point dependent → dependency (the way the risk flows
 *     back toward the change). Arrowheads sit on the touched/closer side.
 *
 * Only touched + affected nodes are drawn. The rest of the map is intentionally
 * omitted — this is a focused impact lens, not the whole graph.
 *
 * Clicking any node calls onPick(id) so the parent can persist "show on map"
 * context (onSelectNode + onHighlightNodes).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeKind, EdgeKind } from '../../types/lighthouse';
import type { BlastRadius } from './impact-util';

interface Props {
  blast: BlastRadius;
  /** node id currently selected elsewhere in the app (to ring it). */
  selectedNodeId: string | null;
  /** Click a node in the graph. */
  onPick: (id: string) => void;
  /** Bump this key to replay the ripple (e.g. when a new PR is selected). */
  replayKey: string;
}

const CHANGE_COLOR: Record<ChangeKind, string> = {
  added: '#2C8C66',
  modified: '#DC9300',
  removed: '#CD4239',
};

const NODE_W = 156;
const NODE_H = 38;
const COL_GAP = 78; // horizontal gap between columns
const ROW_GAP = 16; // vertical gap within a column
const PAD_X = 18;
const PAD_TOP = 38;
const PAD_BOTTOM = 22;
const RIPPLE_STEP_MS = 420; // delay between successive rings lighting up

interface Placed {
  id: string;
  label: string;
  x: number;
  y: number;
  /** wave index: 0 = touched, 1..N = affected ring. */
  wave: number;
  change?: ChangeKind;
  hops?: number;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function BlastRadiusGraph({ blast, selectedNodeId, onPick, replayKey }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  // How many waves have "fired" so far (drives the ripple reveal).
  const [wave, setWave] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Columns: column 0 = touched, columns 1..maxHops = affected rings.
  const columns = useMemo<Placed[][]>(() => {
    const cols: Placed[][] = [];
    cols.push(
      blast.touched.map((t) => ({
        id: t.id,
        label: t.label,
        x: 0,
        y: 0,
        wave: 0,
        change: t.change,
      })),
    );
    for (let h = 1; h <= blast.maxHops; h++) {
      const ring = blast.affected.filter((a) => a.hops === h);
      cols.push(
        ring.map((a) => ({
          id: a.id,
          label: a.label,
          x: 0,
          y: 0,
          wave: h,
          hops: a.hops,
        })),
      );
    }
    return cols;
  }, [blast]);

  const totalWaves = columns.length;

  // Geometry.
  const { placed, width, height, edges } = useMemo(() => {
    const tallest = Math.max(1, ...columns.map((c) => c.length));
    const height = Math.max(
      160,
      PAD_TOP + PAD_BOTTOM + tallest * NODE_H + (tallest - 1) * ROW_GAP,
    );
    const width = PAD_X * 2 + columns.length * NODE_W + (columns.length - 1) * COL_GAP;

    const placedById = new Map<string, Placed>();
    const placed: Placed[] = [];
    columns.forEach((col, ci) => {
      const colHeight = col.length * NODE_H + (col.length - 1) * ROW_GAP;
      const startY = (height - colHeight) / 2;
      const x = PAD_X + ci * (NODE_W + COL_GAP);
      col.forEach((node, ri) => {
        const y = startY + ri * (NODE_H + ROW_GAP);
        const p: Placed = { ...node, x, y };
        placed.push(p);
        placedById.set(p.id, p);
      });
    });

    // Edges (dependent -> dependency). Both endpoints must be placed.
    const edges = blast.edges
      .map((e) => {
        const from = placedById.get(e.from); // dependent
        const to = placedById.get(e.to); // dependency / closer to touched
        if (!from || !to) return null;
        return { from, to, kind: e.kind };
      })
      .filter((e): e is { from: Placed; to: Placed; kind: EdgeKind } => e !== null);

    return { placed, width, height, edges };
  }, [columns, blast.edges]);

  // ── Ripple driver: reveal wave 0 immediately, then each ring in sequence ────
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setWave(0); // touched pulse first
    for (let w = 1; w < totalWaves; w++) {
      timers.current.push(
        setTimeout(() => setWave((cur) => Math.max(cur, w)), w * RIPPLE_STEP_MS),
      );
    }
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [replayKey, totalWaves]);

  const isLit = (w: number) => w <= wave;

  return (
    <div
      style={{
        overflowX: 'auto',
        borderRadius: 6,
        border: '1px solid #BFC1B7',
        background: '#EEEFE9',
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={Math.max(width, 480)}
        height={height}
        role="img"
        aria-label="Blast-radius impact diagram"
        style={{ display: 'block', minWidth: '100%' }}
      >
        <defs>
          <marker id="br-arrow" markerWidth={8} markerHeight={6} refX={7} refY={3} orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#BFC1B7" />
          </marker>
          <marker
            id="br-arrow-lit"
            markerWidth={8}
            markerHeight={6}
            refX={7}
            refY={3}
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#DD9001" />
          </marker>
        </defs>

        {/* Column captions */}
        {columns.map((_, ci) => {
          const x = PAD_X + ci * (NODE_W + COL_GAP) + NODE_W / 2;
          const label = ci === 0 ? 'CHANGED' : ci === 1 ? 'DIRECT DEPENDENTS' : `+${ci} HOPS`;
          return (
            <text
              key={`cap-${ci}`}
              x={x}
              y={20}
              textAnchor="middle"
              fill="#9B9C92"
              fontSize={9}
              fontWeight={700}
              fontFamily="Nunito, system-ui"
              letterSpacing="0.08em"
              style={{ opacity: isLit(ci) ? 1 : 0.25, transition: 'opacity 300ms ease-out' }}
            >
              {label}
            </text>
          );
        })}

        {/* Edges */}
        {edges.map((e, i) => {
          // dependent (from) sits in a higher column; arrow points left toward `to`.
          const sx = e.from.x; // left edge of dependent
          const sy = e.from.y + NODE_H / 2;
          const ex = e.to.x + NODE_W; // right edge of dependency
          const ey = e.to.y + NODE_H / 2;
          const midX = (sx + ex) / 2;
          const d = `M ${sx},${sy} C ${midX},${sy} ${midX},${ey} ${ex},${ey}`;
          // Edge lights up when the dependent's wave is reached.
          const lit = isLit(e.from.wave);
          const active = hovered === e.from.id || hovered === e.to.id;
          const on = lit && active;
          return (
            <path
              key={`e-${i}`}
              d={d}
              fill="none"
              stroke={on ? '#DD9001' : lit ? '#BFC1B7' : '#DCDFD2'}
              strokeWidth={on ? 2 : 1.5}
              markerEnd={on ? 'url(#br-arrow-lit)' : 'url(#br-arrow)'}
              style={{
                opacity: lit ? 1 : 0.35,
                transition: 'opacity 350ms ease-out, stroke 120ms ease-out',
              }}
            />
          );
        })}

        {/* Nodes */}
        {placed.map((p) => {
          const lit = isLit(p.wave);
          const isTouched = p.wave === 0;
          const isSelected = selectedNodeId === p.id;
          const accent = isTouched ? CHANGE_COLOR[p.change ?? 'modified'] : '#9B9C92';
          const fill = isTouched
            ? '#FFFFFF'
            : lit
              ? '#FFFFFF'
              : '#F4F5F0';
          const justFired = p.wave === wave; // the wave currently arriving
          return (
            <g
              key={p.id}
              transform={`translate(${p.x}, ${p.y})`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(p.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onPick(p.id)}
              role="button"
              aria-label={`${p.label} — ${isTouched ? p.change : `affected, ${p.hops} hop${
                (p.hops ?? 0) > 1 ? 's' : ''
              } away`}`}
            >
              {/* Pulse halo on the wave that's arriving */}
              {lit && (
                <rect
                  x={-3}
                  y={-3}
                  width={NODE_W + 6}
                  height={NODE_H + 6}
                  rx={8}
                  fill="none"
                  stroke={accent}
                  strokeWidth={2}
                  style={{
                    transformOrigin: 'center',
                    transformBox: 'fill-box',
                    animation: justFired ? 'brPulse 700ms ease-out' : 'none',
                    opacity: 0,
                  }}
                />
              )}
              {/* Accent stripe */}
              <rect x={0} y={0} width={4} height={NODE_H} rx={2} fill={accent} opacity={lit ? 1 : 0.4} />
              <rect
                x={0}
                y={0}
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill={fill}
                stroke={isSelected ? '#F7A501' : hovered === p.id ? '#9B9C92' : '#BFC1B7'}
                strokeWidth={isSelected ? 1.8 : 1}
                style={{
                  opacity: lit ? 1 : 0.55,
                  transition: 'opacity 350ms ease-out, stroke 120ms ease-out',
                }}
              />
              <text
                x={14}
                y={NODE_H / 2 - 4}
                dy="0.35em"
                fill={lit ? '#151515' : '#9B9C92'}
                fontSize={11.5}
                fontWeight={isTouched ? 700 : 600}
                fontFamily="Nunito, system-ui"
                style={{ transition: 'fill 350ms ease-out' }}
              >
                {truncate(p.label, 17)}
              </text>
              <text
                x={14}
                y={NODE_H - 9}
                fill={accent}
                fontSize={8.5}
                fontWeight={700}
                fontFamily="Nunito, system-ui"
                letterSpacing="0.06em"
                style={{ opacity: lit ? 0.95 : 0.45, transition: 'opacity 350ms ease-out' }}
              >
                {isTouched
                  ? (p.change ?? '').toUpperCase()
                  : `${p.hops} HOP${(p.hops ?? 0) > 1 ? 'S' : ''} AWAY`}
              </text>
            </g>
          );
        })}
      </svg>

      <style>{`
        @keyframes brPulse {
          0%   { opacity: 0.9; transform: scale(1); }
          70%  { opacity: 0.35; transform: scale(1.06); }
          100% { opacity: 0;    transform: scale(1.12); }
        }
      `}</style>
    </div>
  );
}
