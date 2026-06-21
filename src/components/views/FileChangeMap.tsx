/**
 * FileChangeMap — a CodeSee-style visual diff-map of a PR's changed FILES.
 *
 * GitHub lists changed files flat. This shows them as a *map of the architecture*:
 * every changed file resolved to its owning module and grouped under its feature
 * area (cluster), color-coded by change kind (added / modified / removed). At a
 * glance you see WHICH parts of the system this PR rewrote and how heavily.
 *
 * Each cluster is a labeled panel; inside it, modules; inside those, file chips.
 * Clicking a file chip calls onOpenFile(path) so the parent can show its source
 * via CodeViewer. Clicking a module mirrors the selection onto the Architecture
 * map via onPickNode.
 *
 * Zoom / pan: the whole map lives inside a transform layer driven by wheel-zoom
 * (anchored at the cursor) and drag-to-pan, with +/−/fit controls. The layer is
 * plain HTML so labels stay crisp at any zoom. Per the design rules we never put
 * a transform inside a keyframe on a positioned element — the entrance animation
 * fades opacity on an inner layer only; the pan/zoom transform is applied
 * imperatively, outside any animation.
 *
 * PostHog light theme throughout.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeKind } from '../../types/lighthouse';
import type { FileChangeMap as FileChangeMapData } from './impact-util';

const FONT_UI = '"Nunito", system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';

const CHANGE: Record<ChangeKind, { fg: string; bg: string; dot: string; label: string }> = {
  added: { fg: '#2C8C66', bg: '#EAF6EF', dot: '#2C8C66', label: 'Added' },
  modified: { fg: '#946100', bg: '#FBF1DA', dot: '#DC9300', label: 'Modified' },
  removed: { fg: '#CD4239', bg: '#FBE6E4', dot: '#CD4239', label: 'Removed' },
};

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.4;

interface Props {
  map: FileChangeMapData;
  selectedNodeId: string | null;
  activeFilePath: string | null;
  /** Open a file's source (parent renders CodeViewer). */
  onOpenFile: (path: string) => void;
  /** Mirror a module selection onto the Architecture map. */
  onPickNode: (id: string) => void;
  /** Bump to re-run the entrance fade + reset the viewport (new PR selected). */
  replayKey: string;
}

