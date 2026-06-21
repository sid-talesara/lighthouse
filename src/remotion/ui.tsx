import type {CSSProperties, ReactNode} from 'react';

export const COLORS = {
  canvas: '#eef0e8',
  panel: '#ffffff',
  panelMuted: '#f6f7f0',
  border: '#b8bbb0',
  text: '#2d2f29',
  subtext: '#5d6257',
  accent: '#2c84e0',
  accentSoft: '#d8e7f7',
  green: '#3b7f63',
  greenSoft: '#d9efe5',
  gold: '#a16c17',
  goldSoft: '#f6ead3',
  red: '#b74c42',
  redSoft: '#f5ddd9',
  ink: '#1f2320',
  line: '#c7cbbf',
};

export const monoFont = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
export const sansFont = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export function cardStyle(extra: CSSProperties = {}): CSSProperties {
  return {
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    boxShadow: '0 10px 30px rgba(38, 42, 35, 0.06)',
    ...extra,
  };
}

export function Pill({children, tone = 'default'}: {children: ReactNode; tone?: 'default' | 'accent' | 'green' | 'gold' | 'red'}) {
  const palette =
    tone === 'accent'
      ? {background: COLORS.accentSoft, color: COLORS.accent}
      : tone === 'green'
        ? {background: COLORS.greenSoft, color: COLORS.green}
        : tone === 'gold'
          ? {background: COLORS.goldSoft, color: COLORS.gold}
          : tone === 'red'
            ? {background: COLORS.redSoft, color: COLORS.red}
            : {background: COLORS.panelMuted, color: COLORS.subtext};

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 999,
        fontSize: 20,
        lineHeight: 1,
        fontWeight: 600,
        letterSpacing: 0,
        ...palette,
      }}
    >
      {children}
    </span>
  );
}

export function Label({children}: {children: ReactNode}) {
  return (
    <div
      style={{
        fontSize: 18,
        lineHeight: 1,
        letterSpacing: 0.02,
        textTransform: 'uppercase',
        color: COLORS.subtext,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

export function Title({children, size = 62}: {children: ReactNode; size?: number}) {
  return (
    <div
      style={{
        fontSize: size,
        lineHeight: 1.02,
        fontWeight: 800,
        letterSpacing: 0,
        color: COLORS.text,
      }}
    >
      {children}
    </div>
  );
}

export function Metric({value, label}: {value: ReactNode; label: ReactNode}) {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
      <div style={{fontSize: 46, fontWeight: 800, color: COLORS.ink, lineHeight: 1}}>{value}</div>
      <div style={{fontSize: 18, color: COLORS.subtext, lineHeight: 1.2, maxWidth: 220}}>{label}</div>
    </div>
  );
}

export function SceneFrame({
  kicker,
  title,
  subtitle,
  frameLabel,
  children,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  frameLabel: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        fontFamily: sansFont,
        color: COLORS.text,
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.18) 44%, rgba(238,240,232,0.92) 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(184,187,176,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(184,187,176,0.22) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.08) 52%, rgba(0,0,0,0.04) 100%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{position: 'absolute', inset: 0, padding: '54px 64px 48px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24}}>
          <div style={{display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 980}}>
            <Label>{kicker}</Label>
            <Title size={58}>{title}</Title>
            <div style={{fontSize: 26, color: COLORS.subtext, lineHeight: 1.35, maxWidth: 940}}>{subtitle}</div>
          </div>
          <Pill tone="accent">{frameLabel}</Pill>
        </div>
        <div style={{height: 32}} />
        {children}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
  width,
  tone = 'default',
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  width?: number | string;
  tone?: 'default' | 'accent' | 'green' | 'gold' | 'red';
}) {
  const borderColor =
    tone === 'accent'
      ? COLORS.accent
      : tone === 'green'
        ? COLORS.green
        : tone === 'gold'
          ? COLORS.gold
          : tone === 'red'
            ? COLORS.red
            : COLORS.border;

  return (
    <div
      style={{
        ...cardStyle({
          width,
          padding: 22,
          borderColor,
        }),
      }}
    >
      <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
        <div style={{fontSize: 26, fontWeight: 750, lineHeight: 1.05}}>{title}</div>
        {subtitle ? <div style={{fontSize: 18, color: COLORS.subtext, lineHeight: 1.35}}>{subtitle}</div> : null}
        {children ? <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>{children}</div> : null}
      </div>
    </div>
  );
}

export function StatRow({label, value}: {label: string; value: string}) {
  return (
    <div style={{display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 18, lineHeight: 1.35}}>
      <span style={{color: COLORS.subtext}}>{label}</span>
      <span style={{color: COLORS.text, fontWeight: 700, textAlign: 'right'}}>{value}</span>
    </div>
  );
}

export function MonospaceBlock({children}: {children: ReactNode}) {
  return (
    <div
      style={{
        fontFamily: monoFont,
        fontSize: 18,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
      }}
    >
      {children}
    </div>
  );
}
