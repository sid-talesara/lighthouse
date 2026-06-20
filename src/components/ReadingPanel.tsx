/**
 * ReadingPanel — Phase 2 linked reading surface.
 *
 * Bidirectional linking:
 *   Node → Section:  when selectedNodeId changes (set by MapCanvas), we find
 *     every section whose related_nodes list contains that id (or a parent
 *     cluster id). Those sections get a gentle amber highlight and the panel
 *     auto-scrolls to the first match.
 *
 *   Section → Nodes: when the user clicks a section header/card, we call
 *     onHighlightNodes with that section's related_nodes so the map machinery
 *     lights them up and dims everything else. Clicking the same section again
 *     clears the highlight.
 *
 * Phase 3 can also drive highlightedNodeIds from an LLM response — the seam
 * (onHighlightNodes) is already clean and independent of selection state.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';

import type { LighthouseData, Section } from '../types/lighthouse';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ReadingPanelProps {
  data: LighthouseData;
  /** The node id the user selected on the map. Drives Section → highlight. */
  selectedNodeId: string | null;
  /** The section id the user selected in the panel. Drives Node → highlight. */
  activeSectionId: string | null;
  /** Called when the user activates / deactivates a section. */
  onActivateSection: (sectionId: string | null) => void;
  /** Called when the panel wants to set the map highlight set. */
  onHighlightNodes: (ids: Set<string>) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a lookup: nodeId/clusterId → section ids */
