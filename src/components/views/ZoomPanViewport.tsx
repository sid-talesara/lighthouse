/**
 * ZoomPanViewport — a lightweight, dependency-free pan/zoom surface.
 *
 * Wraps arbitrary children (here: the aligned flow diagram) in a viewport that
 * supports:
 *   • wheel / trackpad-pinch zoom toward the cursor,
 *   • click-and-drag panning (grab / grabbing cursor),
 *   • on-screen controls: zoom in, zoom out, reset/fit,
 *   • programmatic "focus" on a child element (used to keep the active step in
 *     view as the walkthrough advances).
 *
 * It is intentionally generic so the Flows view owns no transform math. The
 * transform is a single `translate(x,y) scale(k)` applied to an inner layer.
 *
 * PostHog-flat styling: cream inset canvas, white control cluster, olive
 * borders, yellow active accents — matched to docs/posthog-design-spec.md.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.6;
const ZOOM_STEP = 1.2;

interface Transform {
  x: number;
  y: number;
  k: number;
}

export interface ZoomPanHandle {
  /** Reset to a fit-to-content transform (centered, scale clamped). */
  reset: () => void;
  /**
   * Smoothly bring a child rect (in content coordinates) into the centre of the
   * viewport at a comfortable zoom. Coordinates are relative to the content
   * layer's own box (top-left = 0,0).
   */
  focusRect: (rect: { x: number; y: number; width: number; height: number }) => void;
}

interface Props {
  /** Intrinsic content size (px) used for initial fit + focus math. */
  contentWidth: number;
  contentHeight: number;
  /** Min viewport height. */
  height?: number;
  children: React.ReactNode;
}

function clampScale(k: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));
}

export const ZoomPanViewport = forwardRef<ZoomPanHandle, Props>(function ZoomPanViewport(
  { contentWidth, contentHeight, height = 460, children },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [animating, setAnimating] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);

  // ── Fit content into the viewport (centered) ────────────────────────────────
  const computeFit = useCallback((): Transform => {
    const el = viewportRef.current;
    if (!el || contentWidth <= 0 || contentHeight <= 0) return { x: 0, y: 0, k: 1 };
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const pad = 28;
    const k = clampScale(
      Math.min((vw - pad * 2) / contentWidth, (vh - pad * 2) / contentHeight, 1.1),
    );
    const x = (vw - contentWidth * k) / 2;
    const y = Math.max(pad, (vh - contentHeight * k) / 2);
    return { x, y, k };
  }, [contentWidth, contentHeight]);

  const reset = useCallback(() => {
    setAnimating(true);
    setTransform(computeFit());
    window.setTimeout(() => setAnimating(false), 320);
  }, [computeFit]);

  const focusRect = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      const el = viewportRef.current;
      if (!el) return;
      const vw = el.clientWidth;
      const vh = el.clientHeight;
      setTransform((prev) => {
        const k = clampScale(Math.max(prev.k, 0.85));
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const x = vw / 2 - cx * k;
        const y = vh / 2 - cy * k;
        return { x, y, k };
      });
      setAnimating(true);
      window.setTimeout(() => setAnimating(false), 320);
    },
    [],
  );

  useImperativeHandle(ref, () => ({ reset, focusRect }), [reset, focusRect]);

  // ── Initial fit (and refit when content size changes) ──────────────────────
  useEffect(() => {
    setTransform(computeFit());
  }, [computeFit]);

  // ── Wheel zoom toward cursor ───────────────────────────────────────────────
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setTransform((prev) => {
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        const k = clampScale(prev.k * factor);
        if (k === prev.k) return prev;
        // Keep the point under the cursor stable.
        const x = px - ((px - prev.x) * k) / prev.k;
        const y = py - ((py - prev.y) * k) / prev.k;
        return { x, y, k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Drag-to-pan ────────────────────────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        ox: transform.x,
        oy: transform.y,
      };
      setIsDragging(true);
    },
    [transform.x, transform.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setTransform((prev) => ({
      ...prev,
      x: d.ox + (e.clientX - d.startX),
      y: d.oy + (e.clientY - d.startY),
    }));
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    setTransform((prev) => {
      const k = clampScale(prev.k * factor);
      if (k === prev.k) return prev;
      const x = vw / 2 - ((vw / 2 - prev.x) * k) / prev.k;
      const y = vh / 2 - ((vh / 2 - prev.y) * k) / prev.k;
      return { x, y, k };
    });
    setAnimating(true);
    window.setTimeout(() => setAnimating(false), 200);
  }, []);

  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      style={{
        position: 'relative',
        height,
        background:
          'radial-gradient(circle, #D7D9CF 1px, transparent 1px) 0 0 / 20px 20px, #E8E9E2',
        border: '1px solid #BFC1B7',
        borderRadius: 6,
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
    >
      {/* Transformed content layer */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: contentWidth,
          height: contentHeight,
          transformOrigin: '0 0',
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
          transition: animating
            ? 'transform 300ms cubic-bezier(0.4,0,0.2,1)'
            : 'none',
          willChange: 'transform',
        }}
      >
        {children}
      </div>

      {/* Zoom controls */}
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          display: 'flex',
          flexDirection: 'column',
          background: '#FFFFFF',
          border: '1px solid #BFC1B7',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <ZoomBtn label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
          <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          </svg>
        </ZoomBtn>
        <div style={{ height: 1, background: '#BFC1B7' }} />
        <ZoomBtn label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 8h10" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          </svg>
        </ZoomBtn>
        <div style={{ height: 1, background: '#BFC1B7' }} />
        <ZoomBtn label="Fit to view" onClick={reset}>
          <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M5 2H2v3M11 2h3v3M5 14H2v-3M11 14h3v-3"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </ZoomBtn>
      </div>

      {/* Zoom % readout */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          padding: '3px 8px',
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #BFC1B7',
          borderRadius: 9999,
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 10,
          fontWeight: 500,
          color: '#6C6E63',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {Math.round(transform.k * 100)}% · drag to pan · scroll to zoom
      </div>
    </div>
  );
});

function ZoomBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        border: 'none',
        background: '#FFFFFF',
        color: '#4D4F46',
        cursor: 'pointer',
        transition: 'background 75ms',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = '#E5E7E0';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = '#FFFFFF';
      }}
    >
      {children}
    </button>
  );
}
