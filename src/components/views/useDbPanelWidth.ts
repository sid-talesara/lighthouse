/**
 * useDbPanelWidth — persisted, clamped width for the DatabaseView table
 * detail panel.
 *
 * The panel holds the columns list AND an embedded CodeViewer for the schema
 * source. At the old fixed 300px the code was clipped and unreadable, so the
 * panel is now user-resizable via a drag handle. The chosen width is clamped
 * to [MIN, MAX] and persisted to localStorage so it survives reloads.
 */

import { useCallback, useState } from 'react';

export const DB_PANEL_MIN_WIDTH = 300;
export const DB_PANEL_MAX_WIDTH = 760;
export const DB_PANEL_DEFAULT_WIDTH = 380;

const STORAGE_KEY = 'lighthouse.dbPanelWidth';

export function clampDbPanelWidth(w: number): number {
  if (!Number.isFinite(w)) return DB_PANEL_DEFAULT_WIDTH;
  return Math.min(DB_PANEL_MAX_WIDTH, Math.max(DB_PANEL_MIN_WIDTH, Math.round(w)));
}

function readStoredWidth(): number {
  if (typeof window === 'undefined') return DB_PANEL_DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DB_PANEL_DEFAULT_WIDTH;
    const parsed = Number.parseInt(raw, 10);
    return clampDbPanelWidth(parsed);
  } catch {
    return DB_PANEL_DEFAULT_WIDTH;
  }
}

export function useDbPanelWidth(): {
  width: number;
  setWidth: (w: number) => void;
} {
  const [width, setWidthState] = useState<number>(readStoredWidth);

  const setWidth = useCallback((w: number) => {
    const clamped = clampDbPanelWidth(w);
    setWidthState(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // ignore persistence failures (e.g. private mode)
    }
  }, []);

  return { width, setWidth };
}
