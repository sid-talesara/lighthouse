/**
 * Onboarding / landing screen — PostHog-style "desktop" home.
 *
 * Design: cream textured canvas, chunky flat bordered cards, yellow accents,
 * Nunito + IBM Plex Mono. A grid of labeled "app-icon" cards communicates
 * every consumption mode at a glance (PostHog homepage style). The full
 * Generate-for-another-repo flow lives inline on this screen.
 *
 * Props contract:
 *  - OnboardingProps (original: data, onEnter, onGenerate)
 *  - OnboardingGenerateContract (new: all generate-flow props from App.tsx)
 *
 * App.tsx spreads both onto this component. We declare all fields here so
 * TypeScript is satisfied without touching App.tsx.
 *
 * Gate logic lives in App.tsx (localStorage `lh_entered`).
 */

import { useState } from 'react';
import type { LighthouseData } from '../types/lighthouse';
import type { GenerateModel, GenerateModelOption } from '../lib/generateOptions';
import type { GenerateStatus, GenerateEventLogEntry } from '../hooks/useGenerate';
import { LighthouseIllustration } from './LighthouseIllustration';
import { DesktopIcon } from './DesktopIcon';
import { HomeGenerateFlow } from './HomeGenerateFlow';

/* ── Props ───────────────────────────────────────────────────────────────── */

interface OnboardingProps {
  /** Currently loaded data (may be null if still loading). */
  data: LighthouseData | null;
  /** Enters the app at its default view. */
  onEnter: () => void;
  /** Legacy escape hatch — opens GeneratePanel in-app (kept for compatibility). */
  onGenerate: () => void;

  /* ── OnboardingGenerateContract (from App.tsx) ─────────────────────── */
  onGenerateRepo?: (repoPath: string, model: GenerateModel) => void;
  generateStatus?: GenerateStatus;
  generateStage?: string;
  generateElapsedLabel?: string;
  generateError?: string | null;
  generateEvents?: GenerateEventLogEntry[];
  onCancelGenerate?: () => void;
  models?: GenerateModelOption[];
  defaultRepoPath?: string;
  defaultModel?: GenerateModel;
}

/* ── Consumption-mode icon definitions ──────────────────────────────────── */

type ModeId =
  | 'architecture'
  | 'wiki'
  | 'changes'
  | 'database'
  | 'services'
  | 'functions'
  | 'files'
  | 'ask';

interface ModeCard {
  id: ModeId;
  label: string;
  teaser: string;
  glyph: React.ReactNode;
}

const MODES: ModeCard[] = [
  {
    id: 'architecture',
    label: 'Architecture map',
    teaser: 'Zoomable cluster map — every module & dependency at a glance.',
    glyph: <MapGlyph />,
  },
  {
    id: 'wiki',
    label: 'Wiki',
    teaser: 'Auto-generated prose docs for every cluster and module.',
    glyph: <WikiGlyph />,
  },
  {
    id: 'changes',
    label: 'Changes & PRs',
    teaser: 'See exactly what a PR touches and why it matters.',
    glyph: <ChangesGlyph />,
  },
  {
    id: 'database',
    label: 'Database',
    teaser: 'Schema, tables, and ER diagram — all in the open.',
    glyph: <DbGlyph />,
  },
  {
    id: 'services',
    label: 'Services',
    teaser: 'Service call graph and runtime topology.',
    glyph: <ServicesGlyph />,
  },
  {
    id: 'functions',
    label: 'Functions',
    teaser: 'Every function, its callers, and its blast radius.',
    glyph: <FunctionsGlyph />,
  },
  {
    id: 'files',
    label: 'Files (IDE)',
    teaser: 'Browse, read, and search source with full context.',
    glyph: <FilesGlyph />,
  },
  {
    id: 'ask',
    label: 'Ask anything',
    teaser: 'Type a question; the map lights up the answer.',
    glyph: <AskGlyph />,
  },
];

/* ── Component ───────────────────────────────────────────────────────────── */

