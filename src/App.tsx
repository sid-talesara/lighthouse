import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useUrlState, parseUrl } from './hooks/useUrlState';

import { loadData } from './lib/loadData';
import { DEFAULT_GENERATE_MODEL, type GenerateModel } from './lib/generateOptions';
import type { LighthouseData } from './types/lighthouse';
import { ReadingPanel } from './components/ReadingPanel';
import { AskBox } from './components/AskBox';
import { GeneratePanel } from './components/GeneratePanel';
import { ArchitectureView } from './components/views/ArchitectureView';
import { WikiView } from './components/views/WikiView';
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
import { useGenerate, type GenerateStatus, type GenerateEventLogEntry } from './hooks/useGenerate';
import { GENERATE_MODEL_OPTIONS, type GenerateModelOption } from './lib/generateOptions';

/**
 * Generate-on-Home contract — the extra props App passes to <Onboarding/> so a
 * follow-up "Home" agent can render the full "generate for another repo" flow
 * on the landing. Onboarding's own OnboardingProps does not yet declare these;
 * App owns this file and the Home agent owns Onboarding.tsx. We keep every
 * value strongly typed here (so the wiring is checked) and hand them to the
 * component via a single typed merge. ALL fields are optional — the existing
 * onGenerate() escape hatch keeps working if they are ignored.
 */
export interface OnboardingGenerateContract {
  /** Start generation in place: persists settings, runs local Codex. */
  onGenerateRepo: (repoPath: string, model: GenerateModel) => void;
  generateStatus: GenerateStatus;
  generateStage: string;
  generateElapsedLabel: string;
  generateError: string | null;
  generateEvents: GenerateEventLogEntry[];
  onCancelGenerate: () => void;
  models: GenerateModelOption[];
  defaultRepoPath: string;
  defaultModel: GenerateModel;
}

