/**
 * DesktopIcon — a single "app icon" card on the PostHog-style home desktop.
 *
 * Each card shows:
 *  - a flat SVG glyph (custom per mode)
 *  - a bold label
 *  - a one-line teaser / example
 *  - optional click handler
 */

interface DesktopIconProps {
  glyph: React.ReactNode;
  label: string;
  teaser: string;
  onClick?: () => void;
  /** Highlight the card (e.g. it's the "loaded repo" mode). */
  accent?: boolean;
  /** Faint/disabled style when no data is available yet. */
  muted?: boolean;
}

export function DesktopIcon({
  glyph,
  label,
  teaser,
  onClick,
  accent = false,
  muted = false,
}: DesktopIconProps) {
  const base =
    'group flex flex-col items-start gap-2 rounded-ph border p-4 transition-all duration-75 cursor-pointer select-none';

  const colorClass = accent
    ? 'border-ph-yellow bg-ph-yellow/10 hover:bg-ph-yellow/20 active:translate-y-px'
    : muted
    ? 'border-ph-border bg-ph-surface/60 opacity-60 cursor-default'
    : 'border-ph-border bg-ph-surface hover:border-ph-ash hover:shadow-sm active:translate-y-px';

  return (
    <button
      type="button"
      onClick={muted ? undefined : onClick}
      disabled={muted}
      className={`${base} ${colorClass}`}
      style={{ textAlign: 'left' }}
    >
      {/* Glyph area — fixed-size stamp */}
      <div
        className="flex h-9 w-9 items-center justify-center rounded-ph-sm border border-ph-border bg-ph-canvas"
        style={{ flexShrink: 0 }}
      >
        {glyph}
      </div>

      {/* Label */}
      <span
        className="font-sans font-bold text-ph-ink"
        style={{ fontSize: '0.8125rem', lineHeight: '1.2' }}
      >
        {label}
      </span>

      {/* Teaser */}
      <p
        className="font-sans text-ph-mute"
        style={{ fontSize: '0.6875rem', lineHeight: '1.5', margin: 0 }}
      >
        {teaser}
      </p>
    </button>
  );
}
