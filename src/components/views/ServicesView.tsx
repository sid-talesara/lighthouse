/**
 * ServicesView — Service Architecture diagram.
 *
 * Renders the deployable services of a repo as a tiered system-architecture
 * diagram (custom SVG, see ServiceDiagram) with protocol-colored edges, a
 * kinds + protocols legend, and a detail panel for the selected service:
 * summary, kind, contained modules (click → highlight/select on the map),
 * entrypoint, and a "View entrypoint source" via CodeViewer.
 *
 * Reads data.services / data.serviceLinks (typed in src/types/lighthouse.ts).
 * Renders generically against whatever services exist; shows a friendly empty
 * state when there are none.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ViewProps } from './viewContract';
import type { Service, ServiceLink, LighthouseNode } from '../../types/lighthouse';
import { CodeViewer } from '../../components/CodeViewer';
import { ServiceDiagram } from './ServiceDiagram';
import {
  kindStyle,
  protocolStyle,
  KIND_LEGEND_ORDER,
  PROTOCOL_LEGEND_ORDER,
} from './serviceTheme';

export function ServicesView({
  data,
  selectedNodeId,
  onSelectNode,
  onHighlightNodes,
  onOpenWiki,
}: ViewProps) {
  const services: Service[] = Array.isArray(data.services) ? data.services : [];
  const links: ServiceLink[] = Array.isArray(data.serviceLinks) ? data.serviceLinks : [];

  // Node id → label lookup for rendering module chips.
  const nodeById = useMemo(() => {
    const m = new Map<string, LighthouseNode>();
    for (const n of data.nodes) m.set(n.id, n);
    return m;
  }, [data.nodes]);

  // Local selection of a SERVICE (distinct from the global node selection).
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    services[0]?.id ?? null,
  );
  const [showSource, setShowSource] = useState(false);

  // Keep selection valid if the dataset changes (e.g. after a regenerate).
  useEffect(() => {
    if (services.length === 0) {
      setSelectedServiceId(null);
      return;
    }
    if (!services.some((s) => s.id === selectedServiceId)) {
      setSelectedServiceId(services[0].id);
    }
  }, [services, selectedServiceId]);

  // Reset the source viewer whenever the active service changes.
  useEffect(() => {
    setShowSource(false);
  }, [selectedServiceId]);

  const selected = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId],
  );

  // ── Empty state ──────────────────────────────────────────────────────────
  if (services.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 bg-ph-canvas p-8">
        <div
          className="w-full max-w-[440px] rounded-ph border border-ph-border bg-ph-surface text-center"
          style={{ padding: '32px 36px' }}
        >
          <div className="mb-3 flex items-center justify-center">
            <ServiceGlyph />
          </div>
          <h2
            className="mb-2 font-display font-extrabold text-ph-ink"
            style={{ fontSize: '1.25rem', lineHeight: 1.3 }}
          >
            No services detected
          </h2>
          <p className="text-ph-mute" style={{ fontSize: '0.875rem', lineHeight: 1.55 }}>
            This repo doesn&rsquo;t expose deployable services. Generate against a
            multi-service repo (e.g. an <code className="font-mono">apps/*</code> or
            monorepo layout) to see the system topology here.
          </p>
        </div>
        <p
          className="font-mono text-ph-stone"
          style={{ fontSize: '0.6875rem', letterSpacing: '0.04em' }}
        >
          Repo: {data.repo.name}
        </p>
      </div>
    );
  }

  // Which kinds / protocols actually appear — legend only shows what's present.
  const presentKinds = new Set(services.map((s) => s.kind));
  const presentProtocols = new Set(links.map((l) => l.protocol));

  return (
    <div className="flex h-full min-h-0 bg-ph-canvas">
      {/* ── Diagram column ──────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="border-b border-ph-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ServiceGlyph size={20} />
            <h1
              className="font-display font-extrabold text-ph-ink"
              style={{ fontSize: '1.125rem', lineHeight: 1.3 }}
            >
              Service architecture
            </h1>
            <span
              className="ml-1 rounded-ph-pill bg-ph-surface-soft px-2 py-0.5 font-sans font-semibold text-ph-mute"
              style={{ fontSize: '0.6875rem', letterSpacing: '0.04em' }}
            >
              {services.length} services · {links.length} links
            </span>
          </div>
          <p className="mt-1 text-ph-mute" style={{ fontSize: '0.8125rem' }}>
            Deployable services and how they communicate. Click a service to inspect it.
          </p>
        </div>

        {/* Legend */}
        <Legend
          presentKinds={presentKinds}
          presentProtocols={presentProtocols}
        />

        {/* Scrollable diagram canvas */}
        <div
          className="min-h-0 flex-1 overflow-auto"
          style={{
            backgroundColor: '#E8E9E2',
            backgroundImage: 'radial-gradient(#BFC1B7 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        >
          <div className="flex min-h-full items-start justify-center p-8">
            <ServiceDiagram
              services={services}
              links={links}
              selectedId={selectedServiceId}
              onSelect={setSelectedServiceId}
            />
          </div>
        </div>
      </div>

      {/* ── Detail panel ────────────────────────────────────────────────── */}
      {selected && (
        <ServiceDetail
          service={selected}
          links={links}
          services={services}
          nodeById={nodeById}
          selectedNodeId={selectedNodeId}
          showSource={showSource}
          onToggleSource={() => setShowSource((v) => !v)}
          onSelectNode={onSelectNode}
          onHighlightNodes={onHighlightNodes}
          onOpenWiki={onOpenWiki}
          onSelectService={setSelectedServiceId}
        />
      )}
    </div>
  );
}

