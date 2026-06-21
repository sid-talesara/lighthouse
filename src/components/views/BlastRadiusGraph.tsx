/**
 * BlastRadiusGraph — a LABELED, self-explanatory impact diagram for a PR.
 *
 * The whole goal of this component is that a first-time viewer understands it
 * without anyone explaining it. To that end it ships with:
 *   - A title + one-line caption stating what the picture shows.
 *   - Persistent column headers: "Changed in this PR" (left), "Direct
 *     dependents" and "+N hops" (right).
 *   - A legend explaining the change colors and what an arrow means
 *     ("A → B = A depends on B").
 *
 * Layout (left → right):
 *   - Touched nodes in a vertical stack at the LEFT (the origin of change),
 *     colored by change kind (added=green, modified=amber, removed=red).
 *   - Affected dependents in COLUMNS by hop distance, increasing to the right.
 *   - Arrows point dependent → dependency (toward the change), so the head sits
 *     on the side closer to what was touched.
 *
 * Only touched + affected nodes are drawn — this is a focused impact lens, not
 * the whole map. Clicking any node calls onPick(id) so the parent can mirror the
 * selection onto the Architecture map.
 *
 * Motion: a single, gentle left→right reveal so the eye learns the direction of
 * the ripple once. No looping pulses — clarity over flash.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeKind, EdgeKind } from '../../types/lighthouse';
import type { BlastRadius } from './impact-util';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

interface Props {
  blast: BlastRadius;
  /** node id currently selected elsewhere in the app (to ring it). */
  selectedNodeId: string | null;
  /** Click a node in the graph. */
  onPick: (id: string) => void;
  /** Bump this key to replay the reveal (e.g. when a new PR is selected). */
  replayKey: string;
}

const CHANGE_COLOR: Record<ChangeKind, string> = {
  added: '#2C8C66',
  modified: '#DC9300',
  removed: '#CD4239',
};

const CHANGE_LABEL: Record<ChangeKind, string> = {
  added: 'Added',
  modified: 'Modified',
  removed: 'Removed',
};

const AFFECTED_COLOR = '#6C6E63'; // neutral olive for downstream dependents

const NODE_W = 168;
const NODE_H = 44;
const COL_GAP = 84; // horizontal gap between columns
const ROW_GAP = 16; // vertical gap within a column
const PAD_X = 20;
const PAD_TOP = 44; // room for column headers
const PAD_BOTTOM = 20;
const REVEAL_STEP_MS = 320; // delay between successive columns appearing

interface Placed {
  id: string;
  label: string;
  x: number;
  y: number;
  /** column index: 0 = touched, 1..N = affected ring. */
  wave: number;
  change?: ChangeKind;
  hops?: number;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function BlastRadiusGraph({ blast, selectedNodeId, onPick, replayKey }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  // How many columns have been revealed so far (gentle left→right reveal).
  const [wave, setWave] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Zoom / pan ──────────────────────────────────────────────────────────────
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

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
      150,
      PAD_TOP + PAD_BOTTOM + tallest * NODE_H + (tallest - 1) * ROW_GAP,
    );
    const width = PAD_X * 2 + columns.length * NODE_W + (columns.length - 1) * COL_GAP;

