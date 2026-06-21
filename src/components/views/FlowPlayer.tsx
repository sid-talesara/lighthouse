/**
 * FlowPlayer — the player engine for a single Flow (the guided tour).
 *
 * Single source of truth for `activeStep` and play state. It wires two synced
 * surfaces from the same resolved-step model so they can never drift:
 *
 *   1. FlowTrace    — the aligned, ZOOMABLE flow diagram. One card per step,
 *                     stacked on a centre axis, joined by labeled connectors.
 *                     The viewport re-centres on the active card; the user can
 *                     wheel-zoom / drag-pan / fit.
 *   2. SequenceRail — the GUIDED WALKTHROUGH panel: a vertical, richly-explained
 *                     list of steps; the active one expands into a full briefing
 *                     (what / who / where in code / how control hands off).
 *
 * A synthesized one-liner up top tells the viewer what the flow accomplishes
 * end-to-end before they start. Controls: Prev / Play-Pause / Next + progress
 * dots, with clear active-step emphasis.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Flow, LighthouseData } from '../../types/lighthouse';
import { FlowTrace } from './FlowTrace';
import { SequenceRail } from './SequenceRail';
import { buildLookups, resolveSteps, synthesizeFlowOneLiner } from './flowEngine';

const PLAY_INTERVAL_MS = 2600;

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

  // ── Resolved model (single source of truth for both surfaces) ─────────────
  const lookups = useMemo(() => buildLookups(data), [data]);
  const resolved = useMemo(
    () => resolveSteps(flow, lookups, data.edges, data.functions),
    [flow, lookups, data.edges, data.functions],
  );

  // ── Flow one-liner: synthesized end-to-end summary ────────────────────────
  const oneLiner = useMemo(
    () => synthesizeFlowOneLiner(flow, lookups.nodeById, lookups.clusterById),
    [flow, lookups],
  );

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

  // ── Auto-play interval ────────────────────────────────────────────────────
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
          return prev;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ── Flow one-liner (what this flow accomplishes end-to-end) ───────── */}
      <div
        style={{
          padding: '12px 20px',
          background: '#DCEAF6',
          borderBottom: '1px solid #BFC1B7',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          style={{ flexShrink: 0, marginTop: 2 }}
        >
          <circle cx={8} cy={8} r={7} stroke="#1078A3" strokeWidth={1.5} />
          <text
            x={8}
            y={12}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fontFamily="Nunito, system-ui"
            fill="#1078A3"
          >
            i
          </text>
        </svg>
        <div>
          <span
            style={{
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: 13.5,
              fontWeight: 600,
              color: '#0E5E80',
              lineHeight: 1.5,
            }}
          >
            {oneLiner}
          </span>
          <span
            style={{
              display: 'block',
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: 11,
              color: '#5A9DC0',
              marginTop: 3,
            }}
          >
            New here? Press play, or step with Prev / Next. The diagram (left) and the walkthrough (right) stay in sync — the diagram is zoomable.
          </span>
        </div>
      </div>

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
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
            flexShrink: 0,
          }}
        >
          STEP {activeIndex + 1} / {totalSteps}
        </span>

        {/* Progress dots */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 5 }}>
          {flow.steps.map((_, i) => (
            <button
              key={i}
              onClick={() => goToStep(i)}
              aria-label={`Go to step ${i + 1}`}
              title={`Step ${i + 1}: ${flow.steps[i]?.description ?? ''}`}
              style={{
                width: i === activeIndex ? 20 : 8,
                height: 8,
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 200ms ease-out',
                backgroundColor:
                  i === activeIndex ? '#F7A501' : i < activeIndex ? '#BFC1B7' : '#E5E7E0',
                flexShrink: 0,
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

      {/* ── Two synced surfaces: zoomable diagram + guided walkthrough ────── */}
      <div
        style={{
          padding: 16,
          display: 'grid',
          gridTemplateColumns: 'minmax(360px, 1.1fr) minmax(340px, 1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* Left: aligned, zoomable flow diagram */}
        <FlowTrace
          steps={resolved}
          activeStep={activeIndex}
          onSelectStep={goToStep}
        />

        {/* Right: guided walkthrough / tour panel */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #BFC1B7',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <SequenceRail
            steps={resolved}
            activeStep={activeIndex}
            onSelectStep={goToStep}
          />
        </div>
      </div>
    </div>
  );
}
