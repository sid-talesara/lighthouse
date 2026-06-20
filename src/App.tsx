import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';

import { loadData } from './lib/loadData';
import type { LighthouseData } from './types/lighthouse';
import { ReadingPanel } from './components/ReadingPanel';
import { AskBox } from './components/AskBox';
import { GeneratePanel } from './components/GeneratePanel';
import { ArchitectureView } from './components/views/ArchitectureView';
import { FilesView } from './components/views/FilesView';
import { DependenciesView } from './components/views/DependenciesView';
import { FlowsView } from './components/views/FlowsView';
import type { ViewId, ViewProps } from './components/views/viewContract';

// View registry — each entry maps a tab to a component that satisfies the
// shared ViewProps contract (src/components/views/viewContract.ts). Wave B
// fills the individual views; App never needs to change to add behaviour.
const VIEWS: { id: ViewId; label: string; Component: (p: ViewProps) => JSX.Element }[] = [
  { id: 'architecture', label: 'Architecture', Component: ArchitectureView },
  { id: 'files', label: 'Files', Component: FilesView },
  { id: 'dependencies', label: 'Dependencies', Component: DependenciesView },
  { id: 'flows', label: 'Flows', Component: FlowsView },
];

const ONBOARD_KEY = 'lh-onboard-dismissed';