export function Onboarding({
  data,
  onEnter,
  onGenerate,
  onGenerateRepo,
  generateStatus = 'idle',
  generateStage = 'Ready',
  generateElapsedLabel = '0:00',
  generateError = null,
  generateEvents = [],
  onCancelGenerate,
  models = [],
  defaultRepoPath = '',
  defaultModel = 'gpt-5.5',
}: OnboardingProps) {
  const repoName = data?.repo?.name ?? null;
  const description = data?.repo?.description ?? null;
  const clusterCount = data?.clusters?.length ?? null;
  const nodeCount = data?.nodes?.length ?? null;

  // Whether the generate section is expanded (shown inline on home).
  const [showGenerate, setShowGenerate] = useState(
    !repoName || generateStatus === 'running',
  );

  // If contract props are available, we show the inline flow.
  // Otherwise fall back to the old onGenerate() escape hatch.
  const hasGenerateContract = !!onGenerateRepo && !!onCancelGenerate && models.length > 0;

  const handleModeClick = () => {
    // All mode clicks just enter the app.
    onEnter();
  };

  return (
    <div
      className="relative flex h-screen flex-col items-center overflow-y-auto px-4 py-12"
      style={{
        fontFamily: '"Nunito", system-ui, sans-serif',
        backgroundColor: '#EEEFE9',
      }}
    >
      {/* ── Background layers ─────────────────────────────────────────── */}
      <GrainTexture />
      <BeamMotif />

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="relative z-10 flex w-full max-w-[720px] flex-col items-center gap-10">

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <header className="flex flex-col items-center gap-4 text-center">
          {/* Illustration */}
          <div style={{ width: 160, height: 132 }}>
            <LighthouseIllustration className="h-full w-full" />
          </div>

          {/* Wordmark */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-ph border border-ph-border bg-ph-surface">
              <LighthouseGlyph className="h-4 w-4 text-ph-yellow" />
            </div>
            <span
              className="font-display font-extrabold tracking-tight text-ph-ink"
              style={{ fontSize: '1.125rem', letterSpacing: '-0.01em' }}
            >
              Lighthouse
            </span>
          </div>

          {/* Headline */}
          <h1
            className="font-display font-extrabold text-ph-ink"
            style={{
              fontSize: 'clamp(1.875rem, 5vw, 2.75rem)',
              lineHeight: '1.12',
              letterSpacing: '-0.03em',
              maxWidth: '560px',
            }}
          >
            Learn any codebase.
            <br />
            <span style={{ color: '#F7A501' }}>In any form you need.</span>
          </h1>

          {/* Subhead */}
          <p
            className="text-ph-body"
            style={{ fontSize: '1rem', lineHeight: '1.6', maxWidth: '440px' }}
          >
            Architecture maps, wikis, PR reviews, DB schemas, service graphs,
            IDE-style file browsing, and a codebase AI you can ask anything.{' '}
            <span className="text-ph-mute" style={{ fontSize: '0.9rem' }}>
              Eight modes. One codebase. Instant.
            </span>
          </p>
        </header>

        {/* ── Consumption-mode desktop grid ─────────────────────────────── */}
        <section className="w-full">
          <SectionLabel>Eight ways to understand a codebase</SectionLabel>

          <div
            className="mt-3 grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
          >
            {MODES.map((mode) => (
              <DesktopIcon
                key={mode.id}
                glyph={mode.glyph}
                label={mode.label}
                teaser={mode.teaser}
                onClick={handleModeClick}
                muted={!repoName}
              />
            ))}
          </div>

          {!repoName && (
            <p
              className="mt-2 font-mono text-ph-ash"
              style={{ fontSize: '0.6875rem' }}
            >
              Generate or load a repo to unlock all modes.
            </p>
          )}
        </section>

        {/* ── Primary card: Explore loaded repo ─────────────────────────── */}
        {repoName && (
          <section className="w-full">
            <SectionLabel>Ready to explore</SectionLabel>
            <RepoCard
              repoName={repoName}
              description={description}
              clusterCount={clusterCount}
              nodeCount={nodeCount}
              onEnter={onEnter}
            />
          </section>
        )}

        {/* ── Generate flow ──────────────────────────────────────────────── */}
        <section className="w-full">
          {/* Toggle header — show/hide the generate form */}
          {repoName && !showGenerate ? (
            <button
              onClick={() => setShowGenerate(true)}
              className="mb-3 inline-flex items-center gap-1.5 rounded-ph border border-ph-border bg-ph-surface px-4 font-sans font-semibold text-ph-body transition-colors duration-75 hover:bg-ph-surface-soft active:translate-y-px"
              style={{ height: '36px', fontSize: '0.8125rem' }}
            >
              <span style={{ fontSize: '0.875rem' }}>＋</span>
              Generate for another repo
            </button>
          ) : (
            <>
              {repoName && (
                <div className="mb-3 flex items-center justify-between">
                  <SectionLabel>Generate a new map</SectionLabel>
                  <button
                    onClick={() => setShowGenerate(false)}
                    className="font-mono text-ph-ash transition-colors hover:text-ph-ink"
                    style={{ fontSize: '0.75rem' }}
                    aria-label="Collapse generate panel"
                  >
                    ✕
                  </button>
                </div>
              )}

              {!repoName && <SectionLabel>Get started — generate a map</SectionLabel>}

              {hasGenerateContract ? (
                <HomeGenerateFlow
                  onGenerateRepo={onGenerateRepo!}
                  generateStatus={generateStatus}
                  generateStage={generateStage}
                  generateElapsedLabel={generateElapsedLabel}
                  generateError={generateError}
                  generateEvents={generateEvents}
                  onCancelGenerate={onCancelGenerate!}
                  models={models}
                  defaultRepoPath={defaultRepoPath}
                  defaultModel={defaultModel}
                  onEnter={onEnter}
                />
              ) : (
                <EmptyCard onGenerate={onGenerate} />
              )}
            </>
          )}
        </section>

        {/* ── Footer hint ───────────────────────────────────────────────── */}
        <p
          className="font-mono text-ph-stone"
          style={{ fontSize: '0.6875rem', letterSpacing: '0.04em' }}
        >
          ← clusters &nbsp; nodes → &nbsp; click to read &nbsp; ask anything ↓
        </p>

      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-mono font-semibold uppercase tracking-widest text-ph-ash"
      style={{ fontSize: '0.6875rem', letterSpacing: '0.1em' }}
    >
      {children}
    </div>
  );
}

function RepoCard({
  repoName,
  description,
  clusterCount,
  nodeCount,
  onEnter,
}: {
  repoName: string;
  description: string | null;
  clusterCount: number | null;
  nodeCount: number | null;
  onEnter: () => void;
}) {
  return (
    <div
      className="mt-3 w-full rounded-ph border border-ph-border bg-ph-surface"
      style={{ padding: '24px 28px' }}
    >
      {/* Repo identity */}
      <div className="mb-1 flex items-center gap-2.5">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: '#2C8C66', flexShrink: 0 }}
          title="Data loaded"
        />
        <span
          className="rounded-ph-sm bg-ph-surface-soft px-2.5 py-1 font-mono font-semibold text-ph-ink"
          style={{ fontSize: '0.875rem' }}
        >
          {repoName}
        </span>
      </div>

      {description && (
        <p
          className="mb-4 mt-2 text-ph-mute"
          style={{ fontSize: '0.8125rem', lineHeight: '1.55' }}
        >
          {description.length > 130 ? description.slice(0, 127) + '…' : description}
        </p>
      )}

      {(clusterCount !== null || nodeCount !== null) && (
        <div
          className="mb-5 flex gap-4 rounded-ph border border-ph-border-soft bg-ph-canvas px-3 py-2 font-mono"
          style={{ fontSize: '0.8125rem' }}
        >
          {clusterCount !== null && (
            <span>
              <span className="font-bold text-ph-ink">{clusterCount}</span>{' '}
              <span className="text-ph-ash">clusters</span>
            </span>
          )}
          {nodeCount !== null && (
            <span>
              <span className="font-bold text-ph-ink">{nodeCount}</span>{' '}
              <span className="text-ph-ash">modules</span>
            </span>
          )}
          {clusterCount !== null && nodeCount !== null && (
            <span className="ml-auto text-ph-stone" style={{ fontSize: '0.75rem' }}>
              indexed ✓
            </span>
          )}
        </div>
      )}

      <button
        onClick={onEnter}
        className="inline-flex w-full items-center justify-center gap-2 rounded-ph border border-ph-yellow-pressed bg-ph-yellow font-sans font-bold text-ph-ink transition-colors duration-75 hover:bg-ph-yellow-pressed active:translate-y-px"
        style={{ height: '44px', fontSize: '0.9375rem' }}
      >
        Explore {repoName}
        <span aria-hidden style={{ fontSize: '1rem' }}>→</span>
      </button>
    </div>
  );
}