// View registry — each entry maps a tab to a component that satisfies the
// shared ViewProps contract (src/components/views/viewContract.ts). Wave B
// fills the individual views; App never needs to change to add behaviour.
const VIEWS: { id: ViewId; label: string; Component: (p: ViewProps) => JSX.Element }[] = [
  { id: 'architecture', label: 'Architecture', Component: ArchitectureView },
  { id: 'wiki', label: 'Wiki', Component: WikiView },
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

// ── Right sidebar (reading panel / ask) resize config ──────────────────
const SIDEBAR_WIDTH_KEY = 'lh-sidebar-width';
const SIDEBAR_MIN_WIDTH = 320;
const SIDEBAR_MAX_WIDTH = 720;
const SIDEBAR_DEFAULT_WIDTH = 400;

/** The two stacked surfaces inside the resizable right sidebar. */
type SidebarTab = 'reading' | 'ask';

function readStoredSidebarWidth(): number {
  try {
    const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(raw) && raw > 0) {
      return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, raw));
    }
  } catch {
    /* ignore */
  }
  return SIDEBAR_DEFAULT_WIDTH;
}

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
  const [askDraft, setAskDraft] = useState<{ question: string; key: number } | null>(null);

  // ── Landing gate: show Onboarding until the user explicitly enters ──
  // Init from URL first (?v=1), fall back to localStorage.
  const [entered, setEnteredRaw] = useState<boolean>(() => {
    try {
      const urlSnap = parseUrl(window.location.search);
      if (urlSnap.entered) return true;
      return localStorage.getItem(LH_ENTERED_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Sync entered to localStorage whenever it changes.
  const setEntered = useCallback((v: boolean) => {
    setEnteredRaw(v);
    try {
      if (v) {
        localStorage.setItem(LH_ENTERED_KEY, '1');
      } else {
        localStorage.removeItem(LH_ENTERED_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleEnter = useCallback(() => {
    setEntered(true);
  }, [setEntered]);
  // Clicking the Lighthouse logo in the top-bar returns to landing.
  const handleReturnToLanding = useCallback(() => {
    setEntered(false);
  }, [setEntered]);

  // Tracks whether we should auto-open the GeneratePanel after entering.
  const [pendingGenerate, setPendingGenerate] = useState(false);

  // ── View switcher ──────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<ViewId>(() => {
    try {
      const snap = parseUrl(window.location.search);
      return snap.tab ?? 'architecture';
    } catch {
      return 'architecture';
    }
  });

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

  // Open wiki on mount if URL has wiki=1&node=<id>
  // We use a ref to guard so StrictMode double-invoke is harmless.
  const wikiInitDoneRef = useRef(false);
  useEffect(() => {
    if (wikiInitDoneRef.current) return;
    wikiInitDoneRef.current = true;
    try {
      const snap = parseUrl(window.location.search);
      if (snap.wikiOpen && snap.nodeId) {
        wikiStack.open(snap.nodeId);
        // mark onboarded so first-load hints don't appear
        try { localStorage.setItem(WIKI_ONBOARD_KEY, 'true'); } catch { /* */ }
        setWikiOnboarded(true);
      }
    } catch {
      /* ignore */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // ── Cross-view state seams (preserved from prior phases) ────────────
  // selectedNodeId: the node the user clicked. The reading panel reads this
  //   to highlight/scroll the related section; views reflect it.
  // highlightedNodeIds: the set views light up. Driven by panel section
  //   clicks AND by "ask the map" LLM answers.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => {
    try {
      const snap = parseUrl(window.location.search);
      return snap.wikiOpen ? null : (snap.nodeId ?? null);
    } catch {
      return null;
    }
  });
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

  // App-level generate flow, exposed to the landing (Onboarding) so the full
  // "generate for another repo" experience can live on Home. The in-app
  // GeneratePanel keeps its own independent instance for the top bar.
  const homeGenerate = useGenerate(handleGenerateDone);
  // Stable wrapper matching the documented Onboarding contract: persist the
  // chosen settings, then kick off generation.
  const handleHomeGenerate = useCallback(
    (repoPath: string, model: GenerateModel) => {
      handleGenerateSettingsChange({ repoPath, model });
      void homeGenerate.generate({ repoPath, model });
    },
    [handleGenerateSettingsChange, homeGenerate],
  );

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

  // ── Right sidebar: tabbed (reading ⇆ ask) + resizable ───────────────
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('reading');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(readStoredSidebarWidth);
  const draggingRef = useRef(false);

  // Persist the chosen width whenever it settles.
  const persistSidebarWidth = useCallback((w: number) => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(w)));
    } catch {
      /* ignore */
    }
  }, []);

  // Drag-to-resize via the handle on the sidebar's LEFT edge. Dragging left
  // (smaller clientX) widens the panel; clamped to min/max.
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const next = Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - ev.clientX),
        );
        setSidebarWidth(next);
      };

      const onUp = () => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setSidebarWidth((w) => {
          persistSidebarWidth(w);
          return w;
        });
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [persistSidebarWidth],
  );

  // Open the sidebar on the Ask tab from the top-bar control.
  const handleOpenAsk = useCallback(() => {
    setSidebarOpen(true);
    setSidebarTab('ask');
  }, []);

  const handleAskContext = useCallback((question: string) => {
    setAskDraft({ question, key: Date.now() });
    setSidebarOpen(true);
    setSidebarTab('ask');
  }, []);

  // Answers should surface the conversation: switch the sidebar to Ask.
  const handleAskAnswerWithFocus = useCallback(
    (ids: Set<string>) => {
      handleAskAnswer(ids);
      setSidebarOpen(true);
      setSidebarTab('ask');
    },
    [handleAskAnswer],
  );

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

  // ── Deep-link URL sync ──────────────────────────────────────────────
  const { copyLink: copyLinkFn } = useUrlState({
    entered,
    activeView,
    selectedNodeId,
    wikiCurrentId: wikiStack.currentId,
    wikiOpen: wikiStack.currentId !== null,
    setEntered,
    setActiveView,
    setSelectedNodeId,
    openWiki: (id) => {
      wikiStack.open(id);
      markWikiOnboarded();
    },
    closeWiki: wikiStack.close,
  });

  // "Copy link" button state — brief flash of "Copied!" feedback
  const [copied, setCopied] = useState(false);
  const handleCopyLink = useCallback(() => {
    copyLinkFn();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [copyLinkFn]);

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
    // Build the generate-on-home contract (strongly typed) and hand it to
    // Onboarding alongside its existing props. We merge via a typed cast: App
    // owns this wiring; the Home agent owns OnboardingProps and will declare
    // these fields there. See OnboardingGenerateContract above for the spec.
    const generateContract: OnboardingGenerateContract = {
      onGenerateRepo: handleHomeGenerate,
      generateStatus: homeGenerate.status,
      generateStage: homeGenerate.stage,
      generateElapsedLabel: homeGenerate.elapsedLabel,
      generateError: homeGenerate.error,
      generateEvents: homeGenerate.events,
      onCancelGenerate: homeGenerate.cancel,
      models: GENERATE_MODEL_OPTIONS,
      defaultRepoPath: queryRepoPath,
      defaultModel: queryModel,
    };
    const onboardingProps = {
      data,
      onEnter: handleEnter,
      onGenerate: () => {
        setPendingGenerate(true);
        handleEnter();
      },
      ...generateContract,
    };
    return <Onboarding {...(onboardingProps as React.ComponentProps<typeof Onboarding>)} />;
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
    onAskContext: handleAskContext,
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

        {/* Ask trigger — opens the conversational panel docked on the right.
            The ask experience now lives in that thread (see sidebar below). */}
        <div className="ml-auto flex min-w-0 flex-1 justify-end">
          <button
            onClick={handleOpenAsk}
            title="Ask the map"
            className={[
              'inline-flex h-9 items-center gap-2 rounded-ph border px-4 font-sans text-sm font-semibold transition-colors duration-75',
              sidebarOpen && sidebarTab === 'ask'
                ? 'border-ph-yellow-pressed bg-ph-yellow text-ph-ink'
                : 'border-ph-border bg-ph-canvas text-ph-mute hover:border-ph-yellow hover:text-ph-ink',
            ].join(' ')}
          >
            <span aria-hidden>💬</span>
            <span>Ask the map</span>
          </button>
        </div>

        <span className="hidden h-5 w-px bg-ph-border lg:block" />
        <div className="hidden shrink-0 items-center gap-3 font-mono text-code text-ph-mute lg:flex">
          <Stat n={data.clusters.length} label="clusters" />
          <Stat n={stats.modules} label="modules" />
          <Stat n={stats.files} label={stats.fileLabel} />
          {/* Copy-link affordance */}
          <button
            onClick={handleCopyLink}
            title="Copy shareable link to current view"
            className="inline-flex h-7 items-center gap-1.5 rounded-ph-sm border border-ph-border bg-ph-surface px-2.5 font-sans text-xs text-ph-mute transition-colors duration-75 hover:border-ph-border-dark hover:text-ph-ink"
          >
            {copied ? (
              <>
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-ph-green" aria-hidden>
                  <path d="M2 7l3.5 3.5L12 3" />
                </svg>
                <span className="text-ph-green">Copied!</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden>
                  <path d="M5 4H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2" />
                  <rect x="5" y="2" width="7" height="7" rx="1" />
                </svg>
                <span>Copy link</span>
              </>
            )}
          </button>
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
      {/* overflow-hidden here is load-bearing: it clips any overflow from the
          view/panel so a deep scrollIntoView/focus can't bubble up and scroll
          the shell (which would push the header + tab bar off-screen). */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="relative min-w-0 flex-1 overflow-hidden">
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

        {/* ── Right sidebar — resizable, tabbed (Reading ⇆ Ask) ───────────
            Reading panel + the conversational Ask thread coexist as tabs in a
            single docked panel. A drag handle on the LEFT edge resizes it
            (clamped, persisted to localStorage). When collapsed, a thin rail
            lets the user re-open it. */}
        {sidebarOpen ? (
          <div
            className="relative hidden min-h-0 shrink-0 overflow-hidden border-l border-ph-border bg-ph-surface lg:flex lg:flex-col"
            style={{ width: sidebarWidth }}
          >
            {/* Drag handle on the left edge */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panel"
              onMouseDown={handleResizeStart}
              className="group absolute -left-1 top-0 z-20 h-full w-2 cursor-col-resize"
            >
              <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-ph-yellow" />
            </div>

            {/* Tab strip + collapse */}
            <div className="flex shrink-0 items-center gap-1 border-b border-ph-border px-2 py-1.5">
              <SidebarTabButton
                active={sidebarTab === 'reading'}
                onClick={() => setSidebarTab('reading')}
                label="Reading"
              />
              <SidebarTabButton
                active={sidebarTab === 'ask'}
                onClick={() => setSidebarTab('ask')}
                label="Ask"
              />
              <button
                onClick={() => setSidebarOpen(false)}
                title="Collapse panel"
                aria-label="Collapse panel"
                className="ml-auto rounded-ph-sm px-2 py-1 font-sans text-label text-ph-ash transition-colors hover:text-ph-ink"
              >
                ⟩
              </button>
            </div>

            {/* Tab bodies — keep both mounted so the Ask thread keeps its
                history when switching to Reading and back. */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <div className={sidebarTab === 'reading' ? 'h-full overflow-hidden' : 'hidden'}>
                <ReadingPanel
                  data={data}
                  selectedNodeId={selectedNodeId}
                  activeSectionId={activeSectionId}
                  onActivateSection={handleActivateSection}
                  onHighlightNodes={handleHighlightNodes}
                  onOpenWiki={openWiki}
                />
              </div>
              <div className={sidebarTab === 'ask' ? 'h-full overflow-hidden' : 'hidden'}>
                <AskBox
                  data={data}
                  repoPath={queryRepoPath}
                  model={queryModel}
                  onAnswer={handleAskAnswerWithFocus}
                  onClear={handleAskClear}
                  initialQuestion={askDraft?.question}
                  initialQuestionKey={askDraft?.key}
                />
              </div>
            </div>
          </div>
        ) : (
          // Collapsed rail — click to re-open.
          <button
            onClick={() => setSidebarOpen(true)}
            title="Open panel"
            aria-label="Open panel"
            className="hidden w-8 shrink-0 items-start justify-center border-l border-ph-border bg-ph-surface py-3 text-ph-ash transition-colors hover:text-ph-ink lg:flex"
          >
            ⟨
          </button>
        )}
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

function SidebarTabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={[
        'rounded-ph-sm px-3 py-1.5 font-sans text-heading-sm transition-colors',
        active
          ? 'bg-ph-surface-soft font-semibold text-ph-ink'
          : 'text-ph-mute hover:text-ph-ink',
      ].join(' ')}
    >
      {label}
    </button>
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