export default function App() {
  const [data, setData] = useState<LighthouseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ── View switcher ──────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<ViewId>('architecture');

  // ── Onboarding hint bar — dismissable, once per session ─────────────
  const [showOnboard, setShowOnboard] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(ONBOARD_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const dismissOnboard = useCallback(() => {
    setShowOnboard(false);
    try {
      sessionStorage.setItem(ONBOARD_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  // ── Cross-view state seams (preserved from prior phases) ────────────
  // selectedNodeId: the node the user clicked. The reading panel reads this
  //   to highlight/scroll the related section; views reflect it.
  // highlightedNodeIds: the set views light up. Driven by panel section
  //   clicks AND by "ask the map" LLM answers.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  // activeSectionId: active section in the reading panel (set by panel click).
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    loadData()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const handleGenerateDone = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    setActiveSectionId(null);
    setHighlightedNodeIds(id ? new Set([id]) : new Set());
  }, []);

  // ReadingPanel: user clicked a section (Section → Nodes direction).
  const handleActivateSection = useCallback((sectionId: string | null) => {
    setActiveSectionId(sectionId);
    if (sectionId !== null) setSelectedNodeId(null);
  }, []);

  // Push a set of node ids to the global highlight (panel + ask + views).
  const handleHighlightNodes = useCallback((ids: Set<string>) => {
    setHighlightedNodeIds(ids);
  }, []);

  // AskBox callbacks (Phase 3).
  const handleAskAnswer = useCallback((ids: Set<string>) => {
    setHighlightedNodeIds(ids);
    setSelectedNodeId(null);
    setActiveSectionId(null);
  }, []);

  const handleAskClear = useCallback(() => {
    setHighlightedNodeIds(new Set());
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const modules = data.nodes.filter((n) => n.kind === 'module').length;
    const files = data.nodes.filter((n) => n.kind === 'file').length;
    return { modules, files };
  }, [data]);

  // ── Error state ────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-ph-canvas p-8">
        <div className="max-w-md rounded-ph border border-ph-border bg-ph-surface p-6">
          <div className="font-display text-heading-lg text-ph-ink">
            Something went sideways
          </div>
          <p className="mt-1 font-body text-body-sm text-ph-body">
            <span className="rounded-ph-sm bg-ph-surface-soft px-1.5 py-0.5 font-mono text-code text-ph-mute">
              public/data.json
            </span>{' '}
            failed to load.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-ph border border-ph-border-dark bg-ph-code-bg p-3 font-mono text-code text-ph-red-soft">
            {error}
          </pre>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-ph border border-ph-yellow-pressed bg-ph-yellow px-4 font-sans text-sm font-bold text-ph-ink transition-colors duration-75 hover:bg-ph-yellow-pressed active:translate-y-px"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────
  if (!data || !stats) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-ph-canvas">
        <LighthouseGlyph className="h-10 w-10 text-ph-yellow" />
        <div className="font-sans text-body-sm text-ph-mute">
          Charting the map… (this is the fast part)
        </div>
      </div>
    );
  }

  const ActiveComponent = VIEWS.find((v) => v.id === activeView)!.Component;
  const viewProps: ViewProps = {
    data,
    selectedNodeId,
    highlightedNodeIds,
    onSelectNode: handleSelect,
    onHighlightNodes: handleHighlightNodes,
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ph-canvas font-body text-ph-body">
      {/* ── Top bar: wordmark + ask box ────────────────────────────── */}
      <header className="z-20 flex shrink-0 items-center gap-4 border-b border-ph-border bg-ph-surface px-5 py-3">
        <div className="flex shrink-0 items-center gap-2.5">
          <LighthouseGlyph className="h-7 w-7 text-ph-yellow" />
          <span className="font-display text-heading-lg font-extrabold tracking-tight text-ph-ink">
            Lighthouse
          </span>
        </div>
        <span className="hidden h-5 w-px bg-ph-border sm:block" />
        <div className="hidden min-w-0 flex-col sm:flex">
          <span className="truncate font-mono text-code text-ph-body">{data.repo.name}</span>
        </div>

        {/* Ask box — flexible right, cache-first logic intact */}
        <div className="ml-auto flex min-w-0 flex-1 justify-end">
          <div className="w-full max-w-[540px]">
            <AskBox data={data} onAnswer={handleAskAnswer} onClear={handleAskClear} />
          </div>
        </div>

        <span className="hidden h-5 w-px bg-ph-border lg:block" />
        <div className="hidden shrink-0 items-center gap-3 font-mono text-code text-ph-mute lg:flex">
          <Stat n={data.clusters.length} label="clusters" />
          <Stat n={stats.modules} label="modules" />
          <Stat n={stats.files} label="files" />
          <GeneratePanel onDone={handleGenerateDone} />
        </div>
      </header>

      {/* ── View-switcher tab bar ──────────────────────────────────── */}
      <nav className="z-10 flex shrink-0 items-center gap-1 border-b border-ph-border bg-ph-surface px-5">
        {VIEWS.map((v) => {
          const isActive = activeView === v.id;
          return (
            <button
              key={v.id}
              onClick={() => setActiveView(v.id)}
              aria-current={isActive ? 'page' : undefined}
              className={[
                '-mb-px border-b-2 px-3.5 py-2.5 font-sans text-heading-sm transition-colors',
                isActive
                  ? 'border-ph-yellow font-semibold text-ph-ink'
                  : 'border-transparent text-ph-mute hover:border-ph-border hover:text-ph-ink',
              ].join(' ')}
            >
              {v.label}
            </button>
          );
        })}
      </nav>

      {/* ── Onboarding "what is this" hint bar ─────────────────────── */}
      {showOnboard && (
        <div className="z-10 flex shrink-0 animate-fade-in items-start gap-3 border-b border-ph-border bg-ph-blue-soft px-5 py-2.5">
          <span className="shrink-0 text-base" aria-hidden>
            🦔
          </span>
          <p className="min-w-0 flex-1 font-body text-body-sm text-ph-blue-teal">
            <span className="font-semibold">
              A live, explorable map of the {data.repo.name} codebase
            </span>
            {' — '}click a cluster to dig in, switch tabs to browse files,
            dependencies, and flows, or just ask it anything in the box above.
          </p>
          <button
            onClick={dismissOnboard}
            aria-label="Dismiss"
            className="shrink-0 rounded-ph-sm px-1.5 text-ph-ash transition-colors hover:text-ph-ink"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Main content: active view + reading panel ──────────────── */}
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <ActiveComponent {...viewProps} />
        </main>

        {/* Reading panel — global for now (Wave A) */}
        <div className="hidden min-h-0 w-[400px] shrink-0 border-l border-ph-border lg:flex lg:flex-col">
          <ReadingPanel
            data={data}
            selectedNodeId={selectedNodeId}
            activeSectionId={activeSectionId}
            onActivateSection={handleActivateSection}
            onHighlightNodes={handleHighlightNodes}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-semibold text-ph-ink">{n}</span>
      <span className="text-ph-ash">{label}</span>
    </span>
  );
}

/** Simple, our-own lighthouse glyph (flat, line-style). */
function LighthouseGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* tower */}
      <path d="M9 9 L8 21 H16 L15 9 Z" />
      <path d="M9 9 H15" />
      {/* lamp room */}
      <rect x="9.5" y="5" width="5" height="4" rx="0.5" />
      {/* light beams */}
      <path d="M14.5 7 L19 5.5 M14.5 7 L19 8.5" />
      <path d="M9.5 7 L5 5.5 M9.5 7 L5 8.5" />
      {/* top */}
      <path d="M12 5 V3" />
    </svg>
  );
}
