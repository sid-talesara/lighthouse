/**
 * ServiceDiagram — custom-SVG system-architecture diagram of deployable services.
 *
 * Why custom SVG (not React Flow): we want full control over the tier-based
 * layout, protocol-colored curved edges with arrowheads, and a calm entrance
 * animation — and we explicitly avoid React Flow's `.react-flow__node`
 * transform-animation stacking bug. Everything here is plain SVG, so node
 * transforms are stable.
 *
 * Layout: services are grouped into horizontal TIERS by kind (frontends top,
 * gateways below, backends/realtime middle, workers, then db at the bottom)
 * so the topology reads like a real architecture diagram. Within a tier,
 * services are spread evenly left-to-right.
 *
 * Edges: each serviceLink is a directed cubic curve colored + dashed by its
 * PROTOCOL, with an arrowhead at the target. Hovering or selecting a node
 * highlights its incident edges and dims the rest.
 */

import { useMemo, useState } from 'react';
import type { Service, ServiceLink } from '../../types/lighthouse';
import { kindStyle, protocolStyle } from './serviceTheme';

interface Props {
  services: Service[];
  links: ServiceLink[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface Placed {
  service: Service;
  x: number; // top-left
  y: number;
  cx: number; // center
  cy: number;
}

// Node geometry
const NODE_W = 192;
const NODE_H = 88;
const COL_GAP = 36;
const ROW_GAP = 90;
const PAD_X = 40;
const PAD_Y = 32;

export function ServiceDiagram({ services, links, selectedId, onSelect }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { placed, width, height, byId } = useMemo(() => {
    // Group by tier (from kind), preserving input order within a tier.
    const tiers = new Map<number, Service[]>();
    for (const svc of services) {
      const t = kindStyle(svc.kind).tier;
      const arr = tiers.get(t) ?? [];
      arr.push(svc);
      tiers.set(t, arr);
    }
    const tierKeys = [...tiers.keys()].sort((a, b) => a - b);

    // Widest tier determines canvas width so everything stays centered.
    const maxCount = Math.max(1, ...tierKeys.map((t) => tiers.get(t)!.length));
    const canvasW = PAD_X * 2 + maxCount * NODE_W + (maxCount - 1) * COL_GAP;

    const placedList: Placed[] = [];
    tierKeys.forEach((t, rowIdx) => {
      const row = tiers.get(t)!;
      const rowW = row.length * NODE_W + (row.length - 1) * COL_GAP;
      const startX = (canvasW - rowW) / 2;
      const y = PAD_Y + rowIdx * (NODE_H + ROW_GAP);
      row.forEach((svc, colIdx) => {
        const x = startX + colIdx * (NODE_W + COL_GAP);
        placedList.push({
          service: svc,
          x,
          y,
          cx: x + NODE_W / 2,
          cy: y + NODE_H / 2,
        });
      });
    });

    const canvasH =
      PAD_Y * 2 + tierKeys.length * NODE_H + Math.max(0, tierKeys.length - 1) * ROW_GAP;

    const map = new Map<string, Placed>();
    for (const p of placedList) map.set(p.service.id, p);

    return { placed: placedList, width: canvasW, height: canvasH, byId: map };
  }, [services]);

  const activeId = hoverId ?? selectedId;

  // Resolve edges to coordinates, skipping links that reference unknown services.
  const edges = useMemo(() => {
    return links
      .map((link, i) => {
        const from = byId.get(link.from);
        const to = byId.get(link.to);
        if (!from || !to) return null;
        return { key: `${link.from}->${link.to}-${i}`, link, from, to };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }, [links, byId]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label="Service architecture diagram"
    >
      <defs>
        {/* One arrowhead marker per protocol color so heads match edge color. */}
        {Array.from(new Set(edges.map((e) => e.link.protocol))).map((proto) => {
          const ps = protocolStyle(proto);
          return (
            <marker
              key={`arrow-${proto}`}
              id={`svc-arrow-${proto}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={ps.color} />
            </marker>
          );
        })}
      </defs>

      {/* ── Edges ──────────────────────────────────────────────────────── */}
      <g>
        {edges.map(({ key, link, from, to }) => {
          const ps = protocolStyle(link.protocol);
          const incident =
            activeId != null && (link.from === activeId || link.to === activeId);
          const dimmed = activeId != null && !incident;

          // Cubic curve: vertical-biased control points for clean tier flow.
          const x1 = from.cx;
          const y1 = from.cy;
          const x2 = to.cx;
          const y2 = to.cy;
          const dy = (y2 - y1) * 0.5;
          const d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;

          return (
            <path
              key={key}
              d={d}
              fill="none"
              stroke={ps.color}
              strokeWidth={incident ? 2.5 : 1.5}
              strokeDasharray={ps.dash}
              markerEnd={`url(#svc-arrow-${link.protocol})`}
              opacity={dimmed ? 0.12 : incident ? 1 : 0.55}
              style={{ transition: 'opacity 150ms ease-out, stroke-width 150ms ease-out' }}
            >
              <title>
                {`${from.service.name} → ${to.service.name} (${ps.label})${
                  link.summary ? `\n${link.summary}` : ''
                }`}
              </title>
            </path>
          );
        })}
      </g>

      {/* ── Nodes ──────────────────────────────────────────────────────── */}
      <g>
        {placed.map((p, i) => {
          const ks = kindStyle(p.service.kind);
          const isSelected = selectedId === p.service.id;
          const incident =
            activeId != null &&
            (p.service.id === activeId ||
              edges.some(
                (e) =>
                  (e.link.from === activeId && e.link.to === p.service.id) ||
                  (e.link.to === activeId && e.link.from === p.service.id),
              ));
          const dimmed = activeId != null && !incident && p.service.id !== activeId;

          return (
            // Layer 1: positional group — carries ONLY the SVG translate.
            // CSS @keyframes must NEVER appear on this element or they will
            // override the translate, collapsing all nodes to the SVG origin.
            <g key={p.service.id} transform={`translate(${p.x}, ${p.y})`}>
            {/* Layer 2: dimming group — handles interactive opacity AFTER
                the entrance animation has fully completed (no conflict). */}
            <g
              style={{
                opacity: dimmed ? 0.4 : 1,
                transition: 'opacity 150ms ease-out',
              }}
            >
            {/* Layer 3: entrance-animation group — only animates opacity, never
                transform, so Layer 1's translate is never disturbed. */}
            <g
              onMouseEnter={() => setHoverId(p.service.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => onSelect(p.service.id)}
              style={{
                cursor: 'pointer',
                animationName: 'svcNodeIn',
                animationDuration: '240ms',
                animationTimingFunction: 'ease-out',
                animationFillMode: 'both',
                animationDelay: `${Math.min(i * 28, 320)}ms`,
              }}
            >
              {/* Soft focus ring when selected */}
              {isSelected && (
                <rect
                  x={-3}
                  y={-3}
                  width={NODE_W + 6}
                  height={NODE_H + 6}
                  rx={9}
                  fill="none"
                  stroke={ks.color}
                  strokeWidth={1}
                  opacity={0.3}
                />
              )}
              {/* Card body */}
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill="#FFFFFF"
                stroke={isSelected ? ks.color : '#BFC1B7'}
                strokeWidth={isSelected ? 2 : 1}
              />
              {/* Left accent stripe by kind */}
              <rect width={4} height={NODE_H} rx={2} fill={ks.color} />

              {/* Name */}
              <text
                x={16}
                y={24}
                fontFamily="Nunito, system-ui, sans-serif"
                fontSize={13}
                fontWeight={700}
                fill="#151515"
              >
                {truncate(p.service.name, 22)}
              </text>

              {/* Kind badge + module count */}
              <g transform="translate(16, 32)">
                <rect
                  width={badgeWidth(ks.label)}
                  height={16}
                  rx={8}
                  fill={ks.soft}
                />
                <text
                  x={badgeWidth(ks.label) / 2}
                  y={11}
                  textAnchor="middle"
                  fontFamily="Nunito, system-ui, sans-serif"
                  fontSize={9}
                  fontWeight={700}
                  letterSpacing="0.04em"
                  fill={ks.color}
                  style={{ textTransform: 'uppercase' }}
                >
                  {ks.label.toUpperCase()}
                </text>
              </g>
              {(p.service.module_ids?.length ?? 0) > 0 && (
                <text
                  x={16 + badgeWidth(ks.label) + 8}
                  y={43}
                  fontFamily="system-ui, -apple-system, sans-serif"
                  fontSize={9}
                  fill="#9B9C92"
                >
                  {p.service.module_ids!.length} module{p.service.module_ids!.length !== 1 ? 's' : ''}
                </text>
              )}

              {/* Separator line */}
              <line
                x1={16}
                y1={56}
                x2={NODE_W - 12}
                y2={56}
                stroke="#DCDFD2"
                strokeWidth={1}
              />

              {/* One-line summary */}
              <text
                x={16}
                y={72}
                fontFamily="system-ui, -apple-system, sans-serif"
                fontSize={10}
                fill="#6C6E63"
              >
                {truncate(p.service.summary, 32)}
              </text>
            </g>
            </g>
            </g>
          );
        })}
      </g>

      {/* Scoped keyframes for the node entrance (kept local to this SVG).
          IMPORTANT: Do NOT include transform in these keyframes — CSS transform
          in @keyframes overrides the SVG transform attribute on the outer <g>,
          which would collapse all node positions to the SVG origin. */}
      <style>{`
        @keyframes svcNodeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </svg>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function badgeWidth(label: string): number {
  return Math.max(40, label.length * 6.2 + 14);
}
