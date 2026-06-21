/**
 * FlowPlayer — the player engine for a single Flow.
 *
 * This is the single source of truth for `activeStep` and play state. It wires
 * three synced surfaces from the same step value so they can never drift:
 *
 *   1. FlowTrace    — the animated SVG module-map; a pulse travels node→node
 *                     and the active node pops with ph-yellow.
 *   2. SequenceRail — a sequence-diagram rail; the active step's row glows.
 *   3. Detail strip — full plain-language description, module name, owning
 *                     service/cluster, transition verb, and file path.
 *
 * At the top a synthesized one-liner tells the viewer what the flow does
 * end-to-end before they start watching.
 *
 * Controls: Prev / Play-Pause / Next, ~1.1s auto-advance.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Flow, FunctionNode, LighthouseData } from '../../types/lighthouse';
import { FlowTrace } from './FlowTrace';
import { SequenceRail } from './SequenceRail';
import {
  buildLookups,
  deriveParticipants,
  pickFunctionForModule,
  synthesizeFlowOneLiner,
  transitionVerb,
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

  // ── Flow one-liner: synthesized end-to-end summary ────────────────────────
  const oneLiner = useMemo(
    () => synthesizeFlowOneLiner(flow, lookups.nodeById, lookups.clusterById),
    [flow, lookups],
  );

  // ── Active step facts for the detail strip ────────────────────────────────
  const activeStep = flow.steps[activeIndex];
  const activeNode = activeStep ? lookups.nodeById.get(activeStep.node) : undefined;
  const activeCluster = activeNode ? lookups.clusterById.get(activeNode.parent) : undefined;
  const activeFn: FunctionNode | undefined = activeStep
    ? pickFunctionForModule(data.functions, activeStep.node)
    : undefined;

  // ── Transition verb: what connects the previous step to this one ──────────
  const prevStepNode = activeIndex > 0 ? flow.steps[activeIndex - 1]?.node : undefined;
  const verb = transitionVerb(prevStepNode, activeStep?.node, data.edges);

  // ── Next module (for "then calls →") label ────────────────────────────────
  const nextStep = flow.steps[activeIndex + 1];
  const nextNode = nextStep ? lookups.nodeById.get(nextStep.node) : undefined;
  const nextVerb = nextStep
    ? transitionVerb(activeStep?.node, nextStep.node, data.edges)
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

      {/* ── Flow one-liner (what this flow does end-to-end) ─────────────── */}
      <div
        style={{
          padding: '10px 20px',
          background: '#DCEAF6',
          borderBottom: '1px solid #BFC1B7',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        {/* Info icon */}
        <svg
          width={16}
          height={16}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          style={{ flexShrink: 0, marginTop: 1 }}
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
              fontSize: 13,
              color: '#1078A3',
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
              marginTop: 2,
            }}
          >
            Press play or use Prev / Next to walk through each step. The map and sequence diagram stay in sync.
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

      {/* ── Two synced surfaces ─────────────────────────────────────────── */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Active step detail strip ─────────────────────────────────── */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #BFC1B7',
            borderLeft: '3px solid #F7A501',
            borderRadius: 6,
            padding: '14px 16px',
          }}
        >
          {/* Step number + module name + cluster badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            {/* Step number pill */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#F7A501',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                fontWeight: 700,
                color: '#23251D',
                flexShrink: 0,
              }}
            >
              {activeIndex + 1}
            </span>

            {/* Module name (the "who handles this") */}
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

            {/* Owning cluster/service badge */}
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

            {/* Relevant function name (if available) */}
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

          {/* "incoming from" transition label — tells you the handoff */}
          {activeIndex > 0 && prevStepNode && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                marginBottom: 6,
              }}
            >
              <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 6h8M7 3l3 3-3 3" stroke="#9B9C92" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span
                style={{
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontSize: 11,
                  color: '#9B9C92',
                  fontStyle: 'italic',
                }}
              >
                {lookups.nodeById.get(prevStepNode)?.label ?? prevStepNode}{' '}
                <strong style={{ color: '#6C6E63', fontStyle: 'normal' }}>{verb}</strong>{' '}
                {activeNode?.label ?? activeStep?.node}
              </span>
            </div>
          )}

          {/* What happens — the full plain-language description */}
          <p
            style={{
              margin: '0 0 0',
              fontSize: 13,
              lineHeight: 1.6,
              color: '#23251D',
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
              fontWeight: 400,
            }}
          >
            {activeStep?.description ?? 'No step selected.'}
          </p>

          {/* "then calls →" — next handoff */}
          {nextStep && nextNode && nextVerb && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid #DCDFD2',
              }}
            >
              <span
                style={{
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontSize: 11,
                  color: '#9B9C92',
                }}
              >
                then{' '}
                <strong style={{ color: '#6C6E63' }}>{nextVerb}</strong>
                {' '}→{' '}
                <span style={{ color: '#2C84E0', fontWeight: 600 }}>
                  {nextNode.label}
                </span>
              </span>
              <span
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 9,
                  color: '#9B9C92',
                  marginLeft: 4,
                  background: '#E5E7E0',
                  borderRadius: 3,
                  padding: '1px 5px',
                }}
              >
                step {activeIndex + 2}
              </span>
            </div>
          )}

          {/* File path */}
          {activeNode?.path && (
            <code
              style={{
                display: 'inline-block',
                marginTop: 8,
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                color: '#9B9C92',
                background: '#F0F0EC',
                borderRadius: 3,
                padding: '2px 6px',
              }}
            >
              {activeNode.path}
            </code>
          )}
        </div>

        {/* ── Map trace ─────────────────────────────────────────────────── */}
        <FlowTrace
          flow={flow}
          participants={participants}
          edges={data.edges}
          activeStep={activeIndex}
          onSelectParticipant={selectParticipant}
        />

        {/* ── Sequence rail ─────────────────────────────────────────────── */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #BFC1B7',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <SequenceRail
            flow={flow}
            participants={participants}
            activeStep={activeIndex}
            onSelectStep={goToStep}
          />
        </div>
      </div>
    </div>
  );
}