// ── Legend ───────────────────────────────────────────────────────────────────

function Legend({
  presentKinds,
  presentProtocols,
}: {
  presentKinds: Set<string>;
  presentProtocols: Set<string>;
}) {
  const kinds = KIND_LEGEND_ORDER.filter((k) => presentKinds.has(k));
  const protocols = PROTOCOL_LEGEND_ORDER.filter((p) => presentProtocols.has(p));

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-ph-border-soft bg-ph-surface px-6 py-2.5">
      <LegendGroup label="Kinds">
        {kinds.map((k) => {
          const ks = kindStyle(k);
          return (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: ks.color }}
              />
              <span className="text-ph-body" style={{ fontSize: '0.75rem' }}>
                {ks.label}
              </span>
            </span>
          );
        })}
      </LegendGroup>

      {protocols.length > 0 && (
        <LegendGroup label="Protocols">
          {protocols.map((p) => {
            const ps = protocolStyle(p);
            return (
              <span key={p} className="inline-flex items-center gap-1.5">
                <svg width={20} height={8} aria-hidden>
                  <line
                    x1={0}
                    y1={4}
                    x2={20}
                    y2={4}
                    stroke={ps.color}
                    strokeWidth={2}
                    strokeDasharray={ps.dash}
                  />
                </svg>
                <span className="text-ph-body" style={{ fontSize: '0.75rem' }}>
                  {ps.label}
                </span>
              </span>
            );
          })}
        </LegendGroup>
      )}
    </div>
  );
}

function LegendGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="font-sans font-semibold uppercase text-ph-ash"
        style={{ fontSize: '0.625rem', letterSpacing: '0.08em' }}
      >
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">{children}</div>
    </div>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────