function buildNodeToSections(sections: Section[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const sec of sections) {
    for (const nodeId of sec.related_nodes) {
      if (!map.has(nodeId)) map.set(nodeId, []);
      map.get(nodeId)!.push(sec.id);
    }
  }
  return map;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReadingPanel({
  data,
  selectedNodeId,
  activeSectionId,
  onActivateSection,
  onHighlightNodes,
}: ReadingPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Map: node/cluster id → list of section ids that mention it
  const nodeToSections = useMemo(
    () => buildNodeToSections(data.sections),
    [data.sections],
  );

  // Build a lookup: node → its parent cluster id (for cascade matching)
  const nodeParent = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of data.nodes) {
      m.set(n.id, n.parent);
    }
    return m;
  }, [data.nodes]);

  // Sections lit up by the currently selected map node
  const [mapHighlightedSections, setMapHighlightedSections] = useState<Set<string>>(
    new Set(),
  );

  // Node → Section direction: when selectedNodeId changes, find related sections
  useEffect(() => {
    if (!selectedNodeId) {
      setMapHighlightedSections(new Set());
      return;
    }

    const ids = new Set<string>();

    // Direct match
    const direct = nodeToSections.get(selectedNodeId) ?? [];
    for (const s of direct) ids.add(s);

    // Parent cluster match (e.g. clicking a module should light up sections
    // that reference the cluster)
    const parent = nodeParent.get(selectedNodeId);
    if (parent) {
      const viaClusters = nodeToSections.get(parent) ?? [];
      for (const s of viaClusters) ids.add(s);
    }

    setMapHighlightedSections(ids);

    // Auto-scroll to first matching section
    if (ids.size > 0) {
      const firstId = data.sections.find((s) => ids.has(s.id))?.id;
      if (firstId) {
        const el = sectionRefs.current.get(firstId);
        if (el && scrollContainerRef.current) {
          // Small timeout lets layout settle before scrolling
          setTimeout(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 60);
        }
      }
    }
  }, [selectedNodeId, nodeToSections, nodeParent, data.sections]);

  // Section → Nodes direction: toggle the active section and push its nodes
  const handleSectionClick = useCallback(
    (section: Section) => {
      if (activeSectionId === section.id) {
        // Deactivate: clear everything
        onActivateSection(null);
        onHighlightNodes(new Set());
      } else {
        onActivateSection(section.id);
        onHighlightNodes(new Set(section.related_nodes));
      }
    },
    [activeSectionId, onActivateSection, onHighlightNodes],
  );

  if (data.sections.length === 0) {
    return (
      <PanelShell>
        <div className="flex h-full items-center justify-center">
          <span className="font-mono text-code text-ph-ash">
            No sections in data.json
          </span>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      {/* Panel header */}
      <div className="shrink-0 border-b border-ph-border px-6 py-4">
        <div className="font-sans text-label uppercase tracking-wider text-ph-ash">
          System wiki
        </div>
        <div className="mt-0.5 font-display text-heading-md font-bold text-ph-ink">
          {data.repo.name}
        </div>
      </div>

      {/* Scrollable sections */}
      <div
        ref={scrollContainerRef}
        className="lh-scroll min-h-0 flex-1 overflow-y-auto bg-ph-surface-doc px-6 py-5"
      >
        <div className="flex flex-col gap-2">
          {data.sections.map((section) => {
            const isMapHighlighted = mapHighlightedSections.has(section.id);
            const isActive = activeSectionId === section.id;

            return (
              <SectionCard
                key={section.id}
                section={section}
                isMapHighlighted={isMapHighlighted}
                isActive={isActive}
                onClick={handleSectionClick}
                sectionRef={(el) => {
                  if (el) sectionRefs.current.set(section.id, el);
                  else sectionRefs.current.delete(section.id);
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Footer hint */}
      <div className="shrink-0 border-t border-ph-border bg-ph-surface px-6 py-3">
        <p className="font-sans text-label uppercase tracking-wider text-ph-ash">
          Click a section to highlight related nodes
        </p>
      </div>
    </PanelShell>
  );
}

// ─── Shell wrapper ────────────────────────────────────────────────────────────

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <aside className="flex h-full w-full flex-col bg-ph-surface animate-panel-in">
      {children}
    </aside>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: Section;
  isMapHighlighted: boolean; // lit by a map node selection
  isActive: boolean;         // actively selected by user click in panel
  onClick: (section: Section) => void;
  sectionRef: (el: HTMLElement | null) => void;
}

function SectionCard({
  section,
  isMapHighlighted,
  isActive,
  onClick,
  sectionRef,
}: SectionCardProps) {
  // Visual state priority: active (clicked in panel) > map-highlighted > rest
  const highlighted = isMapHighlighted || isActive;

  return (
    <article
      ref={sectionRef}
      className={[
        'group rounded-ph border transition-colors duration-200',
        highlighted
          ? 'border-l-[3px] border-l-ph-yellow border-ph-border bg-ph-surface'
          : 'border-ph-border-soft bg-ph-surface hover:border-ph-border hover:bg-ph-canvas',
      ].join(' ')}
    >
      {/* Section header — clickable to activate/deactivate */}
      <button
        onClick={() => onClick(section)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left"
        aria-pressed={isActive}
        aria-label={`${section.title} — click to highlight related map nodes`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Status dot */}
          <span
            className={[
              'h-2 w-2 shrink-0 rounded-full transition-colors duration-200',
              highlighted ? 'bg-ph-yellow' : 'bg-ph-stone group-hover:bg-ph-mute',
            ].join(' ')}
          />
          <span
            className={[
              'font-display text-heading-sm font-bold leading-snug text-ph-ink',
            ].join(' ')}
          >
            {section.title}
          </span>
        </div>

        {/* Related-nodes pill */}
        <span
          className={[
            'ml-3 shrink-0 rounded-ph-pill px-2.5 py-0.5 font-sans text-label transition-colors duration-200',
            highlighted
              ? 'bg-ph-yellow text-ph-ink'
              : 'bg-ph-surface-soft text-ph-mute',
          ].join(' ')}
        >
          {section.related_nodes.length} node{section.related_nodes.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Markdown body — always visible, generous leading */}
      <div className="px-5 pb-5">
        <div className="prose-lh">
          <ReactMarkdown
            components={{
              // Strip the redundant H2 that mirrors the section title
              h2: ({ children: c }) => (
                <h2 className="sr-only">{c}</h2>
              ),
              h3: ({ children: c }) => (
                <h3 className="mt-3 mb-1 font-display text-heading-sm font-bold text-ph-ink">
                  {c}
                </h3>
              ),
              p: ({ children: c }) => (
                <p className="mb-3 font-body text-body-sm leading-[1.6] text-ph-body last:mb-0">
                  {c}
                </p>
              ),
              ul: ({ children: c }) => (
                <ul className="mb-3 list-disc space-y-1 pl-4 last:mb-0">{c}</ul>
              ),
              ol: ({ children: c }) => (
                <ol className="mb-3 list-decimal space-y-1 pl-4 last:mb-0">{c}</ol>
              ),
              li: ({ children: c }) => (
                <li className="font-body text-body-sm leading-[1.55] text-ph-body marker:text-ph-ash">
                  {c}
                </li>
              ),
              strong: ({ children: c }) => (
                <strong className="font-semibold text-ph-ink">{c}</strong>
              ),
              code: ({ children: c }) => (
                <code className="rounded-ph-sm bg-ph-surface-soft px-1.5 py-0.5 font-mono text-code text-ph-blue-teal">
                  {c}
                </code>
              ),
              a: ({ children: c, href }) => (
                <a
                  href={href}
                  className="text-ph-blue-link underline decoration-ph-blue/40 underline-offset-2 hover:decoration-ph-blue"
                >
                  {c}
                </a>
              ),
            }}
          >
            {section.body_markdown}
          </ReactMarkdown>
        </div>
      </div>
    </article>
  );
}