function EmptyCard({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div
      className="mt-3 w-full rounded-ph border border-ph-border bg-ph-surface"
      style={{ padding: '24px 28px' }}
    >
      <p className="mb-2 font-sans font-semibold text-ph-ink" style={{ fontSize: '0.9375rem' }}>
        Point Lighthouse at a repo. Get a map.
      </p>
      <p className="mb-5 text-ph-mute" style={{ fontSize: '0.8125rem', lineHeight: '1.55' }}>
        It reads the structure, clusters by feature area, indexes every file,
        and lets you ask questions about what any of it does.
        No setup. No config. Just answers.
      </p>
      <button
        onClick={onGenerate}
        className="inline-flex w-full items-center justify-center gap-2 rounded-ph border border-ph-yellow-pressed bg-ph-yellow font-sans font-bold text-ph-ink transition-colors duration-75 hover:bg-ph-yellow-pressed active:translate-y-px"
        style={{ height: '44px', fontSize: '0.9375rem' }}
      >
        Generate a map →
      </button>
    </div>
  );
}

/* ── Background decorations ──────────────────────────────────────────────── */

function GrainTexture() {
  return (
    <svg
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: 0.035,
        zIndex: 1,
      }}
    >
      <filter id="lh-grain">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.72"
          numOctaves="4"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#lh-grain)" />
    </svg>
  );
}

