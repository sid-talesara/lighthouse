/**
 * Tiny inline icon set (lucide-style line glyphs).
 *
 * The spec references `lucide-react`, but it isn't a project dependency. Rather
 * than add ~50 KB for ~12 glyphs, we hand-roll the handful the wiki needs as
 * stroke-based SVGs that inherit `currentColor` and accept a className.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function Base({ children, className, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconX = (p: IconProps) => (
  <Base {...p}><path d="M18 6 6 18M6 6l12 12" /></Base>
);
export const IconChevronLeft = (p: IconProps) => (
  <Base {...p}><path d="m15 18-6-6 6-6" /></Base>
);
export const IconChevronDown = (p: IconProps) => (
  <Base {...p}><path d="m6 9 6 6 6-6" /></Base>
);
export const IconMapPin = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Base>
);
export const IconFile = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </Base>
);
export const IconCode = (p: IconProps) => (
  <Base {...p}><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></Base>
);
export const IconDatabase = (p: IconProps) => (
  <Base {...p}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
    <path d="M3 12a9 3 0 0 0 18 0" />
  </Base>
);
export const IconKey = (p: IconProps) => (
  <Base {...p}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" />
  </Base>
);
export const IconLink = (p: IconProps) => (
  <Base {...p}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
  </Base>
);
export const IconWorkflow = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="6" height="6" rx="1" />
    <rect x="15" y="15" width="6" height="6" rx="1" />
    <path d="M6 9v3a3 3 0 0 0 3 3h6" />
  </Base>
);
export const IconInfo = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></Base>
);
export const IconAlert = (p: IconProps) => (
  <Base {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </Base>
);
export const IconArrowRight = (p: IconProps) => (
  <Base {...p}><path d="M5 12h14M12 5l7 7-7 7" /></Base>
);
export const IconLayers = (p: IconProps) => (
  <Base {...p}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
  </Base>
);
export const IconClick = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 9l5 12 1.8-5.2L21 14 9 9Z" />
    <path d="M7.2 2.2 8 5M5 7.2 2.2 8M2.2 16 5 15.2M16 2.2 15.2 5" />
  </Base>
);
export const IconFileQuestion = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M10 14a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.6M12 19h.01" />
  </Base>
);
export const IconGitPullRequest = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
    <path d="M6 9v6M13 6h3a2 2 0 0 1 2 2v7" /><path d="m15 4 3 2-3 2" />
  </Base>
);
