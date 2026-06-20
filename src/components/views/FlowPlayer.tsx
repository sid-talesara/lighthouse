/**
 * FlowPlayer — animated step-by-step walkthrough engine for a single Flow.
 *
 * Responsibilities:
 *  - Renders a vertical timeline of steps (past → active → future).
 *  - Prev / Next / Play controls auto-advance through steps.
 *  - Calls onStepChange whenever the active step changes so the parent can
 *    drive onSelectNode / onHighlightNodes.
 *  - Reflects an incomingActiveIndex override (driven by selectedNodeId
 *    from other views).
 *  - PostHog-inspired styling: cream canvas, white cards, olive borders,
 *    yellow (#F7A501) accent for the active step.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Flow, LighthouseNode } from '../../types/lighthouse';

// ─── Icon primitives (inline SVG, no dep needed) ───────────────────────────

function IconPlay({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 2.5l9 5.5-9 5.5V2.5z" fill="currentColor" />
    </svg>
  );
}

function IconPause({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3" y="2" width="4" height="12" rx="1" fill="currentColor" />
      <rect x="9" y="2" width="4" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}

function IconChevronLeft({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FlowPlayerProps {
  flow: Flow;
  /** Lookup map from node id → node (for resolving labels). */
  nodeMap: Map<string, LighthouseNode>;
  /**
   * Fired whenever the active step index changes.
   * Parent uses this to call onSelectNode / onHighlightNodes.
   */
  onStepChange: (stepIndex: number, nodeId: string) => void;
  /**
   * When another view selects a node that belongs to this flow, the parent
   * can force the active step to a specific index. Pass -1 or undefined to
   * leave the player in control.
   */
  forcedStepIndex?: number;
}

const PLAY_INTERVAL_MS = 2200;

// ─── Step state helpers ──────────────────────────────────────────────────────

type StepState = 'past' | 'active' | 'future';

