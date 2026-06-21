/**
 * WikiView — factory.ai-style LINEAR auto-wiki.
 *
 * Layout:
 *   Left rail (240px)  — section nav list (from data.sections)
 *   Main column        — selected section markdown, rendered with react-markdown
 *   Right rail (176px) — in-page TOC (headings extracted from markdown)
 *
 * Features:
 *   - Breadcrumb: repo → section title
 *   - Prev / Next section navigation
 *   - related_nodes → clickable pills → onSelectNode / onHighlightNodes / onOpenWiki
 *   - Scrollspy TOC via IntersectionObserver (delegated to WikiTOC)
 *   - Deep-linking: ?section=<id> param supported via local state synced to URL
 *   - Empty state when no sections
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ViewProps } from './viewContract';
import type { Section } from '../../types/lighthouse';
import { WikiMarkdown } from './wiki/WikiMarkdown';
import { WikiTOC } from './wiki/WikiTOC';
import type { TocItem } from './wiki/WikiTOC';

// ─── inline SVG icons (lucide-react is not installed) ─────────────────────────

function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function IconBookOpen({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
function IconFileText({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
function IconExternalLink({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
function IconLayers({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Extract h2/h3 headings from a markdown string for the TOC. */
function extractTocItems(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    if (h2) {
      const label = h2[1].trim();
      items.push({ id: slugify(label), label, level: 1 });
    } else if (h3) {
      const label = h3[1].trim();
      items.push({ id: slugify(label), label, level: 2 });
    }
  }
  return items;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/** Read ?section=<id> from URL. Returns null when absent or invalid. */
function readSectionParam(sections: Section[]): string | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('section');
  if (!id) return null;
  return sections.some((s) => s.id === id) ? id : null;
}

/** Write ?section=<id> into the URL without disturbing other params. */
function setSectionParam(id: string) {
  const params = new URLSearchParams(window.location.search);
  params.set('section', id);
  window.history.replaceState(null, '', `?${params.toString()}`);
}

/** Remove ?section from URL. */
function clearSectionParam() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('section')) return;
  params.delete('section');
  const qs = params.toString();
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
}

// ─── node label lookup ────────────────────────────────────────────────────────

