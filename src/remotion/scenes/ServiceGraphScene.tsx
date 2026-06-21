import {interpolate, useCurrentFrame} from 'remotion';
import type {ArchitectureSnapshot} from '../architecture-data';
import type {StoryScene} from '../storyboard';
import {COLORS, SceneFrame, cardStyle, Pill, StatRow} from './shared';

function serviceTone(kind: string): 'default' | 'accent' | 'green' | 'gold' | 'red' {
  if (kind === 'frontend') return 'accent';
  if (kind === 'backend') return 'green';
  if (kind === 'worker') return 'gold';
  if (kind === 'realtime') return 'accent';
  if (kind === 'gateway' || kind === 'db') return 'red';
  return 'default';
}

export const ServiceGraphScene: React.FC<{snapshot: ArchitectureSnapshot; scene: StoryScene}> = ({snapshot}) => {
  const frame = useCurrentFrame();
  const lineProgress = interpolate(frame, [0, 120, 240], [0, 1, 1]);
  const services = snapshot.topServices;
  const edges = snapshot.serviceLinks.slice(0, 8);
  const positions = new Map<string, {x: number; y: number}>([
    ['svc_web', {x: 150, y: 180}],
    ['svc_cli', {x: 160, y: 450}],
    ['svc_landing', {x: 130, y: 315}],
    ['svc_extension', {x: 130, y: 570}],
    ['svc_api', {x: 470, y: 250}],
    ['svc_ws_server', {x: 470, y: 450}],
    ['svc_agent', {x: 470, y: 650}],
    ['svc_workers', {x: 840, y: 250}],
    ['svc_python_runner', {x: 1220, y: 230}],
    ['svc_email', {x: 1210, y: 430}],
    ['svc_proxy', {x: 1220, y: 620}],
  ]);

  return (
    <SceneFrame
      kicker="Runtime architecture"
      title="Services explain how the product moves at runtime."
      subtitle="The visual path is: web UI and extension at the edge, API in the center, workers and runner underneath, with realtime and agent services beside them."
      frameLabel="3 / 5"
    >
      <div style={{display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 28, alignItems: 'stretch'}}>
        <div style={{...cardStyle({padding: 20, minHeight: 750, background: '#fbfbf7'}), position: 'relative'}}>
          <svg width="100%" height="100%" viewBox="0 0 1380 860" preserveAspectRatio="none" style={{position: 'absolute', inset: 0}}>
            {edges.map((edge, index) => {
              const from = positions.get(edge.from);
              const to = positions.get(edge.to);
              if (!from || !to) return null;
              const path = `M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}`;
              return (
                <g key={`${edge.from}-${edge.to}-${index}`}>
                  <path d={path} stroke="#c7cbbf" strokeWidth="2.5" fill="none" strokeDasharray="8 6" opacity="0.55" />
                  <path
                    d={path}
                    stroke={edge.protocol === 'ws' ? COLORS.accent : edge.protocol === 'queue' ? COLORS.gold : COLORS.green}
                    strokeWidth="3.5"
                    fill="none"
                    strokeDasharray="12 8"
                    strokeDashoffset={120 * (1 - lineProgress)}
                    opacity="0.8"
                  />
                </g>
              );
            })}
          </svg>
          {Array.from(positions.entries()).map(([id, pos]) => {
            const service = snapshot.services.find((item) => item.id === id);
            if (!service) return null;
            const connected = edges.some((edge) => edge.from === id || edge.to === id);
            return (
              <div
                key={id}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  transform: 'translate(-50%, -50%)',
                  width: 250,
                  ...cardStyle({
                    padding: 16,
                    background: connected ? '#ffffff' : '#fcfcf8',
                    borderColor: connected ? COLORS.accent : COLORS.border,
                  }),
                }}
              >
                <div style={{display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start'}}>
                  <div style={{fontSize: 20, fontWeight: 800, lineHeight: 1.1}}>{service.name}</div>
                  <Pill tone={serviceTone(service.kind)}>{service.kind}</Pill>
                </div>
                <div style={{height: 8}} />
                <div style={{fontSize: 16, lineHeight: 1.4, color: COLORS.subtext}}>{service.summary}</div>
              </div>
            );
          })}
          <div style={{position: 'absolute', left: 28, bottom: 22, display: 'flex', flexDirection: 'column', gap: 10}}>
            <Pill tone="accent">main path: web to api to workers to python runner</Pill>
            <Pill>side paths: extension, cli, landing, agent</Pill>
          </div>
        </div>

        <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
          <div style={cardStyle({padding: 22, background: '#fefdf8'})}>
            <div style={{fontSize: 20, fontWeight: 800, marginBottom: 12}}>Dependency notes</div>
          {edges.slice(0, 6).map((edge) => (
            <div key={`${edge.from}-${edge.to}`} style={{marginBottom: 12}}>
              <StatRow label={`${edge.from} → ${edge.to}`} value={edge.protocol.toUpperCase()} />
              <div style={{fontSize: 16, color: COLORS.subtext, lineHeight: 1.4, marginTop: 4}}>{edge.summary}</div>
            </div>
          ))}
          </div>
          <div style={cardStyle({padding: 22})}>
            <div style={{fontSize: 20, fontWeight: 800, marginBottom: 12}}>Service coverage</div>
            {services.slice(0, 5).map((service) => (
              <div key={service.id} style={{marginBottom: 12}}>
                <StatRow label={service.name} value={`${service.module_ids?.length ?? 0} modules`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
};
