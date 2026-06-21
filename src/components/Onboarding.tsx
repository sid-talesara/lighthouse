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
import { LighthouseIllustration } from './LighthouseIllustration';

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
    detail: "Type a question; the map lights up the answer. It won't judge your architecture.",
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
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12"
      style={{
        fontFamily: '"Nunito", system-ui, sans-serif',
        backgroundColor: '#EEEFE9',
      }}
    >
      {/* ── Cream texture / grain overlay ───────────────────────── */}
      <GrainTexture />

      {/* ── Faint coastline beam motif in background ─────────────── */}
      <BeamMotif />

      {/* ── Content (above bg layers) ───────────────────────────── */}
      <div className="relative z-10 flex w-full flex-col items-center">

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="mb-10 flex flex-col items-center gap-4 text-center">

          {/* Illustration — the big characterful moment */}
          <div className="mb-1" style={{ width: 180, height: 148 }}>
            <LighthouseIllustration className="h-full w-full" />
          </div>

          {/* Wordmark */}
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-ph border border-ph-border bg-ph-surface"
              style={{ flexShrink: 0 }}
            >
              <LighthouseGlyph className="h-4 w-4 text-ph-yellow" />
            </div>
            <span
              className="font-display font-extrabold tracking-tight text-ph-ink"
              style={{ fontSize: '1.125rem', letterSpacing: '-0.01em' }}
            >
              Lighthouse
            </span>
          </div>

          {/* Bold headline */}
          <h1
            className="font-display font-extrabold text-ph-ink"
            style={{
              fontSize: 'clamp(2rem, 5vw, 2.75rem)',
              lineHeight: '1.15',
              letterSpacing: '-0.03em',
              maxWidth: '520px',
            }}
          >
            Understand any codebase.
            <br />
            <span style={{ color: '#F7A501' }}>In minutes, not weeks.</span>
          </h1>

          {/* Witty subhead */}
          <p
            className="text-ph-body"
            style={{ fontSize: '1.0625rem', lineHeight: '1.6', maxWidth: '400px' }}
          >
            A living, interactive map of structure, dependencies, and meaning.{' '}
            <span className="text-ph-mute" style={{ fontSize: '0.9375rem' }}>
              Like a GPS for your codebase — except it actually knows where things are.
            </span>
          </p>
        </div>

        {/* ── Primary card: Explore loaded repo ───────────────────── */}
        {repoName ? (
          <RepoCard
            repoName={repoName}
            description={description}
            clusterCount={clusterCount}
            nodeCount={nodeCount}
            onEnter={onEnter}
          />
        ) : (
          <EmptyCard onGenerate={onGenerate} />
        )}

        {/* ── Secondary affordance: generate another repo ──────────── */}
        {repoName && (
          <button
            onClick={onGenerate}
            className="mb-10 inline-flex items-center gap-1.5 rounded-ph border border-ph-border bg-ph-surface px-4 font-sans font-semibold text-ph-body transition-colors duration-75 hover:bg-ph-surface-soft active:translate-y-px"
            style={{ height: '36px', fontSize: '0.8125rem' }}
          >
            <span style={{ fontSize: '0.875rem' }}>＋</span>
            Generate for another repo
          </button>
        )}

        {/* ── Feature grid: "what you'll get" ─────────────────────── */}
        <div className="mb-2 w-full max-w-[480px]">
          {/* Section label */}
          <div
            className="mb-3 font-mono font-semibold uppercase tracking-widest text-ph-ash"
            style={{ fontSize: '0.6875rem', letterSpacing: '0.1em' }}
          >
            What you get
          </div>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: '1fr 1fr' }}
          >
            {FEATURES.map((f) => (
              <FeatureCard key={f.label} icon={f.icon} label={f.label} detail={f.detail} />
            ))}
          </div>
        </div>

        {/* ── Ghost caption ────────────────────────────────────────── */}
        <p
          className="mt-8 font-mono text-ph-stone"
          style={{ fontSize: '0.6875rem', letterSpacing: '0.04em' }}
        >
          ← clusters &nbsp; nodes → &nbsp; click to read &nbsp; ask anything ↓
        </p>

      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

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
      className="mb-4 w-full max-w-[480px] rounded-ph border border-ph-border bg-ph-surface"
      style={{ padding: '24px 28px' }}
    >
      {/* Breadcrumb label */}
      <div
        className="mb-3 font-mono font-semibold uppercase tracking-widest text-ph-ash"
        style={{ fontSize: '0.6875rem', letterSpacing: '0.1em' }}
      >
        Ready to explore
      </div>

      {/* Repo identity row */}
      <div className="mb-1 flex items-center gap-2.5">
        {/* Accent dot */}
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

      {/* Stats row */}
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

      {/* Primary CTA */}
      <button
        onClick={onEnter}
        className="inline-flex w-full items-center justify-center gap-2 rounded-ph border border-ph-yellow-pressed bg-ph-yellow font-sans font-bold text-ph-ink transition-colors duration-75 hover:bg-ph-yellow-pressed active:translate-y-px"
        style={{ height: '44px', fontSize: '0.9375rem' }}
      >
        Explore {repoName}
        <span aria-hidden style={{ fontSize: '1rem' }}>
          →
        </span>
      </button>
    </div>
  );
}

function EmptyCard({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div
      className="mb-4 w-full max-w-[480px] rounded-ph border border-ph-border bg-ph-surface"
      style={{ padding: '24px 28px' }}
    >
      <div
        className="mb-3 font-mono font-semibold uppercase tracking-widest text-ph-ash"
        style={{ fontSize: '0.6875rem', letterSpacing: '0.1em' }}
      >
        No codebase loaded
      </div>
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

function FeatureCard({
  icon,
  label,
  detail,
}: {
  icon: string;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-ph border border-ph-border bg-ph-surface px-4 py-3.5 transition-colors duration-75 hover:border-ph-ash">
      <div className="flex items-center gap-2">
        <span style={{ fontSize: '1.0625rem' }} aria-hidden>
          {icon}
        </span>
        <span
          className="font-sans font-bold text-ph-ink"
          style={{ fontSize: '0.8125rem' }}
        >
          {label}
        </span>
      </div>
      <p className="text-ph-mute" style={{ fontSize: '0.75rem', lineHeight: '1.5' }}>
        {detail}
      </p>
    </div>
  );
}

/* ── Background decorations ─────────────────────────────────────────── */

/** Subtle SVG grain / noise texture overlay — gives the cream canvas depth. */
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

/** Faint diagonal beam motif — evokes the lighthouse beam sweeping the canvas. */
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
      {/* Three overlapping beam wedges radiating from top-right */}
      <polygon points="480,0 480,320 220,160" fill="#F7A501" opacity="0.04" />
      <polygon points="480,0 480,260 260,110" fill="#F7A501" opacity="0.05" />
      <polygon points="480,0 480,200 300,70"  fill="#F7A501" opacity="0.06" />

      {/* Dotted coastline bottom-left motif */}
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
