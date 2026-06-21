/**
 * WikiTOC — right-rail in-page table of contents with scrollspy.
 * Uses IntersectionObserver to track which heading is active.
 */

import { useEffect, useRef, useState } from 'react';

export interface TocItem {
  id: string;   // DOM id (anchor)
  label: string;
  level: number; // 1 = h2, 2 = h3
}

interface Props {
  items: TocItem[];
  scrollContainerId: string;
}

export function WikiTOC({ items, scrollContainerId }: Props) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (items.length === 0) return;

    const container = document.getElementById(scrollContainerId);
    if (!container) return;

    observerRef.current?.disconnect();

    const headings: Element[] = items
      .map(({ id }) => document.getElementById(id))
      .filter(Boolean) as Element[];

    // Track the topmost visible heading
    const visible = new Map<string, number>();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.boundingClientRect.top);
          } else {
            visible.delete(entry.target.id);
          }
        });
        if (visible.size > 0) {
          // pick the one closest to the top
          const sorted = [...visible.entries()].sort((a, b) => a[1] - b[1]);
          setActiveId(sorted[0][0]);
        }
      },
      {
        root: container,
        rootMargin: '-8px 0px -60% 0px',
        threshold: 0,
      }
    );

    headings.forEach((h) => observerRef.current!.observe(h));

    return () => observerRef.current?.disconnect();
  }, [items, scrollContainerId]);

  if (items.length < 3) return null;

  return (
    <nav
      className="sticky top-0 w-44 flex-shrink-0 self-start pl-4 border-l border-ph-border-soft hidden xl:block"
      style={{ paddingTop: '24px' }}
    >
      <p className="font-sans text-label font-bold text-ph-ash uppercase tracking-widest mb-3">
        On this page
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(item.id);
                const container = document.getElementById(scrollContainerId);
                if (el && container) {
                  container.scrollTo({
                    top: el.offsetTop - 24,
                    behavior: 'smooth',
                  });
                }
                setActiveId(item.id);
              }}
              className={[
                'block text-[12px] py-0.5 leading-snug transition-colors',
                item.level === 2 ? 'pl-3' : 'pl-5',
                activeId === item.id
                  ? 'text-ph-ink font-semibold border-l-2 border-ph-yellow -ml-px'
                  : 'text-ph-mute hover:text-ph-body',
              ].join(' ')}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
