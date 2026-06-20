import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadData } from './lib/loadData';
import type { LighthouseData } from './types/lighthouse';
import { MapCanvas } from './components/MapCanvas';
import { ReadingPanel } from './components/ReadingPanel';
import { AskBox } from './components/AskBox';
import { GeneratePanel } from './components/GeneratePanel';

export default function App() {
  const [data, setData] = useState<LighthouseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ── Phase 2/3 seams ────────────────────────────────────────────────
  // selectedNodeId: the node the user clicked (Phase 2 reading panel reads
  //   this to scroll/highlight the related section; the map highlights it).
  // highlightedNodeIds: the set the map lights up (Phase 3 "ask the map"
  //   will set this from the LLM's highlight_ids; Phase 2 node⇄section
  //   linking will also drive it). Currently derived from the selection so
  //   the highlight machinery is live and demonstrable.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  // Phase 2: active section in the reading panel (set by user click in panel).
  // Phase 3 "ask the map" can set highlightedNodeIds directly without touching
  // activeSectionId — the seam is already separate.
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
    // Selecting a node via the map clears any panel-driven highlight so the
    // two directions don't fight. Phase 3 will write highlightedNodeIds
    // directly from the LLM response without touching selectedNodeId.
    setActiveSectionId(null);
    setHighlightedNodeIds(id ? new Set([id]) : new Set());
  }, []);

  // Called by ReadingPanel when user clicks a section (Section → Nodes direction).
  const handleActivateSection = useCallback((sectionId: string | null) => {
    setActiveSectionId(sectionId);
    // Clicking a section in the panel clears the map node selection so the
    // map shows the section's multi-node highlight cleanly.
    if (sectionId !== null) {
      setSelectedNodeId(null);
    }
  }, []);

  // Called by ReadingPanel to push a set of node ids to the map highlight.
  // Phase 3 can call this same setter directly from the ask-the-map response.
  const handleHighlightNodes = useCallback((ids: Set<string>) => {
    setHighlightedNodeIds(ids);
  }, []);

  // Phase 3: AskBox callbacks.
  const handleAskAnswer = useCallback((ids: Set<string>) => {
    setHighlightedNodeIds(ids);
    // Clear any map node selection so ask result takes full stage.
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
    const changed = data.nodes.filter((n) => n.changed_recently).length;
    return { modules, files, changed };
  }, [data]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-abyss-900 p-8">
        <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
          <div className="font-display text-lg text-red-300">Couldn't load the map</div>
          <p className="mt-1 text-sm text-slate2-300">
            <span className="font-mono text-xs">public/data.json</span> failed to load.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-abyss-800 p-3 font-mono text-xs text-red-300/90">
            {error}
          </pre>
        </div>
      </div>
    );
  }

  if (!data || !stats) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-abyss-900">
        <div className="relative h-10 w-10">
          <span className="absolute inset-0 animate-beaconPulse rounded-full border border-beacon-500/40" />
          <span className="absolute inset-2 rounded-full bg-beacon-500/80 shadow-[0_0_20px_4px_rgba(242,185,104,0.5)]" />
        </div>
        <div className="font-display text-sm tracking-wide text-slate2-300">
          Charting the system…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-abyss-900 text-slate2-200">
      {/* Header */}
      <header className="z-10 flex shrink-0 items-center gap-4 border-b border-slate2-400/12 bg-abyss-800/60 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <BeaconMark />
          <span className="font-display text-[19px] font-semibold tracking-tight text-slate2-100">
            Lighthouse
          </span>
        </div>
        <span className="hidden h-4 w-px bg-slate2-400/20 sm:block" />
        <div className="hidden min-w-0 flex-col sm:flex">
          <span className="truncate font-mono text-[13px] text-slate2-200">{data.repo.name}</span>
          <span className="truncate text-[11px] text-slate2-400">{data.repo.description}</span>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-3 font-mono text-[11px] text-slate2-400">
          <div className="hidden items-center gap-3 sm:flex">
            <Stat n={data.clusters.length} label="clusters" />
            <Stat n={stats.modules} label="modules" />
            <Stat n={stats.files} label="files" />
            {stats.changed > 0 && <Stat n={stats.changed} label="changed" accent />}
          </div>
          <GeneratePanel onDone={handleGenerateDone} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar — cluster index */}
        <aside className="lh-scroll hidden w-60 shrink-0 overflow-y-auto border-r border-slate2-400/12 bg-abyss-800/40 md:block">
          <div className="px-5 pb-2 pt-5 font-mono text-[10px] uppercase tracking-[0.24em] text-slate2-400/70">
            Capability clusters
          </div>
          {data.clusters.map((c) => {
            const isActive = selectedNodeId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => handleSelect(isActive ? null : c.id)}
                className={[
                  'block w-full border-l-2 px-5 py-3 text-left transition-colors',
                  isActive
                    ? 'border-beacon-500 bg-beacon-500/[0.06]'
                    : 'border-transparent hover:border-tide-500/60 hover:bg-abyss-700/40',
                ].join(' ')}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      'h-1.5 w-1.5 rounded-full',
                      isActive ? 'bg-beacon-400' : 'bg-tide-500/80',
                    ].join(' ')}
                  />
                  <span className="font-sans text-[13.5px] font-medium text-slate2-100">
                    {c.label}
                  </span>
                </div>
                <p className="mt-1 pl-3.5 text-[11.5px] leading-snug text-slate2-400 line-clamp-2">
                  {c.summary}
                </p>
                <div className="mt-1 pl-3.5 font-mono text-[10px] text-tide-400/70">
                  {c.modules.length} module{c.modules.length !== 1 ? 's' : ''}
                </div>
              </button>
            );
          })}
        </aside>

        {/* Map — hero, takes ~60% of remaining width */}
        <main className="relative min-w-0 flex-[6]">
          <MapCanvas
            data={data}
            selectedNodeId={selectedNodeId}
            highlightedNodeIds={highlightedNodeIds}
            onSelectNode={handleSelect}
          />
          <Legend />
          {/* Phase 3: Ask-the-Map — floats at bottom-center of the map */}
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 flex w-full -translate-x-1/2 flex-col items-center gap-2 px-4">
            <AskBox
              data={data}
              onAnswer={handleAskAnswer}
              onClear={handleAskClear}
            />
          </div>
        </main>

        {/* Reading panel — right column, ~40% of remaining width */}
        <div className="hidden min-h-0 w-[400px] shrink-0 border-l border-slate2-400/12 lg:flex lg:flex-col">
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

function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={accent ? 'text-beacon-400' : 'text-slate2-200'}>{n}</span>
      <span className="text-slate2-400/70">{label}</span>
    </span>
  );
}

function BeaconMark() {
  return (
    <span className="relative flex h-6 w-6 items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-beacon-500/15" />
      <span className="h-2.5 w-2.5 rounded-full bg-beacon-500 shadow-[0_0_12px_3px_rgba(242,185,104,0.6)]" />
    </span>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 animate-riseIn rounded-xl border border-slate2-400/12 bg-abyss-800/70 px-4 py-3 font-mono text-[10px] text-slate2-400 backdrop-blur-md">
      <div className="mb-1.5 uppercase tracking-[0.2em] text-slate2-400/60">Legend</div>
      <div className="flex flex-col gap-1">
        <Row dot="bg-tide-500" text="cluster / module" />
        <Row dot="bg-beacon-400" text="selected · highlighted" />
        <div className="mt-0.5 text-slate2-400/70">click a node to zoom in →</div>
      </div>
    </div>
  );
}

function Row({ dot, text }: { dot: string; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span>{text}</span>
    </div>
  );
}
