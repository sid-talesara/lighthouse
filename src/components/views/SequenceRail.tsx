/**
 * SequenceRail — the guided tour panel (the "detailed" half of the walkthrough).
 *
 * This is no longer a scattered sequence diagram. It is the narrative a new
 * joinee reads to learn the system: a vertical, aligned list of steps in
 * execution order. The active step expands into a full briefing:
 *
 *   • WHAT happens (the plain-language description),
 *   • WHO handles it (module label + owning cluster + deployable service),
 *   • WHERE in the code (function signature + file path),
 *   • HOW control arrived (inbound handoff) and where it goes next (outbound).
 *
 * Inactive steps collapse to a single readable line so the whole flow stays
 * scannable. Clicking any step jumps the walkthrough there (kept in sync with
 * the diagram via the shared `activeStep`).
 */

import type { ResolvedStep } from './flowEngine';

interface Props {
  steps: ResolvedStep[];
  activeStep: number;
  onSelectStep: (stepIndex: number) => void;
}

export function SequenceRail({ steps, activeStep, onSelectStep }: Props) {
  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid #DCDFD2',
          background: '#FAFAF7',
        }}
      >
        <span
          style={{
            fontFamily: '"Nunito", system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#6C6E63',
          }}
        >
          Guided walkthrough — what happens at each step
        </span>
      </div>

      {/* ── Step list ───────────────────────────────────────────────────────── */}
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {steps.map((step, i) => {
          const isActive = i === activeStep;
          const visited = i < activeStep;
          return (
            <li key={step.nodeId + '-' + i}>
              <StepRow
                step={step}
                isActive={isActive}
                visited={visited}
                isLast={i === steps.length - 1}
                onClick={() => onSelectStep(i)}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── One step row ─────────────────────────────────────────────────────────────

function StepRow({
  step,
  isActive,
  visited,
  isLast,
  onClick,
}: {
  step: ResolvedStep;
  isActive: boolean;
  visited: boolean;
  isLast: boolean;
  onClick: () => void;
}) {
  const accent = step.color;
  const medallionBg = isActive ? '#F7A501' : visited ? accent : '#EEEFE9';
  const medallionText = isActive || visited ? '#FFFFFF' : '#9B9C92';

  return (
    <div
      onClick={onClick}
      role="button"
      aria-current={isActive ? 'step' : undefined}
      aria-label={`Step ${step.index + 1}: ${step.label}`}
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 16px',
        cursor: 'pointer',
        background: isActive ? '#FFFBF2' : '#FFFFFF',
        borderLeft: isActive ? '3px solid #F7A501' : '3px solid transparent',
        borderBottom: isLast ? 'none' : '1px solid #DCDFD2',
        transition: 'background 120ms ease-out',
      }}
      onMouseEnter={(e) => {
        if (!isActive)
          (e.currentTarget as HTMLDivElement).style.background = '#FAFAF7';
      }}
      onMouseLeave={(e) => {
        if (!isActive)
          (e.currentTarget as HTMLDivElement).style.background = '#FFFFFF';
      }}
    >
      {/* Rail column: medallion + connector line */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: medallionBg,
            border: `1.5px solid ${isActive ? '#DD9001' : visited ? accent : '#DCDFD2'}`,
            color: medallionText,
            fontFamily: '"Nunito", system-ui, sans-serif',
            fontSize: 12,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {step.index + 1}
        </span>
        {!isLast && (
          <span
            style={{
              flex: 1,
              width: 2,
              marginTop: 4,
              background: visited ? accent : '#DCDFD2',
              borderRadius: 1,
              minHeight: 12,
            }}
          />
        )}
      </div>

      {/* Content column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row: module + cluster + service */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: '"Nunito", system-ui, sans-serif',
              fontSize: 14,
              fontWeight: 800,
              color: '#151515',
            }}
          >
            {step.label}
          </span>
          {step.cluster && <Pill text={step.cluster.label} color={accent} soft />}
          {step.service && <Pill text={step.service.name} color="#6C6E63" />}
        </div>

        {/* Inbound handoff (only when expanded and not the first step) */}
        {isActive && step.inVerb && step.prevLabel && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 6,
              fontFamily: 'system-ui, sans-serif',
              fontSize: 11,
              color: '#9B9C92',
            }}
          >
            <Arrow />
            <span style={{ fontStyle: 'italic' }}>
              {step.prevLabel}{' '}
              <strong style={{ color: '#6C6E63', fontStyle: 'normal' }}>{step.inVerb}</strong>{' '}
              {step.label}
            </span>
          </div>
        )}

        {/* Description — full when active, single line when collapsed */}
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 13,
            lineHeight: 1.6,
            color: isActive ? '#23251D' : '#6C6E63',
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            ...(isActive
              ? {}
              : {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }),
          }}
        >
          {step.description}
        </p>

        {/* Code coordinates — only when expanded */}
        {isActive && (step.fn || step.path) && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 8,
            }}
          >
            {step.fn && (
              <code
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 11,
                  color: '#23251D',
                  background: '#E5E7E0',
                  borderRadius: 4,
                  padding: '2px 7px',
                }}
                title={step.fn.signature ?? step.fn.name}
              >
                {step.fn.name}
                {step.fn.signature ? step.fn.signature : '()'}
              </code>
            )}
            {step.path && (
              <code
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 11,
                  color: '#6C6E63',
                  background: '#F0F0EC',
                  borderRadius: 4,
                  padding: '2px 7px',
                }}
              >
                {step.path}
              </code>
            )}
          </div>
        )}

        {/* Function summary line — only when expanded and available */}
        {isActive && step.fn?.summary && (
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 12,
              lineHeight: 1.5,
              color: '#6C6E63',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {step.fn.summary}
          </p>
        )}

        {/* Outbound handoff — only when expanded and not the last step */}
        {isActive && step.outVerb && step.nextLabel && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid #DCDFD2',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 11,
              color: '#9B9C92',
            }}
          >
            <span>
              then{' '}
              <strong style={{ color: '#6C6E63' }}>{step.outVerb}</strong> →{' '}
              <span style={{ color: '#2C84E0', fontWeight: 600 }}>{step.nextLabel}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Pill({
  text,
  color,
  soft = false,
}: {
  text: string;
  color: string;
  soft?: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 9999,
        background: soft ? hexToSoft(color) : '#E5E7E0',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: soft ? color : '#4D4F46',
        fontFamily: '"Nunito", system-ui, sans-serif',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

/** Make a translucent soft background from an accent hex (12% alpha). */
function hexToSoft(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#E5E7E0';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},0.12)`;
}

function Arrow() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2 6h8M7 3l3 3-3 3"
        stroke="#9B9C92"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
