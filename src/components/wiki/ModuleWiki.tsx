/**
 * ModuleWiki — the rich, docs-style slide-over drawer for a single module.
 *
 * Presentation: 600px right-anchored drawer over a cream/blur overlay; the map
 * stays live behind it. Ten ordered, data-gated, kind-aware sections plus a
 * sticky right-rail TOC and a custom-SVG neighbor diagram. Neighbor / flow / PR
 * cross-links push onto a history stack so "← Back" works.
 *
 * Opens via the App-level openWiki(nodeId) entry point. Closes via X, overlay
 * click, or Esc. "Show on map" closes the overlay and asks App to fly the map.
 */

import { useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

import type { LighthouseData } from '../../types/lighthouse';
import {
  assembleWikiPayload,
  formatWikiDate,
  type WikiPayload,
} from '../../lib/assembleWiki';
import type { WikiStack } from '../../hooks/useWikiStack';
import { NeighborDiagram } from './NeighborDiagram';
import { WikiToc, type TocItem } from './WikiToc';
import { WikiSourceFiles } from './WikiSourceFiles';
import {
  IconAlert,
  IconArrowRight,
  IconChevronDown,
  IconChevronLeft,
  IconCode,
  IconDatabase,
  IconFile,
  IconFileQuestion,
  IconKey,
  IconLayers,
  IconLink,
  IconMapPin,
  IconWorkflow,
  IconX,
} from './icons';
import { useState } from 'react';

interface Props {
  data: LighthouseData;
  stack: WikiStack;
  /** Navigate the drawer to another node id (pushes history). */
  onNavigate: (id: string) => void;
  /** Close the drawer entirely. */
  onClose: () => void;
  /** "Show on map" — close overlay, switch to Architecture, fly to node. */
  onShowOnMap: (id: string) => void;
}

const kindBadge: Record<string, string> = {
  cluster: 'bg-ph-purple-soft text-ph-purple',
  module: 'bg-ph-blue-soft text-ph-blue-teal',
  file: 'bg-ph-surface-soft text-ph-body',
};

export function ModuleWiki({ data, stack, onNavigate, onClose, onShowOnMap }: Props) {
  const { currentId, canGoBack } = stack;
  const open = currentId !== null;
  const scrollRef = useRef<HTMLElement>(null);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset scroll to top when navigating to a new page.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [currentId]);

  const payload = useMemo<WikiPayload | null>(
    () => (currentId ? assembleWikiPayload(currentId, data) : null),
    [currentId, data],
  );

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 animate-fade-in bg-ph-canvas/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className="fixed bottom-0 right-0 top-0 z-50 flex w-[600px] max-w-[95vw] animate-panel-in flex-col overflow-hidden border-l border-ph-border bg-ph-surface"
        role="dialog"
        aria-modal="true"
        aria-label="Module wiki"
      >
        {payload ? (
          <WikiBody
            payload={payload}
            scrollRef={scrollRef}
            currentId={currentId}
            canGoBack={canGoBack}
            onBack={stack.back}
            onNavigate={onNavigate}
            onClose={onClose}
            onShowOnMap={onShowOnMap}
            data={data}
          />
        ) : (
          <MissingNode onClose={onClose} />
        )}
      </aside>
    </>
  );
}

// ─── Drawer body ───────────────────────────────────────────────────────────────

