/**
 * LighthouseIllustration — a flat, posterised SVG illustration
 * in PostHog's sticker/hand-drawn motif.
 *
 * Evokes: a lighthouse on a rocky coastline with a sweeping beam.
 * Style: flat color blocks, thick olive borders, no gradients, no
 * drop-shadows — the same aesthetic PostHog uses for Max the Hedgehog.
 */

export function LighthouseIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* ── Beam rays (behind everything) ─────────────────────── */}
      {/* Outer glow triangle */}
      <polygon
        points="110,62 185,10 210,80"
        fill="#F7A501"
        opacity="0.13"
      />
      <polygon
        points="110,62 175,5 200,65"
        fill="#F7A501"
        opacity="0.17"
      />
      {/* Core beam */}
      <polygon
        points="110,62 165,8 190,58"
        fill="#F7A501"
        opacity="0.28"
      />
      {/* Tight beam highlight */}
      <polygon
        points="110,62 155,12 170,50"
        fill="#F7A501"
        opacity="0.45"
      />

      {/* ── Sea / water ───────────────────────────────────────── */}
      <ellipse cx="110" cy="158" rx="105" ry="18" fill="#DCEAF6" />
      {/* Wave lines */}
      <path
        d="M18 155 Q40 150 62 155 Q84 160 106 155 Q128 150 150 155 Q172 160 194 155"
        stroke="#2C84E0"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M30 163 Q55 158 80 163 Q105 168 130 163 Q155 158 180 163"
        stroke="#2C84E0"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.3"
      />

      {/* ── Rocky base ────────────────────────────────────────── */}
      <ellipse cx="108" cy="152" rx="52" ry="14" fill="#4D4F46" />
      <ellipse cx="108" cy="148" rx="46" ry="10" fill="#6C6E63" />
      {/* Rock texture bumps */}
      <ellipse cx="82"  cy="144" rx="14" ry="6"  fill="#4D4F46" />
      <ellipse cx="134" cy="144" rx="14" ry="6"  fill="#4D4F46" />
      <ellipse cx="108" cy="142" rx="18" ry="7"  fill="#9B9C92" />

      {/* ── Tower body ────────────────────────────────────────── */}
      {/* Main tower — tapers slightly */}
      <path
        d="M94 140 L90 90 L130 90 L126 140 Z"
        fill="#FFFFFF"
        stroke="#151515"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Tower stripes (PostHog loves graphic banding) */}
      <path
        d="M91.2 126 L90.7 120 L129.3 120 L128.8 126 Z"
        fill="#F7A501"
        opacity="0.7"
      />
      <path
        d="M92.3 110 L91.8 104 L128.2 104 L127.7 110 Z"
        fill="#F7A501"
        opacity="0.7"
      />
      {/* Door arch */}
      <path
        d="M102 140 L102 130 Q110 124 118 130 L118 140 Z"
        fill="#151515"
      />

      {/* ── Lamp house (the light chamber) ───────────────────── */}
      <rect
        x="87"
        y="72"
        width="46"
        height="20"
        rx="2"
        fill="#23251D"
        stroke="#151515"
        strokeWidth="2"
      />
      {/* Glass panels — horizontal dividers */}
      <line x1="96"  y1="72" x2="96"  y2="92" stroke="#BFC1B7" strokeWidth="1" />
      <line x1="110" y1="72" x2="110" y2="92" stroke="#BFC1B7" strokeWidth="1" />
      <line x1="124" y1="72" x2="124" y2="92" stroke="#BFC1B7" strokeWidth="1" />
      {/* Lamp glow inside */}
      <rect x="88" y="73" width="44" height="18" rx="1" fill="#F7A501" opacity="0.22" />

      {/* ── Gallery / walkway ─────────────────────────────────── */}
      <rect
        x="83"
        y="68"
        width="54"
        height="6"
        rx="1"
        fill="#FFFFFF"
        stroke="#151515"
        strokeWidth="1.5"
      />
      {/* Railing posts */}
      {[86, 92, 98, 104, 110, 116, 122, 128, 134].map((x) => (
        <line
          key={x}
          x1={x} y1="68"
          x2={x} y2="63"
          stroke="#151515"
          strokeWidth="1.2"
        />
      ))}
      {/* Top rail */}
      <line x1="83" y1="63" x2="137" y2="63" stroke="#151515" strokeWidth="1.5" />

      {/* ── Roof / lantern cap ────────────────────────────────── */}
      <polygon
        points="107,46 133,63 87,63"
        fill="#F54E00"
        stroke="#151515"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Finial */}
      <line x1="107" y1="46" x2="107" y2="38" stroke="#151515" strokeWidth="2" strokeLinecap="round" />
      <circle cx="107" cy="36" r="3" fill="#F7A501" stroke="#151515" strokeWidth="1.5" />

      {/* ── Dotted coastline hint ──────────────────────────────── */}
      {[22, 30, 38, 46, 168, 176, 184, 192].map((x) => (
        <circle key={x} cx={x} cy="152" r="1.5" fill="#BFC1B7" opacity="0.6" />
      ))}

      {/* ── Stars / sparkle accents ───────────────────────────── */}
      <circle cx="178" cy="25" r="1.5" fill="#F7A501" opacity="0.8" />
      <circle cx="195" cy="38" r="1"   fill="#F7A501" opacity="0.6" />
      <circle cx="165" cy="18" r="1"   fill="#F7A501" opacity="0.5" />
      {/* Small cross sparkle */}
      <g transform="translate(183,15)" opacity="0.7">
        <line x1="-3" y1="0" x2="3" y2="0" stroke="#F7A501" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="0" y1="-3" x2="0" y2="3" stroke="#F7A501" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
