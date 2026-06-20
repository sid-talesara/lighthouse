/**
 * Onboarding / landing screen — shown before the main app.
 *
 * Design: PostHog-inspired (cream canvas, flat white cards, yellow CTA,
 * Nunito + IBM Plex Mono, no shadows). Inspired by DeepWiki's repo-picker
 * landing — confident hero with a primary "Explore <repo>" card and a
 * secondary "generate for another repo" affordance.
 *
 * Gate logic lives in App.tsx (localStorage `lh_entered`).
 */

import type { LighthouseData } from '../types/lighthouse';

interface OnboardingProps {
  /** Currently loaded data (may be null if still loading). */
  data: LighthouseData | null;
  /** Called when the user clicks "Explore <repo>" — enters the app. */
  onEnter: () => void;
  /** Called when the user wants the Generate flow instead. */
  onGenerate: () => void;
}

const FEATURES: { icon: string; label: string; detail: string }[] = [
  {
    icon: '🗺️',
    label: 'Zoomable map',
    detail: 'Every cluster, module, and file — navigable in one canvas.',
  },
  {
    icon: '💬',
    label: 'Ask anything',
    detail: 'Type a question; the map lights up the answer.',
  },
  {
    icon: '⚡',
    label: 'Change review',
    detail: 'See exactly what a PR touches and why it matters.',
  },
  {
    icon: '🗄️',
    label: 'DB & functions',
    detail: 'Schema, tables, and service calls — all in the open.',
  },
];

export function Onboarding({ data, onEnter, onGenerate }: OnboardingProps) {
  const repoName = data?.repo?.name ?? null;
  const description = data?.repo?.description ?? null;
  const clusterCount = data?.clusters?.length ?? null;
  const nodeCount = data?.nodes?.length ?? null;

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-ph-canvas px-4 py-12"
      style={{ fontFamily: '"Nunito", system-ui, sans-serif' }}
    >
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="mb-10 flex flex-col items-center gap-3 text-center">
        {/* Lighthouse mark */}
        <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-ph border border-ph-border bg-ph-surface">
          <LighthouseGlyph className="h-9 w-9 text-ph-yellow" />
        </div>

        <h1
          className="font-display font-extrabold text-ph-ink"
          style={{ fontSize: '2rem', lineHeight: '1.2', letterSpacing: '-0.02em' }}
        >
          Lighthouse
        </h1>

        <p
          className="max-w-[440px] text-ph-body"
          style={{ fontSize: '1.0625rem', lineHeight: '1.55' }}
        >
          Understand any codebase in minutes — not weeks.
          <br />
          <span className="text-ph-mute" style={{ fontSize: '0.9375rem' }}>
            A living, interactive map of structure, dependencies, and meaning.
          </span>
        </p>
      </div>

      {/* ── Primary card: Explore loaded repo ───────────────────── */}
      {repoName ? (
        <div
          className="mb-4 w-full max-w-[460px] rounded-ph border border-ph-border bg-ph-surface"
          style={{ padding: '24px 28px' }}
        >
          {/* Breadcrumb label */}
          <div
            className="mb-3 font-sans font-semibold uppercase tracking-widest text-ph-ash"
            style={{ fontSize: '0.7rem', letterSpacing: '0.08em' }}
          >
            Ready to explore
          </div>

          {/* Repo identity */}
          <div className="mb-1 flex items-center gap-2">
            <span
              className="rounded-ph-sm bg-ph-surface-soft px-2 py-0.5 font-mono text-ph-body"
              style={{ fontSize: '0.875rem' }}
            >
              {repoName}
            </span>
          </div>

          {description && (
            <p
              className="mb-4 text-ph-mute"
              style={{ fontSize: '0.8125rem', lineHeight: '1.5' }}
            >
              {description.length > 120 ? description.slice(0, 117) + '…' : description}
            </p>
          )}

          {/* Stats row */}
          {(clusterCount !== null || nodeCount !== null) && (
            <div className="mb-5 flex gap-5 font-mono" style={{ fontSize: '0.8125rem' }}>
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
            </div>
          )}

          {/* Primary CTA */}
          <button
            onClick={onEnter}
            className="inline-flex w-full items-center justify-center gap-2 rounded-ph border border-ph-yellow-pressed bg-ph-yellow font-sans font-bold text-ph-ink transition-colors duration-75 hover:bg-ph-yellow-pressed active:translate-y-px"
            style={{ height: '42px', fontSize: '0.9375rem' }}
          >
            Explore {repoName}
            <span aria-hidden style={{ fontSize: '1rem' }}>
              →
            </span>
          </button>
        </div>
      ) : (
        /* No data loaded — invite generation */
        <div
          className="mb-4 w-full max-w-[460px] rounded-ph border border-ph-border-soft bg-ph-surface"
          style={{ padding: '24px 28px' }}
        >
          <div
            className="mb-3 font-sans font-semibold uppercase tracking-widest text-ph-ash"
            style={{ fontSize: '0.7rem', letterSpacing: '0.08em' }}
          >
            No codebase loaded
          </div>
          <p className="mb-4 text-ph-mute" style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>
            Point Lighthouse at a repo to generate your first map. It reads the
            structure, clusters by feature area, and indexes every file.
          </p>
          <button
            onClick={onGenerate}
            className="inline-flex w-full items-center justify-center gap-2 rounded-ph border border-ph-yellow-pressed bg-ph-yellow font-sans font-bold text-ph-ink transition-colors duration-75 hover:bg-ph-yellow-pressed active:translate-y-px"
            style={{ height: '42px', fontSize: '0.9375rem' }}
          >
            Generate a map →
          </button>
        </div>
      )}

      {/* ── Secondary affordance: generate another repo ──────────── */}
      {repoName && (
        <button
          onClick={onGenerate}
          className="mb-10 inline-flex items-center gap-1.5 rounded-ph border border-ph-border bg-ph-surface-soft px-4 font-sans font-semibold text-ph-body transition-colors duration-75 hover:bg-ph-border-dashed"
          style={{ height: '36px', fontSize: '0.8125rem' }}
        >
          <span style={{ fontSize: '0.875rem' }}>＋</span>
          Generate for another repo
        </button>
      )}

      {/* ── Feature grid: "what you'll get" ─────────────────────── */}
      <div
        className="w-full max-w-[460px] grid gap-3"
        style={{ gridTemplateColumns: '1fr 1fr' }}
      >
        {FEATURES.map((f) => (
          <div
            key={f.label}
            className="flex flex-col gap-1.5 rounded-ph border border-ph-border bg-ph-surface px-4 py-3.5"
          >
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '1rem' }} aria-hidden>
                {f.icon}
              </span>
              <span
                className="font-sans font-semibold text-ph-ink"
                style={{ fontSize: '0.8125rem' }}
              >
                {f.label}
              </span>
            </div>
            <p className="text-ph-mute" style={{ fontSize: '0.75rem', lineHeight: '1.45' }}>
              {f.detail}
            </p>
          </div>
        ))}
      </div>

      {/* ── Ghost caption ────────────────────────────────────────── */}
      <p
        className="mt-8 font-mono text-ph-stone"
        style={{ fontSize: '0.6875rem', letterSpacing: '0.04em' }}
      >
        ← clusters &nbsp; nodes → &nbsp; click to read &nbsp; ask anything ↓
      </p>
    </div>
  );
}

/** Inline lighthouse SVG glyph — same as App.tsx. */
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