function WikiBody({
  payload,
  scrollRef,
  currentId,
  canGoBack,
  onBack,
  onNavigate,
  onClose,
  onShowOnMap,
  data,
}: {
  payload: WikiPayload;
  scrollRef: React.RefObject<HTMLElement>;
  currentId: string;
  canGoBack: boolean;
  onBack: () => void;
  onNavigate: (id: string) => void;
  onClose: () => void;
  onShowOnMap: (id: string) => void;
  data: LighthouseData;
}) {
  const { node, parentCluster } = payload;

  // Build the TOC from the sections that will actually render.
  const toc = useMemo<TocItem[]>(() => buildToc(payload), [payload]);

  const nodeLabel = (id: string) =>
    data.nodes.find((n) => n.id === id)?.label ??
    data.clusters.find((c) => c.id === id)?.label ??
    id;

  return (
    <>
      {/* Sticky header */}
      <header className="sticky top-0 z-10 flex h-[52px] shrink-0 items-center justify-between border-b border-ph-border bg-ph-surface px-5">
        <div className="flex min-w-0 items-center gap-2">
          {canGoBack && (
            <button
              onClick={onBack}
              className="-ml-1 flex shrink-0 items-center gap-1 rounded-ph-sm px-1.5 py-1 font-sans text-[12px] font-semibold text-ph-mute transition-colors hover:text-ph-ink"
              aria-label="Back"
            >
              <IconChevronLeft className="h-4 w-4" />
              Back
            </button>
          )}
          <Breadcrumb
            repo={data.repo.name}
            parentCluster={parentCluster}
            node={node}
            onNavigate={onNavigate}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onShowOnMap(currentId)}
            className="flex items-center gap-1.5 rounded-ph-sm px-2 py-1.5 font-sans text-[12px] font-semibold text-ph-body transition-colors hover:bg-ph-surface-soft hover:text-ph-ink"
          >
            <IconMapPin className="h-4 w-4" />
            <span className="hidden sm:inline">Show on map</span>
          </button>
          <button
            onClick={onClose}
            className="rounded-ph-sm p-1.5 text-ph-ash transition-colors hover:bg-ph-surface-soft hover:text-ph-ink"
            aria-label="Close"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Body: content + TOC rail */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main
          ref={scrollRef as React.RefObject<HTMLDivElement>}
          id="wiki-scroll"
          className="lh-scroll min-w-0 flex-1 overflow-y-auto scroll-smooth px-6 py-6"
        >
          <ModuleHero payload={payload} />

          <SummarySection payload={payload} />
          <ConnectionsSection payload={payload} onNavigate={onNavigate} />
          <KeyFilesSection payload={payload} />
          <WikiSourceFiles
            kind={payload.node.kind}
            files={payload.node.key_files}
            clusterGroups={payload.clusterKeyFiles}
          />
          <FunctionsSection payload={payload} />
          <DbTablesSection payload={payload} />
          <FlowsSection payload={payload} onNavigate={onNavigate} nodeLabel={nodeLabel} />
          <RecentChangesSection payload={payload} />
          <WikiProseSection payload={payload} data={data} onNavigate={onNavigate} />

          <ExploreRelatedFooter payload={payload} onNavigate={onNavigate} />
        </main>

        <WikiToc items={toc} scrollRef={scrollRef} resetKey={currentId} />
      </div>
    </>
  );
}

// ─── Breadcrumb ─────────────────────────────────────────────────────────────────

function Breadcrumb({
  repo,
  parentCluster,
  node,
  onNavigate,
}: {
  repo: string;
  parentCluster: WikiPayload['parentCluster'];
  node: WikiPayload['node'];
  onNavigate: (id: string) => void;
}) {
  const sep = <span className="px-1 text-ph-border">›</span>;
  return (
    <div className="flex min-w-0 items-center truncate font-sans text-[12px] font-semibold tracking-[0.02em] text-ph-ash">
      <span className="shrink-0">{repo}</span>
      {parentCluster && (
        <>
          {sep}
          <button
            onClick={() => onNavigate(parentCluster.id)}
            className="shrink-0 transition-colors hover:text-ph-ink hover:underline"
          >
            {parentCluster.label}
          </button>
        </>
      )}
      {sep}
      <span className="truncate text-ph-body">{node.label}</span>
    </div>
  );
}

// ─── Module hero ────────────────────────────────────────────────────────────────

