/**
 * EvolutionScrubber — the "watch the system grow" timeline.
 *
 * A horizontal scrubber across all PRs by date with Play / step controls.
 * As you scrub or play forward, the system's growth ACCUMULATES:
 *   - every PR up to and including the cursor contributes its touched nodes
 *   - we emit the full accumulated highlight set to the parent so the
 *     Architecture tab lights up node-by-node as the system evolves
 *   - a running summary reads "By <date>: N changes across M areas."
 *
 * Motion = meaning: the progress fill, the dot scaling, and the metric
 * counters all animate smoothly as the cursor moves.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LighthouseNode, PullRequest } from '../../types/lighthouse';

const PLAY_INTERVAL_MS = 1100;

// ─── Icons ────────────────────────────────────────────────────────────────────

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
function IconReset({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5V5h2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Accumulated state derivation ─────────────────────────────────────────────

export interface EvolutionState {
  /** All node ids touched by PRs up to & including the cursor. */
  highlight: Set<string>;
  /** Count of "added" touches up to the cursor. */
  added: number;
  /** Total touches (added+modified+removed) up to the cursor. */
  totalChanges: number;
  /** Distinct clusters (areas) touched up to the cursor. */
  areas: number;
  /** Date string of the cursor PR. */
  date: string;
}

function deriveState(
  prsAsc: PullRequest[],
  cursor: number,
  nodeMap: Map<string, LighthouseNode>,
): EvolutionState {
  const highlight = new Set<string>();
  const areas = new Set<string>();
  let added = 0;
  let totalChanges = 0;
  for (let i = 0; i <= cursor && i < prsAsc.length; i++) {
    const pr = prsAsc[i];
    for (const t of pr.touched) {
      highlight.add(t.node_id);
      totalChanges += 1;
      if (t.change === 'added') added += 1;
      const node = nodeMap.get(t.node_id);
      const area = node?.parent ?? t.node_id;
      areas.add(area);
    }
  }
  return {
    highlight,
    added,
    totalChanges,
    areas: areas.size,
    date: prsAsc[Math.min(cursor, prsAsc.length - 1)]?.date ?? '',
  };
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Animated counter ─────────────────────────────────────────────────────────

function useCountUp(target: number, durationMs = 350): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = Math.round(from + (target - from) * eased);
      setValue(next);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = target;
    };
  }, [target, durationMs]);

  return value;
}