function BeamMotif() {
  return (
    <svg
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: '55%',
        maxWidth: 480,
        height: '60%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
      viewBox="0 0 480 320"
      preserveAspectRatio="xMaxYMin meet"
      fill="none"
    >
      <polygon points="480,0 480,320 220,160" fill="#F7A501" opacity="0.04" />
      <polygon points="480,0 480,260 260,110" fill="#F7A501" opacity="0.05" />
      <polygon points="480,0 480,200 300,70"  fill="#F7A501" opacity="0.06" />
      {Array.from({ length: 28 }, (_, i) => (
        <circle
          key={i}
          cx={10 + i * 16}
          cy={310 - (i % 3) * 6}
          r="2"
          fill="#BFC1B7"
          opacity="0.5"
        />
      ))}
    </svg>
  );
}

/** Inline lighthouse SVG glyph. */
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
      <path d="M9 9 L8 21 H16 L15 9 Z" />
      <path d="M9 9 H15" />
      <rect x="9.5" y="5" width="5" height="4" rx="0.5" />
      <path d="M14.5 7 L19 5.5 M14.5 7 L19 8.5" />
      <path d="M9.5 7 L5 5.5 M9.5 7 L5 8.5" />
      <path d="M12 5 V3" />
    </svg>
  );
}

/* ── Mode glyphs (flat SVGs, 16×16 viewBox) ─────────────────────────────── */

function MapGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4 text-ph-yellow" aria-hidden>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 2v2M8 12v2M2 8h2M12 8h2" />
    </svg>
  );
}

function WikiGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4 text-ph-body" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M5 5h6M5 8h6M5 11h4" />
    </svg>
  );
}

function ChangesGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4 text-ph-body" aria-hidden>
      <path d="M3 4h10M3 8h7M3 12h5" />
      <circle cx="12.5" cy="11.5" r="2.5" />
      <path d="M11.5 11.5h2M12.5 10.5v2" />
    </svg>
  );
}

function DbGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4 text-ph-body" aria-hidden>
      <ellipse cx="8" cy="4.5" rx="5" ry="2" />
      <path d="M3 4.5v7c0 1.1 2.24 2 5 2s5-.9 5-2v-7" />
      <path d="M3 8.5c0 1.1 2.24 2 5 2s5-.9 5-2" />
    </svg>
  );
}

function ServicesGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4 text-ph-body" aria-hidden>
      <circle cx="3.5" cy="8" r="1.5" />
      <circle cx="12.5" cy="4" r="1.5" />
      <circle cx="12.5" cy="12" r="1.5" />
      <path d="M5 8l6-4M5 8l6 4" />
    </svg>
  );
}

function FunctionsGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4 text-ph-body" aria-hidden>
      <path d="M4 3C4 3 3 4 3 8s1 5 1 5" />
      <path d="M12 3C12 3 13 4 13 8s-1 5-1 5" />
      <path d="M6 8h4M8 6v4" />
    </svg>
  );
}

function FilesGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4 text-ph-body" aria-hidden>
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3" />
      <path d="M6 7h4M6 9.5h4M6 12h2.5" />
    </svg>
  );
}

function AskGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round"
      className="h-4 w-4 text-ph-body" aria-hidden>
      <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H9l-3 3v-3H3a1 1 0 01-1-1z" />
      <path d="M7.5 5a.75.75 0 01.75-.75.75.75 0 01.75.75c0 .5-.5.75-.75 1v.75" />
      <circle cx="8.25" cy="8.5" r=".35" fill="currentColor" />
    </svg>
  );
}
