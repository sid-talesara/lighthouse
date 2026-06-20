/**
 * ViewPlaceholder — shared PostHog-style "card on cream" shell for the
 * Wave A placeholder views (Files / Dependencies / Flows). Wave B replaces
 * each view's real content; this just gives a titled, themed scaffold with
 * a short value line and an optional preview list so the tab isn't empty.
 */

import type { ReactNode } from 'react';

interface ViewPlaceholderProps {
  emoji: string;
  title: string;
  blurb: string;
  /** Small uppercase tag shown above the title (e.g. "Wave B"). */
  tag?: string;
  children?: ReactNode;
}

export function ViewPlaceholder({
  emoji,
  title,
  blurb,
  tag = 'Coming next',
  children,
}: ViewPlaceholderProps) {
  return (
    <div className="lh-scroll h-full w-full overflow-y-auto bg-ph-canvas px-6 py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div className="rounded-ph border border-ph-border bg-ph-surface p-8">
          <div className="font-sans text-label uppercase tracking-wider text-ph-ash">
            {tag}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-2xl" aria-hidden>
              {emoji}
            </span>
            <h2 className="font-display text-display-lg text-ph-ink">{title}</h2>
          </div>
          <p className="mt-2 font-body text-body-md text-ph-body">{blurb}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