function Metric({ value, label }: { value: number; label: string }) {
  const display = useCountUp(value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 64 }}>
      <span
        style={{
          fontSize: 22,
          fontWeight: 800,
          lineHeight: 1,
          fontFamily: '"Nunito", system-ui, sans-serif',
          color: '#151515',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {display}
      </span>
      <span
        style={{
          marginTop: 4,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: '#9B9C92',
          fontFamily: '"Nunito", system-ui, sans-serif',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface EvolutionScrubberProps {
  /** PRs in ASCENDING date order (oldest → newest). */
  prsAsc: PullRequest[];
  nodeMap: Map<string, LighthouseNode>;
  /** Fired with the accumulated highlight set + the cursor PR id as the cursor moves. */
  onEvolve: (highlight: Set<string>, cursorPrId: string) => void;
}

export function EvolutionScrubber({ prsAsc, nodeMap, onEvolve }: EvolutionScrubberProps) {
  const total = prsAsc.length;
  const [cursor, setCursor] = useState(total - 1); // start fully-evolved
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalRef = useRef(total);
  useEffect(() => {
    totalRef.current = total;
  }, [total]);

  const state = useMemo(
    () => deriveState(prsAsc, cursor, nodeMap),
    [prsAsc, cursor, nodeMap],
  );

  // Emit accumulated highlight on every cursor move.
  const onEvolveRef = useRef(onEvolve);
  useEffect(() => {
    onEvolveRef.current = onEvolve;
  }, [onEvolve]);
  useEffect(() => {
    const pr = prsAsc[cursor];
    if (pr) onEvolveRef.current(state.highlight, pr.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, state.highlight]);

  // Auto-play.
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!isPlaying) return;
    intervalRef.current = setInterval(() => {
      setCursor((prev) => {
        const next = prev + 1;
        if (next >= totalRef.current) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setIsPlaying(false);
          return totalRef.current - 1;
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

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => {
      if (!p && cursor >= total - 1) {
        setCursor(0);
        return true;
      }
      return !p;
    });
  }, [cursor, total]);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCursor(0);
  }, []);

  if (total === 0) return null;

  const progressPct = total <= 1 ? 100 : (cursor / (total - 1)) * 100;
  const cursorPr = prsAsc[cursor];

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #BFC1B7',
        borderRadius: 6,
        padding: '18px 20px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h3
          style={{
            fontSize: 15,
            fontWeight: 800,
            fontFamily: '"Nunito", system-ui, sans-serif',
            color: '#151515',
            margin: 0,
          }}
        >
          Evolution
        </h3>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#9B9C92',
            fontFamily: '"Nunito", system-ui, sans-serif',
          }}
        >
          scrub through how the system grew
        </span>
      </div>

      {/* Running summary */}
      <p
        style={{
          fontSize: 13,
          color: '#4D4F46',
          margin: '0 0 16px',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        By{' '}
        <strong style={{ color: '#151515' }}>{formatDate(state.date)}</strong>:{' '}
        <strong style={{ color: '#151515' }}>{state.totalChanges}</strong> changes across{' '}
        <strong style={{ color: '#151515' }}>{state.areas}</strong>{' '}
        {state.areas === 1 ? 'area' : 'areas'}.
      </p>

      {/* Metrics + controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          marginBottom: 18,
          flexWrap: 'wrap',
        }}
      >
        <Metric value={cursor + 1} label="PRs shipped" />
        <Metric value={state.added} label="modules added" />
        <Metric value={state.highlight.size} label="areas touched" />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={reset}
            aria-label="Reset to start"
            style={ctrlBtn(false)}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
          >
            <IconReset />
          </button>
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause evolution' : 'Play evolution'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 6,
              border: '1px solid #DD9001',
              background: '#F7A501',
              color: '#23251D',
              cursor: 'pointer',
              transition: 'background 75ms, transform 80ms',
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
        </div>
      </div>

      {/* Scrubber track */}
      <div style={{ position: 'relative', padding: '14px 6px 6px' }}>
        {/* Base line */}
        <div
          style={{
            position: 'absolute',
            left: 6,
            right: 6,
            top: 20,
            height: 4,
            borderRadius: 2,
            background: '#E5E7E0',
          }}
        />
        {/* Progress fill */}
        <div
          style={{
            position: 'absolute',
            left: 6,
            top: 20,
            height: 4,
            borderRadius: 2,
            background: '#F7A501',
            width: `calc(${progressPct}% - ${(progressPct / 100) * 12}px + 6px)`,
            maxWidth: 'calc(100% - 12px)',
            transition: 'width 400ms cubic-bezier(0.22,1,0.36,1)',
          }}
        />
        {/* PR dots */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {prsAsc.map((pr, i) => {
            const reached = i <= cursor;
            const isCursor = i === cursor;
            const isOpen = pr.status === 'open';
            return (
              <button
                key={pr.id}
                onClick={() => {
                  setIsPlaying(false);
                  setCursor(i);
                }}
                title={`${pr.id} · ${pr.title} · ${formatDate(pr.date)}`}
                aria-label={`Jump to ${pr.id}`}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  width: isCursor ? 18 : 12,
                  height: isCursor ? 18 : 12,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  padding: 0,
                  background: reached ? (isOpen ? '#2C8C66' : '#F7A501') : '#FFFFFF',
                  border: reached
                    ? `2px solid ${isOpen ? '#2C8C66' : '#DD9001'}`
                    : '2px solid #BFC1B7',
                  boxShadow: isCursor ? '0 0 0 4px rgba(247,165,1,0.2)' : 'none',
                  transition: 'all 250ms cubic-bezier(0.22,1,0.36,1)',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Cursor PR caption */}
      {cursorPr && (
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <code
            style={{
              fontSize: 11,
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              color: '#6C6E63',
              background: '#E5E7E0',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            {cursorPr.id}
          </code>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#151515',
              fontFamily: '"Nunito", system-ui, sans-serif',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cursorPr.title}
          </span>
        </div>
      )}

      <style>{`
        @keyframes prPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}

// ─── Small control-button style helpers ───────────────────────────────────────

function ctrlBtn(_active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 6,
    border: '1px solid #BFC1B7',
    background: '#FFFFFF',
    color: '#4D4F46',
    cursor: 'pointer',
    transition: 'background 75ms',
  };
}

function hoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget as HTMLButtonElement).style.background = '#E5E7E0';
}
function hoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget as HTMLButtonElement).style.background = '#FFFFFF';
}
