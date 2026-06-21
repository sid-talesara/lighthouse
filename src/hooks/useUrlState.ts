/**
 * useUrlState — hand-rolled deep-linking via URLSearchParams + History API.
 *
 * URL scheme (query-param only, no path routing to avoid dev-server rewrites):
 *   ?v=1                             → app entered (absent = onboarding)
 *   ?v=1&tab=<viewId>                → active tab (omit for default 'architecture')
 *   &node=<id>                       → selected node
 *   &wiki=1                          → module wiki drawer is open for `node`
 *
 * History strategy:
 *   pushState  — entering the app, tab change, wiki open/close
 *   replaceState — plain node selection changes (avoids spamming history)
 *
 * Internal wiki navigation (push between neighbour nodes) is handled by
 * wikiStack internally; we only track the *entry* node + open/closed state.
 * When the wiki is open, `node` reflects wikiStack.currentId (the live page),
 * updated via replaceState so back-button still collapses the wiki correctly.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ViewId } from '../components/views/viewContract';

const VALID_VIEWS: ViewId[] = [
  'architecture',
  'wiki',
  'files',
  'dependencies',
  'flows',
  'changes',
  'services',
  'database',
  'functions',
];

function isValidView(s: string): s is ViewId {
  return (VALID_VIEWS as string[]).includes(s);
}

/** Parse the current URL search string into structured state. */
export interface UrlSnapshot {
  entered: boolean;
  tab: ViewId | null;
  nodeId: string | null;
  wikiOpen: boolean;
}

export function parseUrl(search: string): UrlSnapshot {
  const p = new URLSearchParams(search);
  const entered = p.get('v') === '1';
  const rawTab = p.get('tab');
  const tab = rawTab && isValidView(rawTab) ? rawTab : null;
  const nodeId = p.get('node') ?? null;
  const wikiOpen = entered && p.get('wiki') === '1' && nodeId !== null;
  return { entered, tab, nodeId, wikiOpen };
}

/** Build a URLSearchParams string from pieces (omit defaults to keep URLs clean). */
export function buildSearch({
  entered,
  tab,
  nodeId,
  wikiOpen,
}: {
  entered: boolean;
  tab: ViewId;
  nodeId: string | null;
  wikiOpen: boolean;
}): string {
  const p = new URLSearchParams();
  if (!entered) return p.toString();
  p.set('v', '1');
  if (tab !== 'architecture') p.set('tab', tab);
  const nodeForUrl = nodeId;
  if (nodeForUrl) {
    p.set('node', nodeForUrl);
    if (wikiOpen) p.set('wiki', '1');
  }
  return p.toString();
}

export interface UseUrlStateOptions {
  entered: boolean;
  activeView: ViewId;
  selectedNodeId: string | null;
  wikiCurrentId: string | null;
  wikiOpen: boolean;

  // Setters — called by popstate to restore state
  setEntered: (v: boolean) => void;
  setActiveView: (v: ViewId) => void;
  setSelectedNodeId: (v: string | null) => void;
  openWiki: (id: string) => void;
  closeWiki: () => void;
}

/**
 * Manages bidirectional sync between app state and the browser URL.
 *
 * - On mount: reads initial URL and calls setters if URL differs from defaults.
 * - On state change: pushes or replaces URL.
 * - On popstate: reads URL and restores state.
 *
 * Returns a stable `copyLink` function for the "Copy link" affordance.
 */
export function useUrlState({
  entered,
  activeView,
  selectedNodeId,
  wikiCurrentId,
  wikiOpen,
  setEntered,
  setActiveView,
  setSelectedNodeId,
  openWiki,
  closeWiki,
}: UseUrlStateOptions): { copyLink: () => void } {
  // Track the "previous" URL to determine push vs. replace and avoid loops.
  const prevSearchRef = useRef<string | null>(null);

  // ── Sync app state → URL ─────────────────────────────────────────────
  useEffect(() => {
    // The node shown in the URL: when wiki is open, track the live wiki page;
    // otherwise track the selected node.
    const nodeForUrl = wikiOpen ? wikiCurrentId : selectedNodeId;

    const nextSearch = buildSearch({
      entered,
      tab: activeView,
      nodeId: nodeForUrl,
      wikiOpen,
    });

    const currentSearch = window.location.search.replace(/^\?/, '');

    // Nothing changed — skip (prevents spurious history entries on first render)
    if (nextSearch === currentSearch) {
      prevSearchRef.current = nextSearch;
      return;
    }

    const prev = prevSearchRef.current;
    prevSearchRef.current = nextSearch;

    const nextUrl = nextSearch ? `?${nextSearch}` : window.location.pathname;

    if (prev === null) {
      // First write on mount: replaceState so we don't add an entry before
      // the user has done anything.
      window.history.replaceState(null, '', nextUrl);
      return;
    }

    // Determine push vs. replace:
    //  pushState  — meaningful navigation: entered changed, tab changed,
    //               wiki open/close transitioned.
    //  replaceState — node selection change only (no wiki transition).
    const prevSnap = parseUrl(prev ? `?${prev}` : '');
    const nextSnap = parseUrl(nextSearch ? `?${nextSearch}` : '');

    const isMeaningful =
      prevSnap.entered !== nextSnap.entered ||
      (prevSnap.tab ?? 'architecture') !== (nextSnap.tab ?? 'architecture') ||
      prevSnap.wikiOpen !== nextSnap.wikiOpen;

    if (isMeaningful) {
      window.history.pushState(null, '', nextUrl);
    } else {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [entered, activeView, selectedNodeId, wikiCurrentId, wikiOpen]);

  // ── Popstate: restore state from URL ─────────────────────────────────
  useEffect(() => {
    function onPopState() {
      const snap = parseUrl(window.location.search);
      prevSearchRef.current = window.location.search.replace(/^\?/, '');

      setEntered(snap.entered);
      if (!snap.entered) return; // onboarding — nothing else to restore

      setActiveView(snap.tab ?? 'architecture');
      setSelectedNodeId(snap.nodeId);

      if (snap.wikiOpen && snap.nodeId) {
        openWiki(snap.nodeId);
      } else {
        closeWiki();
      }
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setEntered, setActiveView, setSelectedNodeId, openWiki, closeWiki]);

  // ── Copy-link helper ──────────────────────────────────────────────────
  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).catch(() => {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = window.location.href;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  }, []);

  return { copyLink };
}
