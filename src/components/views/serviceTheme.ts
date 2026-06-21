/**
 * serviceTheme.ts — shared visual encoding for the Service Architecture view.
 *
 * Maps service KINDS to accent colors + tier (vertical band), and service-link
 * PROTOCOLS to edge colors + dash patterns. Kept in one place so the diagram,
 * the legend, and the detail panel all read from the same source of truth.
 *
 * Colors are drawn from the PostHog light-theme palette (docs/posthog-design-spec.md).
 */

import type { ServiceKind, ServiceProtocol } from '../../types/lighthouse';

export interface KindStyle {
  /** Accent color (used for stripe, badge text, node outline). */
  color: string;
  /** Soft background for the kind badge. */
  soft: string;
  /** Human label for the legend / badge. */
  label: string;
  /** Vertical tier: lower = higher on the canvas (frontends top, db bottom). */
  tier: number;
}

/**
 * Tiers (top → bottom):
 *   0  frontend / external clients   — what users / outside systems touch
 *   1  gateway                       — edge / routing layer
 *   2  backend / realtime           — application servers
 *   3  worker                        — async / background processing
 *   4  db                            — persistence
 *  We map "external" alongside frontends (tier 0) and "other" to tier 2.
 */
export const KIND_STYLES: Record<ServiceKind, KindStyle> = {
  frontend: { color: '#2C84E0', soft: '#DCEAF6', label: 'Frontend', tier: 0 },
  external: { color: '#7C44A6', soft: '#E7D8EE', label: 'External', tier: 0 },
  gateway: { color: '#1078A3', soft: '#DCEAF6', label: 'Gateway', tier: 1 },
  backend: { color: '#2C8C66', soft: '#D9EDDF', label: 'Backend', tier: 2 },
  realtime: { color: '#F54E00', soft: '#F7D6D3', label: 'Realtime', tier: 2 },
  other: { color: '#6C6E63', soft: '#E5E7E0', label: 'Other', tier: 2 },
  worker: { color: '#DC9300', soft: '#FEF3C7', label: 'Worker', tier: 3 },
  db: { color: '#CD4239', soft: '#F7D6D3', label: 'Database', tier: 4 },
};

export function kindStyle(kind: ServiceKind | string): KindStyle {
  return KIND_STYLES[kind as ServiceKind] ?? KIND_STYLES.other;
}

export interface ProtocolStyle {
  color: string;
  label: string;
  /** SVG stroke-dasharray, or undefined for a solid line. */
  dash?: string;
}

export const PROTOCOL_STYLES: Record<ServiceProtocol, ProtocolStyle> = {
  http: { color: '#2C84E0', label: 'HTTP' },
  ws: { color: '#7C44A6', label: 'WebSocket', dash: '2 4' },
  queue: { color: '#DC9300', label: 'Queue', dash: '8 4' },
  grpc: { color: '#2C8C66', label: 'gRPC', dash: '10 3 2 3' },
  db: { color: '#CD4239', label: 'DB', dash: '1 3' },
  event: { color: '#F54E00', label: 'Event', dash: '6 3' },
  other: { color: '#6C6E63', label: 'Other', dash: '4 4' },
};

export function protocolStyle(protocol: ServiceProtocol | string): ProtocolStyle {
  return PROTOCOL_STYLES[protocol as ServiceProtocol] ?? PROTOCOL_STYLES.other;
}

/** Kinds in tier order, used to build the legend deterministically. */
export const KIND_LEGEND_ORDER: ServiceKind[] = [
  'frontend',
  'external',
  'gateway',
  'backend',
  'realtime',
  'worker',
  'db',
  'other',
];

export const PROTOCOL_LEGEND_ORDER: ServiceProtocol[] = [
  'http',
  'ws',
  'queue',
  'grpc',
  'event',
  'db',
  'other',
];
