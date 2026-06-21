import type {CSSProperties, ReactNode} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {COLORS, cardStyle, monoFont, sansFont, SceneFrame, Pill, SectionCard, Metric, Label, Title, StatRow, MonospaceBlock} from '../ui';
import type {ArchitectureSnapshot} from '../architecture-data';
import type {StoryScene} from '../storyboard';

export {COLORS, cardStyle, monoFont, sansFont, SceneFrame, Pill, SectionCard, Metric, Label, Title, StatRow, MonospaceBlock};

export function useSceneMotion(scene: StoryScene) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - scene.startFrame;
  const progress = Math.min(1, Math.max(0, local / Math.max(scene.durationInFrames - 1, 1)));
  const enter = spring({
    fps,
    frame: Math.max(0, local),
    config: {damping: 18, stiffness: 130, mass: 0.8},
  });
  const opacity = interpolate(
    progress,
    [0, 0.08, 0.92, 1],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)},
  );
  return {frame, local, progress, enter, opacity};
}

export function ColumnShell({
  left,
  right,
  gap = 28,
}: {
  left: ReactNode;
  right: ReactNode;
  gap?: number;
}) {
  return (
    <div style={{display: 'grid', gridTemplateColumns: '1.12fr 0.88fr', gap, alignItems: 'stretch'}}>
      {left}
      {right}
    </div>
  );
}

export function CodeBox({children, title}: {children: ReactNode; title: string}) {
  return (
    <div
      style={{
        ...cardStyle({
          padding: 20,
          background: '#f9faf5',
          fontFamily: monoFont,
        }),
      }}
    >
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 18, fontWeight: 700, color: COLORS.subtext, letterSpacing: 0.01}}>{title}</div>
        <div style={{display: 'flex', gap: 6}}>
          <span style={{width: 10, height: 10, borderRadius: 999, background: '#d88a80'}} />
          <span style={{width: 10, height: 10, borderRadius: 999, background: '#dab86c'}} />
          <span style={{width: 10, height: 10, borderRadius: 999, background: '#75a88b'}} />
        </div>
      </div>
      <div style={{fontSize: 18, lineHeight: 1.5, color: COLORS.ink, whiteSpace: 'pre-wrap'}}>{children}</div>
    </div>
  );
}

export function MiniModuleList({items}: {items: string[]}) {
  return (
    <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
      {items.map((item) => (
        <span
          key={item}
          style={{
            padding: '8px 10px',
            borderRadius: 999,
            background: '#eef2ea',
            border: '1px solid #d1d5c8',
            fontSize: 16,
            color: COLORS.text,
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function NodeChip({
  label,
  tone = 'default',
}: {
  label: string;
  tone?: 'default' | 'accent' | 'green' | 'gold' | 'red';
}) {
  const bg =
    tone === 'accent'
      ? COLORS.accentSoft
      : tone === 'green'
        ? COLORS.greenSoft
        : tone === 'gold'
          ? COLORS.goldSoft
          : tone === 'red'
            ? COLORS.redSoft
            : '#edf0e8';
  const fg =
    tone === 'accent'
      ? COLORS.accent
      : tone === 'green'
        ? COLORS.green
        : tone === 'gold'
          ? COLORS.gold
          : tone === 'red'
            ? COLORS.red
            : COLORS.subtext;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 999,
        padding: '7px 10px',
        fontSize: 15,
        fontWeight: 700,
        lineHeight: 1,
        background: bg,
        color: fg,
      }}
    >
      {label}
    </span>
  );
}

export function ClusterBadge({count}: {count: number}) {
  return <NodeChip label={`${count} modules`} tone="accent" />;
}

export function EvidencePath({path}: {path: string}) {
  return (
    <div
      style={{
        fontFamily: monoFont,
        fontSize: 17,
        color: COLORS.ink,
        lineHeight: 1.35,
        wordBreak: 'break-word',
      }}
    >
      {path}
    </div>
  );
}

export function calloutStyle(color: string): CSSProperties {
  return {
    padding: '16px 18px',
    borderRadius: 14,
    background: color,
    border: '1px solid rgba(31,35,32,0.08)',
  };
}

export function lookupModules(snapshot: ArchitectureSnapshot, clusterId: string) {
  return snapshot.nodes.filter((node) => node.parent === clusterId && node.kind === 'module');
}