    const placedById = new Map<string, Placed>();
    const placed: Placed[] = [];
    columns.forEach((col, ci) => {
      const colHeight = col.length * NODE_H + (col.length - 1) * ROW_GAP;
      const startY = PAD_TOP + (height - PAD_TOP - PAD_BOTTOM - colHeight) / 2;
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

  // ── Reveal driver: column 0 shows immediately, then each column in sequence ──
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setWave(0);
    for (let w = 1; w < totalWaves; w++) {
      timers.current.push(
        setTimeout(() => setWave((cur) => Math.max(cur, w)), w * REVEAL_STEP_MS),
      );
    }
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [replayKey, totalWaves]);

  const isLit = (w: number) => w <= wave;

  // Reset viewport when a new PR is selected.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [replayKey]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setZoom((z) => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
      const ratio = next / z;
      setPan((p) => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }));
      return next;
    });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-node]')) return; // let node clicks through
      drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pan],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    drag.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  }, []);

  const adjustZoom = useCallback((dir: 1 | -1) => {
    const vp = viewportRef.current;
    const cx = vp ? vp.clientWidth / 2 : 0;
    const cy = vp ? vp.clientHeight / 2 : 0;
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, dir === 1 ? z * 1.2 : z / 1.2));
      const ratio = next / z;
      setPan((p) => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }));
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return (
    <div>
      <div
        ref={viewportRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        style={{
          position: 'relative',
          height: 360,
          overflow: 'hidden',
          borderRadius: 6,
          border: '1px solid #BFC1B7',
          background: '#FBFBF9',
          cursor: drag.current ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        {/* Zoom controls */}
        <div
          data-node
          style={{ position: 'absolute', top: 10, right: 10, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          {([['+', 1], ['−', -1], ['⤢', 0]] as const).map(([label, dir]) => (
            <button
              key={label}
              aria-label={dir === 1 ? 'Zoom in' : dir === -1 ? 'Zoom out' : 'Reset view'}
              onClick={() => (dir === 0 ? resetView() : adjustZoom(dir))}
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#FFFFFF',
                border: '1px solid #BFC1B7',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 700,
                color: '#4D4F46',
                fontFamily: 'Nunito, system-ui',
                lineHeight: 1,
                padding: 0,
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#E5E7E0')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#FFFFFF')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Transform layer — pan/zoom applied imperatively (never in a keyframe). */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={`Impact diagram. ${blast.touched.length} module(s) changed in this PR; ${blast.affected.length} downstream module(s) depend on them. Arrows point from a dependent to what it depends on.`}
          style={{ display: 'block' }}
        >
          <defs>
            <marker id="br-arrow" markerWidth={9} markerHeight={7} refX={8} refY={3.5} orient="auto">
              <polygon points="0 0, 9 3.5, 0 7" fill="#9B9C92" />
            </marker>
            <marker id="br-arrow-lit" markerWidth={9} markerHeight={7} refX={8} refY={3.5} orient="auto">
              <polygon points="0 0, 9 3.5, 0 7" fill="#DD9001" />
            </marker>
          </defs>

          {/* Column headers — always labeled */}
          {columns.map((_, ci) => {
            const x = PAD_X + ci * (NODE_W + COL_GAP) + NODE_W / 2;
            const label =
              ci === 0
                ? 'CHANGED IN THIS PR'
                : ci === 1
                  ? 'DIRECT DEPENDENTS'
                  : `+${ci} HOPS AWAY`;
            return (
              <text
                key={`cap-${ci}`}
                x={x}
                y={22}
                textAnchor="middle"
                fill={ci === 0 ? '#4D4F46' : '#9B9C92'}
                fontSize={9.5}
                fontWeight={700}
                fontFamily="Nunito, system-ui"
                letterSpacing="0.07em"
                style={{ opacity: isLit(ci) ? 1 : 0.3, transition: 'opacity 300ms ease-out' }}
              >
                {label}
              </text>
            );
          })}

          {/* Edges */}
          {edges.map((e, i) => {
            const sx = e.from.x; // left edge of dependent
            const sy = e.from.y + NODE_H / 2;
            const ex = e.to.x + NODE_W; // right edge of dependency
            const ey = e.to.y + NODE_H / 2;
            const midX = (sx + ex) / 2;
            const d = `M ${sx},${sy} C ${midX},${sy} ${midX},${ey} ${ex},${ey}`;
            const lit = isLit(e.from.wave);
            const active = hovered === e.from.id || hovered === e.to.id;
            const on = lit && active;
            return (
              <path
                key={`e-${i}`}
                d={d}
                fill="none"
                stroke={on ? '#DD9001' : lit ? '#C4C5BC' : '#DCDFD2'}
                strokeWidth={on ? 2 : 1.5}
                markerEnd={on ? 'url(#br-arrow-lit)' : 'url(#br-arrow)'}
                style={{
                  opacity: lit ? 1 : 0,
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
            const isHovered = hovered === p.id;
            const accent = isTouched ? CHANGE_COLOR[p.change ?? 'modified'] : AFFECTED_COLOR;
            return (
              <g
                key={p.id}
                data-node
                transform={`translate(${p.x}, ${p.y})`}
                style={{
                  cursor: 'pointer',
                  opacity: lit ? 1 : 0,
                  transition: 'opacity 350ms ease-out',
                }}
                onMouseEnter={() => setHovered(p.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onPick(p.id)}
                role="button"
                aria-label={`${p.label} — ${
                  isTouched
                    ? `${CHANGE_LABEL[p.change ?? 'modified']} in this PR`
                    : `depends on the change, ${p.hops} hop${(p.hops ?? 0) > 1 ? 's' : ''} away`
                }`}
              >
                {/* Accent stripe (change color for touched, neutral for dependents) */}
                <rect x={0} y={0} width={4} height={NODE_H} rx={2} fill={accent} />
                <rect
                  x={0}
                  y={0}
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  fill="#FFFFFF"
                  stroke={isSelected ? '#F7A501' : isHovered ? '#9B9C92' : '#BFC1B7'}
                  strokeWidth={isSelected ? 1.8 : 1}
                  style={{ transition: 'stroke 120ms ease-out' }}
                />
                <text
                  x={14}
                  y={16}
                  fill="#151515"
                  fontSize={12}
                  fontWeight={isTouched ? 700 : 600}
                  fontFamily="Nunito, system-ui"
                >
                  {truncate(p.label, 18)}
                </text>
                <text
                  x={14}
                  y={32}
                  fill={accent}
                  fontSize={9}
                  fontWeight={700}
                  fontFamily="Nunito, system-ui"
                  letterSpacing="0.05em"
                >
                  {isTouched
                    ? CHANGE_LABEL[p.change ?? 'modified'].toUpperCase()
                    : `${p.hops} HOP${(p.hops ?? 0) > 1 ? 'S' : ''} AWAY`}
                </text>
              </g>
            );
          })}
        </svg>
        </div>

        {/* Pan/zoom hint */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 12,
            fontSize: 10.5,
            color: '#9B9C92',
            fontFamily: 'Nunito, system-ui',
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          Scroll to zoom · drag to pan
        </div>
      </div>

      {/* Legend — explains every color and the arrow meaning */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px 18px',
          marginTop: 10,
          fontSize: 11.5,
          color: '#6C6E63',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <LegendSwatch color={CHANGE_COLOR.added} label="Added" />
        <LegendSwatch color={CHANGE_COLOR.modified} label="Modified" />
        <LegendSwatch color={CHANGE_COLOR.removed} label="Removed" />
        <LegendSwatch color={AFFECTED_COLOR} label="Depends on the change" />
        <ArrowLegend />
        <span style={{ marginLeft: 'auto', color: '#9B9C92' }}>Click a box to show it on the map ↗</span>
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function ArrowLegend() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden style={{ flexShrink: 0 }}>
        <line x1="2" y1="5" x2="20" y2="5" stroke="#9B9C92" strokeWidth="1.5" />
        <polygon points="20 1.5, 26 5, 20 8.5" fill="#9B9C92" />
      </svg>
      <span>
        A&nbsp;→&nbsp;B means <strong style={{ color: '#4D4F46', fontWeight: 600 }}>A depends on B</strong>
      </span>
    </span>
  );
}
