/**
 * WikiToc — sticky right-rail in-page table of contents.
 *
 * Tracks the active section via IntersectionObserver on each section heading
 * inside the scroll container, and highlights the matching TOC entry with the
 * yellow active-anchor treatment. Clicking an entry smooth-scrolls to it.
 *
 * Hidden when fewer than 3 sections exist (per spec) or on narrow widths.
 */

import { useEffect, useState } from 'react';

export interface TocItem {
  anchor: string;
  label: string;
}

interface Props {
  items: TocItem[];
  /** The scrollable container that holds the section headings. */
  scrollRef: React.RefObject<HTMLElement>;
  /** Re-arm the observer when the page (node id) changes. */
  resetKey: string | null;
}

export function WikiToc({ items, scrollRef, resetKey }: Props) {
  const [active, setActive] = useState<string | null>(items[0]?.anchor ?? null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || items.length === 0) return;

    const headings = items
      .map((it) => root.querySelector<HTMLElement>(`#${CSS.escape(it.anchor)}`))
      .filter((el): el is HTMLElement => el !== null);

    if (headings.length === 0) return;

    setActive(items[0].anchor);

    const observer = new IntersectionObserver(
      (entries) => {
        // Choose the topmost heading currently intersecting; fall back to the
        // last one scrolled past.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActive(visible[0].target.id);
        }
      },
      {
        root,
        // Bias the trigger band to the upper portion of the viewport.
        rootMargin: '-52px 0px -65% 0px',
        threshold: 0,
      },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
    // resetKey forces re-arm when navigating to a different wiki page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, scrollRef, resetKey]);

  if (items.length < 3) return null;

  const handleClick = (e: React.MouseEvent, anchor: string) => {
    e.preventDefault();
    const root = scrollRef.current;
    const target = root?.querySelector<HTMLElement>(`#${CSS.escape(anchor)}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActive(anchor);
    }
  };

  return (
    <nav className="sticky top-0 hidden w-40 shrink-0 self-start border-l border-ph-border-soft py-6 pl-4 lg:block">
      <p className="mb-3 font-sans text-[11px] font-bold uppercase tracking-widest text-ph-ash">
        On this page
      </p>
      <ul className="space-y-1">
        {items.map((item) => {
          const isActive = active === item.anchor;
          return (
            <li key={item.anchor}>
              <a
                href={`#${item.anchor}`}
                onClick={(e) => handleClick(e, item.anchor)}
                className={[
                  'block py-0.5 text-[12px] leading-snug transition-colors',
                  isActive
                    ? '-ml-px border-l-2 border-ph-yellow pl-2 font-semibold text-ph-ink'
                    : 'pl-2 text-ph-mute hover:text-ph-body',
                ].join(' ')}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