function ServiceDetail({
  service,
  links,
  services,
  nodeById,
  selectedNodeId,
  showSource,
  onToggleSource,
  onSelectNode,
  onHighlightNodes,
  onOpenWiki,
  onSelectService,
}: {
  service: Service;
  links: ServiceLink[];
  services: Service[];
  nodeById: Map<string, LighthouseNode>;
  selectedNodeId: string | null;
  showSource: boolean;
  onToggleSource: () => void;
  onSelectNode: (id: string | null) => void;
  onHighlightNodes: (ids: Set<string>) => void;
  onOpenWiki?: (id: string) => void;
  onSelectService: (id: string) => void;
}) {
  const ks = kindStyle(service.kind);
  const serviceName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of services) m.set(s.id, s.name);
    return m;
  }, [services]);

  const moduleIds = service.module_ids ?? [];
  const outbound = links.filter((l) => l.from === service.id);
  const inbound = links.filter((l) => l.to === service.id);

  // Brief visual feedback state for the "Highlight on map" button.
  const [highlightFired, setHighlightFired] = useState(false);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset feedback when service changes.
  useEffect(() => {
    setHighlightFired(false);
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, [service.id]);

  // Clicking a module: highlight all of this service's modules + select the one.
  const onModuleClick = useCallback(
    (id: string) => {
      onHighlightNodes(new Set(moduleIds));
      onSelectNode(id);
      onOpenWiki?.(id);
    },
    [moduleIds, onHighlightNodes, onSelectNode, onOpenWiki],
  );

  const highlightAll = useCallback(() => {
    onHighlightNodes(new Set(moduleIds));
    setHighlightFired(true);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightFired(false), 1800);
  }, [moduleIds, onHighlightNodes]);

  // Clicking a peer service: select it + highlight its modules too.
  const onSelectPeer = useCallback(
    (peerId: string) => {
      const peer = services.find((s) => s.id === peerId);
      if (peer?.module_ids?.length) {
        onHighlightNodes(new Set(peer.module_ids));
      }
      onSelectService(peerId);
    },
    [services, onHighlightNodes, onSelectService],
  );

  return (
    <aside
      className="flex w-[360px] flex-shrink-0 flex-col overflow-y-auto border-l border-ph-border bg-ph-surface"
      style={{ animation: 'fadeIn 150ms ease-out both' }}
    >
      {/* Header */}
      <div className="border-b border-ph-border px-6 py-5">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="inline-flex items-center rounded-ph-pill px-2.5 py-0.5 font-sans font-semibold"
            style={{
              backgroundColor: ks.soft,
              color: ks.color,
              fontSize: '0.6875rem',
              letterSpacing: '0.04em',
            }}
          >
            {ks.label.toUpperCase()}
          </span>
          {service.path && (
            <code
              className="rounded-ph-sm bg-ph-surface-soft px-1.5 py-0.5 font-mono text-ph-mute"
              style={{ fontSize: '0.6875rem' }}
            >
              {service.path}
            </code>
          )}
        </div>
        <h2
          className="font-display font-extrabold text-ph-ink"
          style={{ fontSize: '1.25rem', lineHeight: 1.25 }}
        >
          {service.name}
        </h2>
        <p className="mt-1.5 text-ph-body" style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
          {service.summary}
        </p>
      </div>

      {/* Connections */}
      {(outbound.length > 0 || inbound.length > 0) ? (
        <Section title={`Connections (${outbound.length + inbound.length})`}>
          {outbound.map((l, i) => (
            <ConnRow
              key={`out-${i}`}
              dir="out"
              protocol={l.protocol}
              peerName={serviceName.get(l.to) ?? l.to}
              summary={l.summary}
              onClick={() => onSelectPeer(l.to)}
            />
          ))}
          {inbound.map((l, i) => (
            <ConnRow
              key={`in-${i}`}
              dir="in"
              protocol={l.protocol}
              peerName={serviceName.get(l.from) ?? l.from}
              summary={l.summary}
              onClick={() => onSelectPeer(l.from)}
            />
          ))}
        </Section>
      ) : (
        <Section title="Connections (0)">
          <p className="text-ph-ash" style={{ fontSize: '0.8125rem' }}>
            No known connections for this service.
          </p>
        </Section>
      )}

      {/* Modules */}
      <Section
        title={`Modules (${moduleIds.length})`}
        action={
          moduleIds.length > 0 ? (
            <button
              type="button"
              onClick={highlightAll}
              className={`inline-flex items-center gap-1 rounded-ph px-2 py-0.5 font-sans font-semibold transition-colors ${
                highlightFired
                  ? 'bg-ph-blue text-white'
                  : 'text-ph-blue hover:underline'
              }`}
              style={{ fontSize: '0.6875rem' }}
            >
              {highlightFired ? '✓ Highlighted' : 'Highlight on map'}
            </button>
          ) : undefined
        }
      >
        {moduleIds.length === 0 ? (
          <p className="text-ph-ash" style={{ fontSize: '0.8125rem' }}>
            No modules mapped to this service.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {moduleIds.map((id) => {
              const node = nodeById.get(id);
              const isActive = selectedNodeId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onModuleClick(id)}
                  className={`flex w-full items-center gap-2 rounded-ph border px-2.5 py-1.5 text-left transition-colors ${
                    isActive
                      ? 'border-ph-blue bg-ph-blue-soft'
                      : 'border-ph-border-soft bg-ph-canvas hover:border-ph-border'
                  }`}
                >
                  <span
                    className="truncate text-ph-ink"
                    style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                  >
                    {node?.label ?? id}
                  </span>
                  {node?.changed_recently && (
                    <span
                      className="ml-auto rounded-ph-pill bg-ph-green-soft px-1.5 py-0.5 font-sans font-semibold text-ph-green"
                      style={{ fontSize: '0.5625rem', letterSpacing: '0.04em' }}
                    >
                      RECENT
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* Entrypoint + source */}
      <Section title="Entrypoint">
        {service.entrypoint ? (
          <>
            <code
              className="block break-all rounded-ph-sm bg-ph-surface-soft px-2 py-1 font-mono text-ph-body"
              style={{ fontSize: '0.75rem' }}
            >
              {service.entrypoint}
            </code>
            <button
              type="button"
              onClick={onToggleSource}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-ph border border-ph-border bg-ph-surface-soft px-3 py-1.5 font-sans font-semibold text-ph-ink transition-colors hover:bg-ph-border-dashed"
              style={{ fontSize: '0.75rem' }}
            >
              {showSource ? 'Hide entrypoint source' : 'View entrypoint source'}
            </button>
            {showSource && (
              <div className="mt-3">
                <CodeViewer path={service.entrypoint} maxHeight="40vh" />
              </div>
            )}
          </>
        ) : (
          <p className="text-ph-ash" style={{ fontSize: '0.8125rem' }}>
            No entrypoint recorded for this service.
          </p>
        )}
      </Section>
    </aside>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-ph-border-soft px-6 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h3
          className="font-sans font-semibold uppercase text-ph-ash"
          style={{ fontSize: '0.625rem', letterSpacing: '0.08em' }}
        >
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function ConnRow({
  dir,
  protocol,
  peerName,
  summary,
  onClick,
}: {
  dir: 'in' | 'out';
  protocol: string;
  peerName: string;
  summary?: string;
  onClick: () => void;
}) {
  const ps = protocolStyle(protocol);
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1.5 flex w-full items-start gap-2 rounded-ph border border-ph-border-soft bg-ph-canvas px-2.5 py-1.5 text-left transition-colors hover:border-ph-border"
    >
      <span
        className="mt-0.5 font-mono text-ph-ash"
        style={{ fontSize: '0.8125rem', lineHeight: 1 }}
        aria-hidden
      >
        {dir === 'out' ? '→' : '←'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className="truncate text-ph-ink"
            style={{ fontSize: '0.8125rem', fontWeight: 600 }}
          >
            {peerName}
          </span>
          <span
            className="rounded-ph-pill px-1.5 py-0.5 font-sans font-semibold"
            style={{
              backgroundColor: ps.color + '22',
              color: ps.color,
              fontSize: '0.5625rem',
              letterSpacing: '0.04em',
            }}
          >
            {ps.label.toUpperCase()}
          </span>
        </span>
        {summary && (
          <span
            className="mt-0.5 block text-ph-mute"
            style={{ fontSize: '0.6875rem', lineHeight: 1.4 }}
          >
            {summary}
          </span>
        )}
      </span>
    </button>
  );
}

// ── Inline glyph (no icon dependency available) ───────────────────────────────

function ServiceGlyph({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2C8C66"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="8.5" y="14" width="7" height="7" rx="1.5" />
      <path d="M6.5 10v2.5h11.5V10M12 17v-2.5" />
    </svg>
  );
}