function CountPills({ counts }: { counts: Record<ChangeKind, number> }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {(Object.keys(CHANGE) as ChangeKind[])
        .filter((k) => counts[k] > 0)
        .map((k) => (
          <span
            key={k}
            title={`${counts[k]} ${CHANGE[k].label.toLowerCase()}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontWeight: 800,
              fontFamily: FONT_UI,
              color: CHANGE[k].fg,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 2, background: CHANGE[k].dot }} />
            {counts[k]}
          </span>
        ))}
    </span>
  );
}

function ZoomBtn({ label, onClick, ariaLabel }: { label: string; onClick: () => void; ariaLabel: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FFFFFF',
        border: '1px solid #BFC1B7',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 700,
        color: '#4D4F46',
        fontFamily: FONT_UI,
        lineHeight: 1,
        padding: 0,
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#E5E7E0')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#FFFFFF')}
    >
      {label}
    </button>
  );
}

export function FileChangeMap({
  map,
  selectedNodeId,
  activeFilePath,
  onOpenFile,
  onPickNode,
  replayKey,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [shown, setShown] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Entrance fade + viewport reset on new PR. (Opacity only — no transform keyframe.)
  useEffect(() => {
    setShown(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    const t = setTimeout(() => setShown(true), 20);
    return () => clearTimeout(t);
  }, [replayKey]);

  // Wheel-zoom anchored at the cursor.
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const vp = viewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setZoom((z) => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
        const ratio = next / z;
        setPan((p) => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }));
        return next;
      });
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Ignore drags that start on interactive elements (let clicks through).
      if ((e.target as HTMLElement).closest('[data-interactive]')) return;
      drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pan],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    drag.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  }, []);

  const adjustZoom = useCallback((dir: 1 | -1) => {
    const vp = viewportRef.current;
    const cx = vp ? vp.clientWidth / 2 : 0;
    const cy = vp ? vp.clientHeight / 2 : 0;
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, dir === 1 ? z * 1.2 : z / 1.2));
      const ratio = next / z;
      setPan((p) => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }));
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        border: '1px solid #BFC1B7',
        borderRadius: 6,
        background: '#FBFBF9',
        overflow: 'hidden',
        height: 420,
      }}
    >
      {/* Zoom / pan controls */}
      <div
        data-interactive
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 5,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <ZoomBtn label="+" ariaLabel="Zoom in" onClick={() => adjustZoom(1)} />
        <ZoomBtn label="−" ariaLabel="Zoom out" onClick={() => adjustZoom(-1)} />
        <ZoomBtn label="⤢" ariaLabel="Reset view" onClick={resetView} />
      </div>

      {/* Hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 12,
          zIndex: 5,
          fontSize: 10.5,
          color: '#9B9C92',
          fontFamily: FONT_UI,
          fontWeight: 600,
          letterSpacing: '0.02em',
          pointerEvents: 'none',
        }}
      >
        Scroll to zoom · drag to pan · click a file to read it
      </div>

      {/* Viewport */}
      <div
        ref={viewportRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        style={{ position: 'absolute', inset: 0, cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        {/* Transform layer — pan/zoom applied imperatively (not via keyframe). */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          {/* Inner fade layer — opacity-only entrance, never transform here. */}
          <div
            style={{
              padding: 18,
              opacity: shown ? 1 : 0,
              transition: 'opacity 220ms ease-out',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              alignItems: 'flex-start',
              width: 'max-content',
              maxWidth: 980,
            }}
          >
            {map.clusters.map((c) => (
              <div
                key={c.clusterId ?? '__none__'}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #BFC1B7',
                  borderRadius: 8,
                  padding: 12,
                  width: 300,
                  flexShrink: 0,
                }}
              >
                {/* Cluster header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 800,
                      fontFamily: FONT_UI,
                      color: '#151515',
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.clusterLabel}
                  </span>
                  <span style={{ fontSize: 10, color: '#9B9C92', fontFamily: FONT_UI, fontWeight: 700 }}>
                    {c.fileCount} {c.fileCount === 1 ? 'file' : 'files'}
                  </span>
                </div>

                {/* Modules */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {c.modules.map((m) => (
                    <div
                      key={m.nodeId ?? '__nomod__'}
                      style={{
                        background: selectedNodeId && selectedNodeId === m.nodeId ? 'rgba(247,165,1,0.07)' : '#FBFBF9',
                        border:
                          selectedNodeId && selectedNodeId === m.nodeId ? '1px solid #F7A501' : '1px solid #E5E7E0',
                        borderRadius: 6,
                        padding: 8,
                      }}
                    >
                      <button
                        data-interactive
                        onClick={() => m.nodeId && onPickNode(m.nodeId)}
                        disabled={!m.nodeId}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'transparent',
                          border: 'none',
                          padding: '0 0 7px',
                          cursor: m.nodeId ? 'pointer' : 'default',
                          font: 'inherit',
                        }}
                        title={m.nodeId ? 'Show this module on the map' : undefined}
                      >
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            fontFamily: FONT_UI,
                            color: '#4D4F46',
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.nodeLabel}
                        </span>
                        <CountPills counts={m.counts} />
                      </button>

                      {/* File chips */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {m.files.map((f) => {
                          const s = CHANGE[f.change];
                          const isActive = activeFilePath === f.path;
                          return (
                            <button
                              key={f.path}
                              data-interactive
                              onClick={() => onOpenFile(f.path)}
                              title={`${s.label} · ${f.path}`}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 7,
                                width: '100%',
                                textAlign: 'left',
                                padding: '4px 7px',
                                borderRadius: 4,
                                background: isActive ? s.bg : 'transparent',
                                border: isActive ? `1px solid ${s.dot}` : '1px solid transparent',
                                cursor: 'pointer',
                                font: 'inherit',
                              }}
                              onMouseEnter={(e) => {
                                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = s.bg;
                              }}
                              onMouseLeave={(e) => {
                                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                              }}
                            >
                              <span
                                style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }}
                              />
                              <span
                                style={{
                                  fontSize: 11,
                                  fontFamily: FONT_MONO,
                                  color: '#151515',
                                  flex: 1,
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {f.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 12,
          zIndex: 5,
          display: 'flex',
          gap: 12,
          background: 'rgba(251,251,249,0.9)',
          border: '1px solid #DCDFD2',
          borderRadius: 6,
          padding: '4px 9px',
          pointerEvents: 'none',
        }}
      >
        {(Object.keys(CHANGE) as ChangeKind[]).map((k) => (
          <span
            key={k}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#6C6E63', fontFamily: FONT_UI, fontWeight: 600 }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, background: CHANGE[k].dot }} />
            {CHANGE[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}
