import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';

import { loadData } from './lib/loadData';
import { DEFAULT_GENERATE_MODEL, type GenerateModel } from './lib/generateOptions';
import type { LighthouseData } from './types/lighthouse';
import { ReadingPanel } from './components/ReadingPanel';
import { AskBox } from './components/AskBox';
import { GeneratePanel } from './components/GeneratePanel';
import { ArchitectureView } from './components/views/ArchitectureView';
import { FilesView } from './components/views/FilesView';
import { DependenciesView } from './components/views/DependenciesView';
import { FlowsView } from './components/views/FlowsView';
import { ChangesView } from './components/views/ChangesView';
import { DatabaseView } from './components/views/DatabaseView';
import { FunctionsView } from './components/views/FunctionsView';
import { ServicesView } from './components/views/ServicesView';
import type { ViewId, ViewProps } from './components/views/viewContract';
import { ModuleWiki } from './components/wiki/ModuleWiki';
import { useWikiStack } from './hooks/useWikiStack';
import { Onboarding } from './components/Onboarding';

// View registry — each entry maps a tab to a component that satisfies the
// shared ViewProps contract (src/components/views/viewContract.ts). Wave B
// fills the individual views; App never needs to change to add behaviour.
const VIEWS: { id: ViewId; label: string; Component: (p: ViewProps) => JSX.Element }[] = [
  { id: 'architecture', label: 'Architecture', Component: ArchitectureView },
  { id: 'files', label: 'Files', Component: FilesView },
  { id: 'dependencies', label: 'Dependencies', Component: DependenciesView },
  { id: 'flows', label: 'Flows', Component: FlowsView },
  { id: 'changes', label: 'Changes', Component: ChangesView },
  { id: 'services', label: 'Services', Component: ServicesView },
  { id: 'database', label: 'Database', Component: DatabaseView },
  { id: 'functions', label: 'Functions', Component: FunctionsView },
];

const ONBOARD_KEY = 'lh-onboard-dismissed';
const WIKI_ONBOARD_KEY = 'lh_onboarded';
const QUERY_REPO_PATH_KEY = 'lh-query-repo-path';
const QUERY_MODEL_KEY = 'lh-query-model';
/** Persists across sessions: user has seen the landing and entered the app. */
const LH_ENTERED_KEY = 'lh_entered';

function readStoredRepoPath(): string {
  try {
    return localStorage.getItem(QUERY_REPO_PATH_KEY) ?? '';
  } catch {
    return '';
  }
}

function readStoredModel(): GenerateModel {
  try {
    const stored = localStorage.getItem(QUERY_MODEL_KEY);
    return stored === 'gpt-5.5' || stored === 'gpt-5.4' || stored === 'gpt-5.4-mini'
      ? stored
      : DEFAULT_GENERATE_MODEL;
  } catch {
    return DEFAULT_GENERATE_MODEL;
  }
}

