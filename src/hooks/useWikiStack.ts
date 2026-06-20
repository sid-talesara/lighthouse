/**
 * useWikiStack — history stack for the Module Wiki drawer.
 *
 * The drawer is a single surface that navigates between modules (via neighbor
 * pills, flow steps, PR links, breadcrumbs). We model that as a stack of node
 * ids so "← Back" pops to the previous page, exactly like browser history but
 * scoped to the drawer and without touching the URL.
 *
 *   open(id)   — open the drawer at `id` (resets the stack to a single entry).
 *   push(id)   — navigate to `id`, keeping history (Back returns here).
 *   back()     — pop one entry.
 *   close()    — clear the stack (drawer closed when currentId === null).
 */

import { useCallback, useMemo, useState } from 'react';

export interface WikiStack {
  /** The id currently shown, or null when the drawer is closed. */
  currentId: string | null;
  /** True when there is somewhere to go Back to. */
  canGoBack: boolean;
  /** Whole stack, oldest → newest (for debugging / depth checks). */
  stack: string[];
  open: (id: string) => void;
  push: (id: string) => void;
  back: () => void;
  close: () => void;
}

export function useWikiStack(): WikiStack {
  const [stack, setStack] = useState<string[]>([]);

  const open = useCallback((id: string) => setStack([id]), []);

  const push = useCallback(
    (id: string) =>
      setStack((s) => {
        // No-op if we're already here (avoids dead Back steps).
        if (s.length > 0 && s[s.length - 1] === id) return s;
        return [...s, id];
      }),
    [],
  );

  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const close = useCallback(() => setStack([]), []);

  const currentId = stack.length > 0 ? stack[stack.length - 1] : null;

  return useMemo(
    () => ({ currentId, canGoBack: stack.length > 1, stack, open, push, back, close }),
    [currentId, stack, open, push, back, close],
  );
}
