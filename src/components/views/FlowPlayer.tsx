/**
 * FlowPlayer — the player engine for a single Flow.
 *
 * This is the single source of truth for `activeStep` and play state. It wires
 * three synced surfaces from the same step value so they can never drift:
 *
 *   1. FlowTrace   — the animated SVG map; a pulse travels node→node and the
 *                    active node pops with ph-yellow.
 *   2. SequenceRail — a sequence-diagram rail; the active step's row glows.
 *   3. Detail strip — description, node label, owning module/cluster + a
 *                    relevant function name for the active step.
 *
 * Controls: Prev / Play-Pause / Next, ~1s auto-advance. The interval lives in a
 * ref and is torn down on pause, unmount, flow change, and end-of-flow, so no
 * timer ever leaks and the pulse never teleports.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Flow, FunctionNode, LighthouseData } from '../../types/lighthouse';
import { FlowTrace } from './FlowTrace';
import { SequenceRail } from './SequenceRail';
import {
  buildLookups,
  deriveParticipants,
  pickFunctionForModule,
} from './flowEngine';

const PLAY_INTERVAL_MS = 1100;

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconPlay({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 2.5l9 5.5-9 5.5V2.5z" fill="currentColor" />
    </svg>
  );
}
function IconPause({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3" y="2" width="4" height="12" rx="1" fill="currentColor" />
      <rect x="9" y="2" width="4" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}
function IconChevronLeft({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChevronRight({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FlowPlayerProps {
  flow: Flow;
  data: LighthouseData;
  /** Fired whenever the active step changes (parent drives cross-view sync). */
  onStepChange: (stepIndex: number, nodeId: string) => void;
  /** Force the active step to a specific index (from incoming selectedNodeId). */
  forcedStepIndex?: number;
}

// ─── Small control button ────────────────────────────────────────────────────

function CtrlButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 6,
        border: '1px solid #BFC1B7',
        background: '#FFFFFF',
        color: disabled ? '#B6B7AF' : '#4D4F46',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 75ms',
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = '#E5E7E0';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = '#FFFFFF';
      }}
    >
      {children}
    </button>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FlowPlayer({ flow, data, onStepChange, forcedStepIndex }: FlowPlayerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastForcedRef = useRef<number | undefined>(undefined);
  const totalSteps = flow.steps.length;

  // ── Derived model (memoized) ──────────────────────────────────────────────
  const lookups = useMemo(() => buildLookups(data), [data]);
  const participants = useMemo(
    () => deriveParticipants(flow, lookups.nodeById, lookups.clusterById),
    [flow, lookups],
  );

  // ── Active step facts for the detail strip ────────────────────────────────
  const activeStep = flow.steps[activeIndex];
  const activeNode = activeStep ? lookups.nodeById.get(activeStep.node) : undefined;
  const activeCluster = activeNode ? lookups.clusterById.get(activeNode.parent) : undefined;
  const activeFn: FunctionNode | undefined = activeStep
    ? pickFunctionForModule(data.functions, activeStep.node)
    : undefined;

  // ── Forced step from parent (incoming selectedNodeId) ─────────────────────
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

  // ── Notify parent on step change ──────────────────────────────────────────
  useEffect(() => {
    const step = flow.steps[activeIndex];
    if (step) onStepChange(activeIndex, step.node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, flow]);

  // ── Auto-play interval (ref-stored, clean teardown) ───────────────────────
  const totalStepsRef = useRef(totalSteps);
  useEffect(() => {
    totalStepsRef.current = totalSteps;
  }, [totalSteps]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!isPlaying) return;

    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = prev + 1;
        if (next >= totalStepsRef.current) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setIsPlaying(false);
          return prev; // stay on last step
        }
        return next;
      });
    }, PLAY_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying]);

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

  const selectParticipant = useCallback(
    (nodeId: string) => {
      const idx = flow.steps.findIndex((s) => s.node === nodeId);
      if (idx >= 0) goToStep(idx);
    },
    [flow, goToStep],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ── Controls bar ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderTop: '1px solid #BFC1B7',
          borderBottom: '1px solid #BFC1B7',
          background: '#FFFFFF',
          padding: '10px 20px',
        }}
      >
        <span
          style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.05em',
            color: '#6C6E63',
            marginRight: 4,
          }}
        >
          STEP {activeIndex + 1} / {totalSteps}
        </span>

        {/* Progress dots */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 6 }}>
          {flow.steps.map((_, i) => (
            <button
              key={i}
              onClick={() => goToStep(i)}
              aria-label={`Go to step ${i + 1}`}
              style={{
                width: i === activeIndex ? 20 : 8,
                height: 8,
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 200ms ease-out',
                backgroundColor:
                  i === activeIndex ? '#F7A501' : i < activeIndex ? '#BFC1B7' : '#E5E7E0',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CtrlButton onClick={goToPrev} disabled={activeIndex === 0} label="Previous step">
            <IconChevronLeft />
          </CtrlButton>
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
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <CtrlButton onClick={goToNext} disabled={activeIndex === totalSteps - 1} label="Next step">
            <IconChevronRight />
          </CtrlButton>
        </div>
      </div>

      {/* ── Two synced surfaces ─────────────────────────────────────────── */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Map trace */}
        <FlowTrace
          flow={flow}
          participants={participants}
          edges={data.edges}
          activeStep={activeIndex}
          onSelectParticipant={selectParticipant}
        />

        {/* Detail strip */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #BFC1B7',
            borderLeft: '3px solid #F7A501',
            borderRadius: 6,
            padding: '12px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: '"Nunito", system-ui, sans-serif',
                fontSize: 14,
                fontWeight: 800,
                color: '#151515',
              }}
            >
              {activeNode?.label ?? activeStep?.node ?? '—'}
            </span>
            {activeCluster && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 8px',
                  borderRadius: 9999,
                  background: '#E5E7E0',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: '#4D4F46',
                  fontFamily: '"Nunito", system-ui, sans-serif',
                }}
              >
                {activeCluster.label}
              </span>
            )}
            {activeFn && (
              <code
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 11,
                  color: '#6C6E63',
                  background: '#E5E7E0',
                  borderRadius: 4,
                  padding: '1px 6px',
                }}
              >
                {activeFn.name}()
              </code>
            )}
          </div>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 13,
              lineHeight: 1.5,
              color: '#4D4F46',
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            }}
          >
            {activeStep?.description ?? 'No step selected.'}
          </p>
          {activeNode?.path && (
            <code
              style={{
                display: 'inline-block',
                marginTop: 6,
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 11,
                color: '#9B9C92',
              }}
            >
              {activeNode.path}
            </code>
          )}
        </div>

        {/* Sequence rail */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #BFC1B7',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '8px 14px',
              borderBottom: '1px solid #DCDFD2',
              fontFamily: '"Nunito", system-ui, sans-serif',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#9B9C92',
            }}
          >
            Sequence — modules over time
          </div>
          <div style={{ padding: '4px 8px 8px' }}>
            <SequenceRail
              flow={flow}
              participants={participants}
              activeStep={activeIndex}
              onSelectStep={goToStep}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