export default function App() {
  const [data, setData] = useState<LighthouseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [queryRepoPath, setQueryRepoPath] = useState(readStoredRepoPath);
  const [queryModel, setQueryModel] = useState<GenerateModel>(readStoredModel);

  // ── Landing gate: show Onboarding until the user explicitly enters ──
  const [entered, setEntered] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LH_ENTERED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const handleEnter = useCallback(() => {
    setEntered(true);
    try {
      localStorage.setItem(LH_ENTERED_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);
  // Clicking the Lighthouse logo in the top-bar returns to landing.
  const handleReturnToLanding = useCallback(() => {
    setEntered(false);
    try {
      localStorage.removeItem(LH_ENTERED_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Tracks whether we should auto-open the GeneratePanel after entering.
  const [pendingGenerate, setPendingGenerate] = useState(false);

  // ── View switcher ──────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<ViewId>('architecture');

  // ── Module wiki drawer — history-stack navigation ───────────────────
  const wikiStack = useWikiStack();

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

  // ── Wiki onboarding (persistent across sessions, per spec lh_onboarded) ──
  const [wikiOnboarded, setWikiOnboarded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(WIKI_ONBOARD_KEY) === 'true';
    } catch {
      return false;
    }
  });

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

  useEffect(() => {
    const generatedRepoPath = data?.repo.path?.trim();
    if (!generatedRepoPath || queryRepoPath.trim()) return;

    setQueryRepoPath(generatedRepoPath);
    try {
      localStorage.setItem(QUERY_REPO_PATH_KEY, generatedRepoPath);
    } catch {
      // Ignore storage failures; the in-memory value still enables local Codex.
    }
  }, [data?.repo.path, queryRepoPath]);

  const handleGenerateDone = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const handleGenerateSettingsChange = useCallback((settings: { repoPath: string; model: GenerateModel }) => {
    setQueryRepoPath(settings.repoPath);
    setQueryModel(settings.model);
    try {
      localStorage.setItem(QUERY_REPO_PATH_KEY, settings.repoPath);
      localStorage.setItem(QUERY_MODEL_KEY, settings.model);
    } catch {
      // Ignore storage failures; in-memory state still works.
    }
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

  // ── Wiki entry points ───────────────────────────────────────────────
  // The single openWiki entry point used everywhere (node cards, reading
  // panel header, files/deps/functions views). Opening also marks the user
  // as onboarded so the first-load intro + cluster hints retire.
  const markWikiOnboarded = useCallback(() => {
    try {
      localStorage.setItem(WIKI_ONBOARD_KEY, 'true');
    } catch {
      /* ignore */
    }
    setWikiOnboarded(true);
  }, []);

  const openWiki = useCallback(
    (id: string) => {
      wikiStack.open(id);
      markWikiOnboarded();
    },
    [wikiStack, markWikiOnboarded],
  );

  // Neighbor / flow / PR cross-links push onto the history stack.
  const navigateWiki = useCallback((id: string) => wikiStack.push(id), [wikiStack]);

  // "Show on map": close the drawer, switch to Architecture, select + highlight.
  const handleShowOnMap = useCallback(
    (id: string) => {
      wikiStack.close();
      setActiveView('architecture');
      setSelectedNodeId(id);
      setActiveSectionId(null);
      setHighlightedNodeIds(new Set([id]));
    },
    [wikiStack],
  );

  const stats = useMemo(() => {
    if (!data) return null;
    const modules = data.nodes.filter((n) => n.kind === 'module').length;
    const explicitFiles = data.nodes.filter((n) => n.kind === 'file').length;
    const indexedFiles = data.files?.length ?? 0;
    const keyFiles = new Set(
      data.nodes.flatMap((n) => n.key_files.filter((file) => file.trim() !== '')),
    ).size;
    const files = indexedFiles > 0 ? indexedFiles : explicitFiles > 0 ? explicitFiles : keyFiles;
    const fileLabel = indexedFiles > 0 || explicitFiles > 0 ? 'files' : 'key files';
    return { modules, files, fileLabel };
  }, [data]);

  // Auto-open generate panel when user enters via "Generate for another repo".
  useEffect(() => {
    if (!pendingGenerate || !entered) return;
    // GeneratePanel renders a <button> with text "Generate" in the header.
    // We give React one tick to mount the app shell before clicking it.
    const timer = setTimeout(() => {
      const btns = document.querySelectorAll<HTMLButtonElement>('header button');
      for (const btn of btns) {
        if (btn.textContent?.includes('Generate')) {
          btn.click();
          break;
        }
      }
      setPendingGenerate(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [pendingGenerate, entered]);

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
              Lighthouse data
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

  // ── Landing gate ───────────────────────────────────────────────────
  // Show the Onboarding screen until the user explicitly enters.
  // We render it even before data is fully loaded — the component handles null.
  if (!entered) {
    return (
      <Onboarding
        data={data}
        onEnter={handleEnter}
        onGenerate={() => {
          setPendingGenerate(true);
          handleEnter();
        }}
      />
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
    onOpenWiki: openWiki,
    showWikiHint: !wikiOnboarded,
    repoPath: queryRepoPath,
    model: queryModel,
  };

  const showWikiIntro = !wikiOnboarded && wikiStack.currentId === null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ph-canvas font-body text-ph-body">
      {/* ── Top bar: wordmark + ask box ────────────────────────────── */}
      <header className="z-20 flex shrink-0 items-center gap-4 border-b border-ph-border bg-ph-surface px-5 py-3">
        <button
          onClick={handleReturnToLanding}
          title="Back to landing"
          className="flex shrink-0 items-center gap-2.5 rounded-ph-sm transition-opacity duration-75 hover:opacity-75"
        >
          <LighthouseGlyph className="h-7 w-7 text-ph-yellow" />
          <span className="font-display text-heading-lg font-extrabold tracking-tight text-ph-ink">
            Lighthouse
          </span>
        </button>
        <span className="hidden h-5 w-px bg-ph-border sm:block" />
        <div className="hidden min-w-0 flex-col sm:flex">
          <span className="truncate font-mono text-code text-ph-body">{data.repo.name}</span>
        </div>

        {/* Ask box — flexible right, cache-first logic intact */}
        <div className="ml-auto flex min-w-0 flex-1 justify-end">
          <div className="w-full max-w-[540px]">
            <AskBox
              data={data}
              repoPath={queryRepoPath}
              model={queryModel}
              onAnswer={handleAskAnswer}
              onClear={handleAskClear}
            />
          </div>
        </div>

        <span className="hidden h-5 w-px bg-ph-border lg:block" />
        <div className="hidden shrink-0 items-center gap-3 font-mono text-code text-ph-mute lg:flex">
          <Stat n={data.clusters.length} label="clusters" />
          <Stat n={stats.modules} label="modules" />
          <Stat n={stats.files} label={stats.fileLabel} />
          <GeneratePanel
            onDone={handleGenerateDone}
            initialRepoPath={queryRepoPath}
            initialModel={queryModel}
            onSettingsChange={handleGenerateSettingsChange}
          />
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

          {/* First-load wiki intro — invites opening a cluster wiki. */}
          {showWikiIntro && activeView === 'architecture' && (
            <div className="pointer-events-none absolute left-1/2 top-6 z-10 w-full max-w-[400px] -translate-x-1/2 px-4">
              <div className="pointer-events-auto animate-fade-in rounded-ph border border-ph-border bg-ph-surface p-6 shadow-ph-float">
                <p className="font-display text-heading-lg font-extrabold text-ph-ink">
                  Your codebase, mapped.
                </p>
                <p className="mt-1 font-body text-body-sm leading-relaxed text-ph-mute">
                  Each cluster is a feature area; each node is a module. Click any
                  cluster to expand it, then open its wiki — structure,
                  dependencies, recent changes, and prose docs in one place.
                </p>
                <div className="mt-3 flex items-center gap-2 font-body text-body-sm text-ph-body">
                  <span className="text-ph-yellow" aria-hidden>
                    ➤
                  </span>
                  <span>Click a cluster to start</span>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Reading panel — global for now (Wave A) */}
        <div className="hidden min-h-0 w-[400px] shrink-0 border-l border-ph-border lg:flex lg:flex-col">
          <ReadingPanel
            data={data}
            selectedNodeId={selectedNodeId}
            activeSectionId={activeSectionId}
            onActivateSection={handleActivateSection}
            onHighlightNodes={handleHighlightNodes}
            onOpenWiki={openWiki}
          />
        </div>
      </div>

      {/* ── Module wiki drawer — the rich deep-dive ─────────────────── */}
      <ModuleWiki
        data={data}
        stack={wikiStack}
        onNavigate={navigateWiki}
        onClose={wikiStack.close}
        onShowOnMap={handleShowOnMap}
      />
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