function stepState(index: number, activeIndex: number): StepState {
  if (index < activeIndex) return 'past';
  if (index === activeIndex) return 'active';
  return 'future';
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FlowPlayer({ flow, nodeMap, onStepChange, forcedStepIndex }: FlowPlayerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastForcedRef = useRef<number | undefined>(undefined);

  const totalSteps = flow.steps.length;

  // ── Sync forced step from parent (incoming selectedNodeId) ────────────────
  useEffect(() => {
    if (
      forcedStepIndex !== undefined &&
      forcedStepIndex >= 0 &&
      forcedStepIndex !== lastForcedRef.current &&
      forcedStepIndex !== activeIndex
    ) {
      lastForcedRef.current = forcedStepIndex;
      setActiveIndex(forcedStepIndex);
      setIsPlaying(false);
    }
  }, [forcedStepIndex, activeIndex]);

  // ── Notify parent when activeIndex changes ────────────────────────────────
  useEffect(() => {
    const step = flow.steps[activeIndex];
    if (step) {
      onStepChange(activeIndex, step.node);
    }
  // onStepChange identity may change; only trigger on index / flow change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, flow]);

  // ── Auto-play interval ────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setActiveIndex((prev) => {
          if (prev >= totalSteps - 1) {
            // Reached end — stop player, stay at last step
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, PLAY_INTERVAL_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, totalSteps]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const goToPrev = useCallback(() => {
    setIsPlaying(false);
    setActiveIndex((i) => Math.max(0, i - 1));
  }, []);

  const goToNext = useCallback(() => {
    setIsPlaying(false);
    setActiveIndex((i) => Math.min(totalSteps - 1, i + 1));
  }, [totalSteps]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => {
      // If at the end and pressing play, restart from beginning
      if (!p && activeIndex >= totalSteps - 1) {
        setActiveIndex(0);
        return true;
      }
      return !p;
    });
  }, [activeIndex, totalSteps]);

  const goToStep = useCallback((index: number) => {
    setIsPlaying(false);
    setActiveIndex(index);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-0">

      {/* ── Player controls bar ─────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 border-b border-ph-border bg-ph-surface px-5 py-3"
        style={{ borderTop: '1px solid #BFC1B7' }}
      >
        {/* Step counter */}
        <span
          className="mr-2 font-mono text-[11px] font-medium text-ph-mute"
          style={{ letterSpacing: '0.05em' }}
        >
          STEP {activeIndex + 1} / {totalSteps}
        </span>

        {/* Progress dots */}
        <div className="flex flex-1 items-center gap-1.5">
          {flow.steps.map((_, i) => {
            const state = stepState(i, activeIndex);
            return (
              <button
                key={i}
                onClick={() => goToStep(i)}
                title={`Go to step ${i + 1}`}
                aria-label={`Go to step ${i + 1}`}
                style={{
                  width: state === 'active' ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 200ms ease-out',
                  backgroundColor:
                    state === 'active'
                      ? '#F7A501'
                      : state === 'past'
                      ? '#BFC1B7'
                      : '#E5E7E0',
                }}
              />
            );
          })}
        </div>

        {/* Prev / Play / Next */}
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrev}
            disabled={activeIndex === 0}
            aria-label="Previous step"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 6,
              border: '1px solid #BFC1B7',
              background: '#FFFFFF',
              color: activeIndex === 0 ? '#B6B7AF' : '#4D4F46',
              cursor: activeIndex === 0 ? 'not-allowed' : 'pointer',
              transition: 'background 75ms',
            }}
            onMouseEnter={(e) => {
              if (activeIndex !== 0) (e.currentTarget as HTMLButtonElement).style.background = '#E5E7E0';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#FFFFFF';
            }}
          >
            <IconChevronLeft size={14} />
          </button>

          <button
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 6,
              border: '1px solid #DD9001',
              background: '#F7A501',
              color: '#23251D',
              cursor: 'pointer',
              fontWeight: 700,
              transition: 'background 75ms',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#DD9001';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#F7A501';
            }}
            onMouseDown={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(1px)';
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            }}
          >
            {isPlaying ? <IconPause size={14} /> : <IconPlay size={14} />}
          </button>

          <button
            onClick={goToNext}
            disabled={activeIndex === totalSteps - 1}
            aria-label="Next step"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 6,
              border: '1px solid #BFC1B7',
              background: '#FFFFFF',
              color: activeIndex === totalSteps - 1 ? '#B6B7AF' : '#4D4F46',
              cursor: activeIndex === totalSteps - 1 ? 'not-allowed' : 'pointer',
              transition: 'background 75ms',
            }}
            onMouseEnter={(e) => {
              if (activeIndex !== totalSteps - 1)
                (e.currentTarget as HTMLButtonElement).style.background = '#E5E7E0';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#FFFFFF';
            }}
          >
            <IconChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Timeline ───────────────────────────────────────────────────────── */}
      <ol className="relative px-5 py-4" style={{ listStyle: 'none', margin: 0 }}>
        {/* Vertical connector line behind all steps */}
        <li
          aria-hidden
          style={{
            position: 'absolute',
            left: 38,
            top: 32,
            bottom: 32,
            width: 2,
            borderRadius: 1,
            background: '#E5E7E0',
            pointerEvents: 'none',
          }}
        />

        {flow.steps.map((step, i) => {
          const state = stepState(i, activeIndex);
          const node = nodeMap.get(step.node);
          const label = node?.label ?? step.node;

          // Active step: full opacity, yellow accent, white card with border highlight
          // Past step: muted (done indicator), reduced opacity card
          // Future step: faded out, lighter border

          const isActive = state === 'active';
          const isPast = state === 'past';

          return (
            <li
              key={`${flow.name}-step-${i}`}
              onClick={() => goToStep(i)}
              role="button"
              tabIndex={0}
              aria-current={isActive ? 'step' : undefined}
              onKeyDown={(e) => e.key === 'Enter' && goToStep(i)}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                marginBottom: i < totalSteps - 1 ? 16 : 0,
                cursor: 'pointer',
                opacity: state === 'future' ? 0.45 : 1,
                transition: 'opacity 200ms ease-out',
              }}
            >
              {/* Step number bubble */}
              <div
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1,
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: '"Nunito", system-ui, sans-serif',
                  transition: 'background 200ms ease-out, color 200ms ease-out, border-color 200ms ease-out',
                  background: isActive
                    ? '#F7A501'
                    : isPast
                    ? '#E5E7E0'
                    : '#FFFFFF',
                  color: isActive ? '#23251D' : isPast ? '#6C6E63' : '#9B9C92',
                  border: isActive
                    ? '2px solid #DD9001'
                    : isPast
                    ? '2px solid #BFC1B7'
                    : '2px solid #E5E7E0',
                }}
              >
                {isPast ? (
                  // Checkmark for completed steps
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="#6C6E63"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>

              {/* Step card */}
              <div
                style={{
                  flex: 1,
                  borderRadius: 6,
                  border: isActive ? '1.5px solid #F7A501' : '1px solid #BFC1B7',
                  background: '#FFFFFF',
                  padding: '12px 14px',
                  transition:
                    'border-color 200ms ease-out, box-shadow 200ms ease-out, transform 200ms ease-out',
                  boxShadow: isActive
                    ? '0 0 0 3px rgba(247,165,1,0.15)'
                    : 'none',
                  transform: isActive ? 'translateX(2px)' : 'translateX(0)',
                  // Animate card entrance when it becomes active
                  animation: isActive ? 'flowStepActivate 220ms ease-out both' : undefined,
                }}
              >
                {/* Node label */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  {isActive && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#F7A501',
                        flexShrink: 0,
                        animation: 'flowPulse 1.5s ease-in-out infinite',
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: '"Nunito", system-ui, sans-serif',
                      color: isActive ? '#151515' : '#4D4F46',
                      transition: 'color 200ms ease-out',
                      lineHeight: 1.4,
                    }}
                  >
                    {label}
                  </span>
                </div>

                {/* Node id path (monospace) */}
                <div style={{ marginBottom: 6 }}>
                  <code
                    style={{
                      fontSize: 11,
                      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                      color: '#6C6E63',
                      background: '#E5E7E0',
                      borderRadius: 4,
                      padding: '1px 5px',
                    }}
                  >
                    {step.node}
                  </code>
                </div>

                {/* Step description */}
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: isActive ? '#4D4F46' : '#6C6E63',
                    margin: 0,
                    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                    transition: 'color 200ms ease-out',
                  }}
                >
                  {step.description}
                </p>

                {/* Node summary if available */}
                {isActive && node?.summary && (
                  <p
                    style={{
                      fontSize: 12,
                      lineHeight: 1.43,
                      color: '#9B9C92',
                      margin: '6px 0 0',
                      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                      borderTop: '1px solid #DCDFD2',
                      paddingTop: 6,
                      animation: 'flowFadeIn 200ms ease-out both',
                    }}
                  >
                    {node.summary}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Inline keyframes — scoped to this component */}
      <style>{`
        @keyframes flowStepActivate {
          from { opacity: 0.6; transform: translateX(0); }
          to   { opacity: 1;   transform: translateX(2px); }
        }
        @keyframes flowFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes flowPulse {
          0%, 100% { opacity: 1;   transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.75); }
        }
      `}</style>
    </div>
  );
}