function useNodeLabel(data: ViewProps['data']) {
  return useCallback(
    (id: string): string => {
      const node = data.nodes.find((n) => n.id === id);
      if (node) return node.label;
      const cluster = data.clusters.find((c) => c.id === id);
      return cluster?.label ?? id;
    },
    [data]
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

interface RelatedNodePillsProps {
  ids: string[];
  getLabel: (id: string) => string;
  onSelectNode: (id: string | null) => void;
  onHighlightNodes: (ids: Set<string>) => void;
  onOpenWiki?: (id: string) => void;
}

function RelatedNodePills({
  ids,
  getLabel,
  onSelectNode,
  onHighlightNodes,
  onOpenWiki,
}: RelatedNodePillsProps) {
  if (ids.length === 0) return null;
  return (
    <div className="mt-6 pt-5 border-t border-ph-border-soft">
      <p className="font-sans text-label font-bold text-ph-ash uppercase tracking-widest mb-3">
        Related modules
      </p>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <button
            key={id}
            onClick={() => {
              onSelectNode(id);
              onHighlightNodes(new Set([id]));
              onOpenWiki?.(id);
            }}
            title={`Open ${id} in module wiki`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ph-pill
                       border border-ph-border bg-ph-surface
                       font-sans text-[12px] text-ph-body
                       hover:border-ph-yellow hover:text-ph-ink
                       transition-colors cursor-pointer"
          >
            <IconFileText className="w-3 h-3 flex-shrink-0" />
            <span className="max-w-[180px] truncate">{getLabel(id)}</span>
            <IconExternalLink className="w-3 h-3 flex-shrink-0 opacity-50" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── left nav ─────────────────────────────────────────────────────────────────

interface NavRailProps {
  sections: Section[];
  activeId: string;
  onSelect: (id: string) => void;
  repoName: string;
}

function NavRail({ sections, activeId, onSelect, repoName }: NavRailProps) {
  return (
    <nav
      className="w-60 flex-shrink-0 flex flex-col border-r border-ph-border bg-ph-surface overflow-y-auto"
      aria-label="Wiki sections"
    >
      {/* Repo header */}
      <div className="px-4 py-4 border-b border-ph-border-soft flex items-center gap-2 flex-shrink-0">
        <IconLayers className="w-4 h-4 text-ph-yellow flex-shrink-0" />
        <span className="font-sans font-bold text-[13px] text-ph-ink truncate">{repoName}</span>
      </div>

      {/* Section list */}
      <ul className="flex-1 py-2">
        {sections.map((section, idx) => {
          const isActive = section.id === activeId;
          return (
            <li key={section.id}>
              <button
                onClick={() => onSelect(section.id)}
                className={[
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors',
                  isActive
                    ? 'bg-ph-surface-soft border-l-[3px] border-ph-yellow text-ph-ink font-semibold'
                    : 'border-l-[3px] border-transparent text-ph-mute hover:bg-ph-canvas hover:text-ph-ink',
                ].join(' ')}
              >
                <span className="font-sans text-[12px] text-ph-stone w-4 flex-shrink-0 text-right select-none">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span className="font-sans text-[13px] leading-snug">{section.title}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Footer count */}
      <div className="px-4 py-3 border-t border-ph-border-soft flex-shrink-0">
        <span className="font-mono text-label text-ph-stone">
          {sections.length} sections
        </span>
      </div>
    </nav>
  );
}

// ─── prev / next bar ─────────────────────────────────────────────────────────

interface PrevNextProps {
  sections: Section[];
  activeIdx: number;
  onSelect: (id: string) => void;
}

function PrevNext({ sections, activeIdx, onSelect }: PrevNextProps) {
  const prev = activeIdx > 0 ? sections[activeIdx - 1] : null;
  const next = activeIdx < sections.length - 1 ? sections[activeIdx + 1] : null;

  if (!prev && !next) return null;

  return (
    <div className="mt-10 pt-6 border-t border-ph-border flex justify-between items-center gap-4">
      {prev ? (
        <button
          onClick={() => onSelect(prev.id)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-ph
                     border border-ph-border bg-ph-surface
                     font-sans text-[13px] text-ph-body
                     hover:border-ph-mute hover:text-ph-ink
                     transition-colors"
        >
          <IconChevronLeft className="w-4 h-4" />
          <span>{prev.title}</span>
        </button>
      ) : (
        <div />
      )}
      {next ? (
        <button
          onClick={() => onSelect(next.id)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-ph
                     border border-ph-border bg-ph-surface
                     font-sans text-[13px] text-ph-body
                     hover:border-ph-mute hover:text-ph-ink
                     transition-colors"
        >
          <span>{next.title}</span>
          <IconChevronRight className="w-4 h-4" />
        </button>
      ) : (
        <div />
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

const SCROLL_ID = 'wiki-main-scroll';

export function WikiView({
  data,
  onSelectNode,
  onHighlightNodes,
  onOpenWiki,
}: ViewProps) {
  const sections = useMemo(() => data.sections ?? [], [data.sections]);
  const getLabel = useNodeLabel(data);

  // Active section id — init from URL ?section=<id> or first section
  const [activeId, setActiveId] = useState<string>(() => {
    const fromUrl = readSectionParam(sections);
    return fromUrl ?? sections[0]?.id ?? '';
  });

  // Unused ref needed to satisfy strict — keeps scrollContainerRef from being
  // removed by the linter as a false positive (the div id does the scroll work).
  const _scrollRef = useRef<HTMLDivElement>(null);

  // Sync section into URL when changed
  const selectSection = useCallback((id: string) => {
    setActiveId(id);
    if (id) setSectionParam(id);
    else clearSectionParam();
    // Scroll to top of reading column
    const el = document.getElementById(SCROLL_ID);
    if (el) el.scrollTop = 0;
  }, []);

  // On tab switch INTO wiki, re-read ?section if present
  useEffect(() => {
    const fromUrl = readSectionParam(sections);
    if (fromUrl && fromUrl !== activeId) {
      setActiveId(fromUrl);
    }
    // Only run on mount / sections change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  // ── derived ────────────────────────────────────────────────────────────────

  const activeSection = useMemo(
    () => sections.find((s) => s.id === activeId) ?? sections[0] ?? null,
    [sections, activeId]
  );

  const activeIdx = useMemo(
    () => sections.findIndex((s) => s.id === (activeSection?.id ?? '')),
    [sections, activeSection]
  );

  // TOC from markdown headings
  const tocItems = useMemo<TocItem[]>(() => {
    if (!activeSection) return [];
    return extractTocItems(activeSection.body_markdown);
  }, [activeSection]);

  // ── empty state ────────────────────────────────────────────────────────────

  if (sections.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-ph-canvas">
        <div className="bg-ph-surface border border-ph-border rounded-ph p-8 max-w-sm w-full text-center">
          <IconBookOpen className="w-8 h-8 text-ph-stone mx-auto mb-3" />
          <p className="font-sans font-bold text-ph-ink text-base mb-1">No wiki sections yet.</p>
          <p className="font-body text-body-sm text-ph-mute">
            Re-run the Lighthouse indexer to generate prose documentation.
          </p>
        </div>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full w-full flex overflow-hidden bg-ph-canvas">
      {/* Left nav rail */}
      <NavRail
        sections={sections}
        activeId={activeSection?.id ?? ''}
        onSelect={selectSection}
        repoName={data.repo.name}
      />

      {/* Main + right TOC wrapper */}
      <div className="flex flex-1 overflow-hidden">
        {/* Scrollable main column */}
        <div
          id={SCROLL_ID}
          ref={_scrollRef}
          className="flex-1 overflow-y-auto scroll-smooth"
        >
          <div className="mx-auto max-w-[700px] px-8 py-8">
            {activeSection ? (
              <>
                {/* Breadcrumb */}
                <nav
                  className="flex items-center gap-1.5 font-sans text-label text-ph-ash mb-6"
                  aria-label="Breadcrumb"
                >
                  <span className="uppercase tracking-widest">{data.repo.name}</span>
                  <IconChevronRight className="w-3 h-3 text-ph-stone" />
                  <span className="uppercase tracking-widest text-ph-mute">
                    {activeSection.title}
                  </span>
                </nav>

                {/* Section heading */}
                <div className="mb-6 pb-5 border-b border-ph-border">
                  <div className="font-mono text-label text-ph-ash uppercase tracking-widest mb-2">
                    {String(activeIdx + 1).padStart(2, '0')} /{' '}
                    {String(sections.length).padStart(2, '0')}
                  </div>
                  <h1 className="font-sans font-extrabold text-[28px] leading-tight text-ph-ink">
                    {activeSection.title}
                  </h1>
                </div>

                {/* Rendered markdown */}
                <div>
                  <WikiMarkdown content={activeSection.body_markdown} />
                </div>

                {/* Related nodes */}
                <RelatedNodePills
                  ids={activeSection.related_nodes}
                  getLabel={getLabel}
                  onSelectNode={onSelectNode}
                  onHighlightNodes={onHighlightNodes}
                  onOpenWiki={onOpenWiki}
                />

                {/* Prev / Next */}
                <PrevNext
                  sections={sections}
                  activeIdx={activeIdx}
                  onSelect={selectSection}
                />

                {/* Bottom breathing room */}
                <div className="h-16" />
              </>
            ) : null}
          </div>
        </div>

        {/* Right TOC rail */}
        <div className="flex-shrink-0 w-44 py-8 px-2 hidden xl:block overflow-y-auto">
          <WikiTOC items={tocItems} scrollContainerId={SCROLL_ID} />
        </div>
      </div>
    </div>
  );
}