function ModuleHero({ payload }: { payload: WikiPayload }) {
  const { node } = payload;
  const path = node.path && node.path.length > 40 ? node.path.slice(0, 39) + '…' : node.path;
  return (
    <div className="pb-2">
      <h1 className="font-sans text-2xl font-extrabold leading-tight text-ph-ink">{node.label}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={[
            'inline-flex items-center rounded-ph-pill px-2.5 py-0.5 font-sans text-label font-semibold tracking-wider',
            kindBadge[node.kind] ?? kindBadge.file,
          ].join(' ')}
        >
          {node.kind}
        </span>
        {node.changed_recently && (
          <span className="inline-flex items-center rounded-ph-pill bg-[#FEF3C7] px-2.5 py-0.5 font-sans text-label font-semibold tracking-wider text-[#92400E]">
            Recently changed
          </span>
        )}
        {path && (
          <code className="rounded-ph-sm border border-ph-border bg-ph-surface-soft px-2 py-0.5 font-mono text-[12px] text-ph-body">
            {path}
          </code>
        )}
      </div>
      {node.changed_recently && (
        <div className="mt-4 flex gap-3 rounded-ph border-l-4 border-ph-yellow bg-yellow-50 p-3">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-ph-yellow-pressed" />
          <p className="text-[13px] leading-relaxed text-ph-body">
            This module was recently changed — see Recent changes below for details.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Section shell ──────────────────────────────────────────────────────────────

function SectionHeader({
  id,
  title,
  badge,
}: {
  id: string;
  title: string;
  badge?: { label: string; tone: 'neutral' | 'purple' };
}) {
  return (
    <h2
      id={id}
      className="scroll-mt-[60px] flex items-center gap-2 border-b border-ph-border pb-2 pt-6 font-sans text-[16px] font-bold text-ph-ink"
    >
      {title}
      {badge && (
        <span
          className={[
            'inline-flex items-center rounded-ph-pill px-2 py-0.5 font-sans text-[11px] font-semibold',
            badge.tone === 'purple'
              ? 'bg-ph-purple-soft text-ph-purple'
              : 'bg-ph-surface-soft text-ph-mute',
          ].join(' ')}
        >
          {badge.label}
        </span>
      )}
    </h2>
  );
}

const Divider = () => <hr className="my-6 border-0 border-t border-ph-border-soft" />;

// ─── 3. Summary ─────────────────────────────────────────────────────────────────

function SummarySection({ payload }: { payload: WikiPayload }) {
  const { node } = payload;
  if (!node.summary) return null;
  return (
    <section className="mt-4">
      <h2 id="summary" className="sr-only">
        Summary
      </h2>
      <p className="max-w-[520px] text-[16px] leading-[1.6] text-ph-body">{node.summary}</p>
    </section>
  );
}

// ─── 4. Connections (neighbor diagram) ──────────────────────────────────────────

function ConnectionsSection({
  payload,
  onNavigate,
}: {
  payload: WikiPayload;
  onNavigate: (id: string) => void;
}) {
  const { node, neighbors } = payload;
  // Hide for files with no edges; otherwise always show (clusters/modules).
  if (node.kind === 'file' && neighbors.length === 0) return null;

  return (
    <section>
      <Divider />
      <SectionHeader id="connections" title="Connections" />
      <div className="mt-4">
        {neighbors.length > 0 ? (
          <NeighborDiagram
            centerLabel={node.label}
            neighbors={neighbors}
            onNavigate={onNavigate}
          />
        ) : (
          <p className="rounded-ph border border-dashed border-ph-border bg-ph-surface-soft/40 px-4 py-6 text-center text-[13px] text-ph-mute">
            No connections recorded for this module.
          </p>
        )}
      </div>
    </section>
  );
}

// ─── 5. Key files ───────────────────────────────────────────────────────────────

function KeyFilesSection({ payload }: { payload: WikiPayload }) {
  const { node, clusterKeyFiles } = payload;

  if (node.kind === 'cluster') {
    if (clusterKeyFiles.length === 0) return null;
    return (
      <section>
        <Divider />
        <SectionHeader id="key-files" title="Key files" />
        <div className="mt-3 space-y-4">
          {clusterKeyFiles.map((group) => (
            <div key={group.moduleId}>
              <p className="mb-1 font-sans text-[12px] font-semibold text-ph-mute">
                {group.moduleLabel}
              </p>
              <div className="pl-1">
                {group.files.map((f) => (
                  <FileChip key={f} path={f} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const files = node.key_files.filter((f) => f.trim() !== '');
  if (files.length === 0) return null;
  return (
    <section>
      <Divider />
      <SectionHeader id="key-files" title="Key files" />
      <div className="mt-2">
        {files.map((f) => (
          <FileChip key={f} path={f} />
        ))}
      </div>
    </section>
  );
}

function FileChip({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-ph-border-soft py-1.5 last:border-0">
      <IconFile className="h-4 w-4 shrink-0 text-ph-mute" />
      <code className="truncate font-mono text-[13px] text-ph-body">{path}</code>
    </div>
  );
}

// ─── 6. Functions ───────────────────────────────────────────────────────────────

function FunctionsSection({ payload }: { payload: WikiPayload }) {
  const { node, functions, rolledUpFunctionCount } = payload;
  const [expanded, setExpanded] = useState(false);

  // Clusters: count only, no detail list.
  if (node.kind === 'cluster') {
    if (rolledUpFunctionCount === 0) return null;
    return (
      <section>
        <Divider />
        <SectionHeader
          id="functions"
          title="Functions"
          badge={{ label: `${rolledUpFunctionCount} across modules`, tone: 'neutral' }}
        />
        <p className="mt-3 text-[13px] text-ph-mute">
          Open an individual module to inspect its functions.
        </p>
      </section>
    );
  }

  if (functions.length === 0) return null;
  const shown = expanded ? functions : functions.slice(0, 5);

  return (
    <section>
      <Divider />
      <SectionHeader
        id="functions"
        title="Functions"
        badge={{ label: `${functions.length} function${functions.length !== 1 ? 's' : ''}`, tone: 'neutral' }}
      />
      <div className="mt-1">
        {shown.map((fn) => (
          <div key={fn.id} className="border-b border-ph-border-soft py-3 last:border-0">
            <div className="flex items-start gap-3">
              <IconCode className="mt-0.5 h-4 w-4 shrink-0 text-ph-mute" />
              <div className="min-w-0">
                <code className="font-mono text-[13px] font-medium text-ph-ink">{fn.name}</code>
                {fn.signature && (
                  <code className="mt-0.5 block font-mono text-[11px] leading-relaxed text-ph-mute">
                    {fn.signature}
                  </code>
                )}
                {fn.summary && (
                  <p className="mt-1 text-[13px] leading-snug text-ph-body">{fn.summary}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {functions.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 font-sans text-[12px] font-semibold text-ph-blue-link hover:underline"
        >
          {expanded ? 'Show fewer' : `Show ${functions.length - 5} more`}
        </button>
      )}
    </section>
  );
}

// ─── 7. Database tables ──────────────────────────────────────────────────────────

function DbTablesSection({ payload }: { payload: WikiPayload }) {
  const { dbTables } = payload;
  if (dbTables.length === 0) return null;
  return (
    <section>
      <Divider />
      <SectionHeader
        id="database-tables"
        title="Database tables"
        badge={{ label: `${dbTables.length} table${dbTables.length !== 1 ? 's' : ''}`, tone: 'purple' }}
      />
      <div className="mt-3">
        {dbTables.map((t) => (
          <DbTableCard key={t.id} table={t} />
        ))}
      </div>
    </section>
  );
}

function DbTableCard({ table }: { table: WikiPayload['dbTables'][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2 overflow-hidden rounded-ph border border-ph-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between bg-ph-surface px-4 py-3 text-left transition-colors hover:bg-ph-surface-soft"
      >
        <span className="flex items-center gap-2">
          <IconDatabase className="h-4 w-4 text-ph-purple" />
          <span className="font-mono text-[13px] font-medium text-ph-ink">{table.name}</span>
          <span className="text-[11px] text-ph-mute">({table.columns.length} cols)</span>
        </span>
        <IconChevronDown
          className={['h-4 w-4 text-ph-ash transition-transform', open ? 'rotate-180' : ''].join(' ')}
        />
      </button>
      {open && (
        <div className="border-t border-ph-border-soft">
          {table.summary && (
            <p className="px-4 pt-2 text-[13px] italic text-ph-mute">{table.summary}</p>
          )}
          {table.columns.map((col) => (
            <div
              key={col.name}
              className="flex items-center gap-3 border-b border-ph-border-soft px-4 py-2 font-mono text-[12px] last:border-0"
            >
              {col.pk && <IconKey className="h-3 w-3 shrink-0 text-ph-yellow-pressed" />}
              {col.fk && !col.pk && <IconLink className="h-3 w-3 shrink-0 text-ph-blue" />}
              <span className="text-ph-ink">{col.name}</span>
              <span className="text-ph-ash">{col.type}</span>
              {col.fk && <span className="text-[11px] text-ph-mute">→ {col.fk}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 8. Appears in flows ─────────────────────────────────────────────────────────

function FlowsSection({
  payload,
  onNavigate,
  nodeLabel,
}: {
  payload: WikiPayload;
  onNavigate: (id: string) => void;
  nodeLabel: (id: string) => string;
}) {
  const { flows, node, childModules } = payload;
  if (flows.length === 0) return null;
  // For clusters, "this node" highlight matches any child module too.
  const selfIds = new Set<string>([node.id, ...childModules.map((m) => m.id)]);

  return (
    <section>
      <Divider />
      <SectionHeader id="flows" title="Appears in flows" />
      <div className="mt-3">
        {flows.map((flow) => (
          <div key={flow.name} className="mb-3 rounded-ph border border-ph-border p-4">
            <div className="mb-3 flex items-center gap-2">
              <IconWorkflow className="h-4 w-4 text-ph-blue" />
              <span className="font-sans text-[14px] font-semibold text-ph-ink">{flow.name}</span>
            </div>
            <ol className="relative ml-3 border-l border-ph-border-soft">
              {flow.steps.map((step, i) => {
                const isThis = selfIds.has(step.node);
                return (
                  <li key={`${step.node}-${i}`} className={['ml-4 mb-3 last:mb-0', isThis ? 'font-semibold' : ''].join(' ')}>
                    <span
                      className={[
                        'absolute -left-[7px] h-3 w-3 rounded-full border',
                        isThis ? 'border-ph-yellow-pressed bg-ph-yellow' : 'border-ph-border bg-ph-surface',
                      ].join(' ')}
                    />
                    <button
                      onClick={() => onNavigate(step.node)}
                      className="text-left text-[13px] text-ph-body hover:text-ph-ink hover:underline"
                    >
                      {nodeLabel(step.node)}
                    </button>
                    <p className="mt-0.5 text-[12px] leading-snug text-ph-mute">{step.description}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── 9. Recent changes (PRs) ─────────────────────────────────────────────────────

function RecentChangesSection({ payload }: { payload: WikiPayload }) {
  const { pullRequests, node, childModules } = payload;
  const [showAll, setShowAll] = useState(false);
  if (pullRequests.length === 0) return null;

  const selfIds = new Set<string>([node.id, ...childModules.map((m) => m.id)]);
  const shown = showAll ? pullRequests : pullRequests.slice(0, 5);

  const statusDot: Record<string, string> = {
    merged: 'bg-ph-purple',
    open: 'bg-ph-green',
    draft: 'bg-ph-ash',
  };
  const touchBadge: Record<string, string> = {
    added: 'bg-ph-green-soft text-ph-green',
    modified: 'bg-ph-blue-soft text-ph-blue-teal',
    removed: 'bg-ph-red-soft text-ph-red',
  };

  return (
    <section>
      <Divider />
      <SectionHeader id="recent-changes" title="Recent changes" />
      <div className="mt-1">
        {shown.map((pr) => {
          const touch = pr.touched.find((t) => selfIds.has(t.node_id));
          return (
            <div key={pr.id} className="flex items-start gap-3 border-b border-ph-border-soft py-3 last:border-0">
              <span className={['mt-1.5 h-2 w-2 shrink-0 rounded-full', statusDot[pr.status]].join(' ')} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium leading-snug text-ph-ink">{pr.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-ph-mute">{pr.author}</span>
                  <span className="text-[11px] text-ph-ash">·</span>
                  <span className="text-[11px] text-ph-ash">{formatWikiDate(pr.date)}</span>
                  {touch && (
                    <span
                      className={[
                        'inline-flex items-center rounded-ph-pill px-1.5 py-0.5 text-[10px] font-semibold',
                        touchBadge[touch.change],
                      ].join(' ')}
                    >
                      {touch.change}
                    </span>
                  )}
                </div>
                {(pr.additions != null || pr.deletions != null) && (
                  <div className="mt-1 flex gap-2 font-mono text-[11px]">
                    {pr.additions != null && <span className="text-ph-green">+{pr.additions}</span>}
                    {pr.deletions != null && <span className="text-ph-red">-{pr.deletions}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {pullRequests.length > 5 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 font-sans text-[12px] font-semibold text-ph-blue-link hover:underline"
        >
          {showAll ? 'View fewer' : `View all ${pullRequests.length}`}
        </button>
      )}
    </section>
  );
}

// ─── 10. Wiki prose ──────────────────────────────────────────────────────────────

function WikiProseSection({
  payload,
  data,
  onNavigate,
}: {
  payload: WikiPayload;
  data: LighthouseData;
  onNavigate: (id: string) => void;
}) {
  const { sections } = payload;
  if (sections.length === 0) return null;

  const isNodeId = (href?: string): href is string =>
    !!href &&
    (data.nodes.some((n) => n.id === href) || data.clusters.some((c) => c.id === href));

  return (
    <section>
      <Divider />
      <SectionHeader id="documentation" title="Documentation" />
      <div className="mt-4 space-y-6">
        {sections.map((sec) => (
          <div key={sec.id}>
            <h3 className="mb-3 font-sans text-[16px] font-bold text-ph-ink">{sec.title}</h3>
            <div className="text-[14px] leading-relaxed text-ph-body">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
                  li: ({ children }) => <li className="leading-snug">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-ph-ink">{children}</strong>,
                  h3: ({ children }) => (
                    <h3 className="mb-2 mt-5 font-sans text-[14px] font-semibold text-ph-ink">{children}</h3>
                  ),
                  blockquote: ({ children }) => (
                    <div className="my-4 rounded-r-ph border-l-4 border-ph-yellow bg-yellow-50 px-4 py-3 text-[13px] text-ph-body">
                      {children}
                    </div>
                  ),
                  code: ({ children }) => (
                    <code className="rounded-ph-sm border border-ph-border bg-ph-surface-soft px-1.5 py-0.5 font-mono text-[12px] text-ph-ink">
                      {children}
                    </code>
                  ),
                  a: ({ href, children }) =>
                    isNodeId(href) ? (
                      <button
                        onClick={() => onNavigate(href)}
                        className="text-left text-ph-blue-link hover:underline"
                      >
                        {children}
                      </button>
                    ) : (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ph-blue-link hover:underline"
                      >
                        {children}
                      </a>
                    ),
                }}
              >
                {sec.body_markdown}
              </ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Explore related footer ──────────────────────────────────────────────────────

function ExploreRelatedFooter({
  payload,
  onNavigate,
}: {
  payload: WikiPayload;
  onNavigate: (id: string) => void;
}) {
  const { neighbors, parentCluster } = payload;
  const directNeighbors = neighbors.slice(0, 4);
  if (directNeighbors.length === 0 && !parentCluster) return null;

  return (
    <div className="mt-8 border-t border-ph-border pt-6">
      <p className="mb-3 font-sans text-[11px] font-bold uppercase tracking-widest text-ph-ash">
        Explore related
      </p>
      <div className="flex flex-wrap gap-2">
        {directNeighbors.map((n) => (
          <button
            key={`${n.direction}-${n.node.id}`}
            onClick={() => onNavigate(n.node.id)}
            className="inline-flex items-center gap-1.5 rounded-ph-pill border border-ph-border bg-ph-surface-soft px-3 py-1.5 font-sans text-[12px] text-ph-body transition-colors hover:border-ph-mute hover:text-ph-ink"
          >
            <IconArrowRight className="h-3 w-3" />
            {n.node.label}
          </button>
        ))}
        {parentCluster && (
          <button
            onClick={() => onNavigate(parentCluster.id)}
            className="inline-flex items-center gap-1.5 rounded-ph-pill border border-ph-yellow/30 bg-ph-yellow/10 px-3 py-1.5 font-sans text-[12px] font-semibold text-ph-yellow-pressed transition-colors hover:bg-ph-yellow/20"
          >
            <IconLayers className="h-3 w-3" />
            {parentCluster.label}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Missing / empty states ──────────────────────────────────────────────────────

function MissingNode({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <IconFileQuestion className="mb-3 h-8 w-8 text-ph-stone" />
      <p className="text-[14px] text-ph-mute">No documentation generated for this module yet.</p>
      <p className="mt-1 text-[12px] text-ph-ash">Re-run the Lighthouse indexer with a richer config.</p>
      <button
        onClick={onClose}
        className="mt-5 rounded-ph border border-ph-border bg-ph-surface-soft px-4 py-1.5 font-sans text-[12px] text-ph-body hover:bg-ph-border-dashed"
      >
        Close
      </button>
    </div>
  );
}

// ─── TOC builder ─────────────────────────────────────────────────────────────────

function buildToc(payload: WikiPayload): TocItem[] {
  const { node, neighbors, functions, rolledUpFunctionCount, dbTables, flows, pullRequests, sections, clusterKeyFiles } =
    payload;
  const items: TocItem[] = [];
  if (node.summary) items.push({ anchor: 'summary', label: 'Summary' });
  if (!(node.kind === 'file' && neighbors.length === 0))
    items.push({ anchor: 'connections', label: 'Connections' });

  const hasKeyFiles =
    node.kind === 'cluster'
      ? clusterKeyFiles.length > 0
      : node.key_files.filter((f) => f.trim() !== '').length > 0;
  if (hasKeyFiles) items.push({ anchor: 'key-files', label: 'Key files' });

  // Source files section — same data as key files but always shown when files exist.
  const hasSourceFiles =
    node.kind === 'cluster'
      ? clusterKeyFiles.some((g) => g.files.length > 0)
      : node.key_files.filter((f) => f.trim() !== '').length > 0;
  if (hasSourceFiles) items.push({ anchor: 'source-files', label: 'Source files' });

  const hasFns = node.kind === 'cluster' ? rolledUpFunctionCount > 0 : functions.length > 0;
  if (hasFns) items.push({ anchor: 'functions', label: 'Functions' });

  if (dbTables.length > 0) items.push({ anchor: 'database-tables', label: 'Database tables' });
  if (flows.length > 0) items.push({ anchor: 'flows', label: 'Appears in flows' });
  if (pullRequests.length > 0) items.push({ anchor: 'recent-changes', label: 'Recent changes' });
  if (sections.length > 0) items.push({ anchor: 'documentation', label: 'Documentation' });
  return items;
}
