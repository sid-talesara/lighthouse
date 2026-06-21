import {interpolate, useCurrentFrame} from 'remotion';
import type {ArchitectureSnapshot} from '../architecture-data';
import type {StoryScene} from '../storyboard';
import {COLORS, SceneFrame, cardStyle, MiniModuleList, Pill, lookupModules} from './shared';

export const ClusterZoomScene: React.FC<{snapshot: ArchitectureSnapshot; scene: StoryScene}> = ({snapshot}) => {
  const frame = useCurrentFrame();
  const leftShift = interpolate(frame, [0, 120], [0, -40]);
  const highlight = snapshot.topClusters.slice(0, 4);
  const focusCluster = highlight[0];

  return (
    <SceneFrame
      kicker="Cluster to module view"
      title="Clusters describe product surfaces; modules show the implementation boundaries."
      subtitle="The story stays legible by treating each cluster as a concise operating area rather than a full code dump."
      frameLabel="2 / 5"
    >
      <div style={{display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: 28}}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 16, transform: `translateX(${leftShift}px)`}}>
          {highlight.map((cluster, index) => {
            const modules = lookupModules(snapshot, cluster.id);
            return (
              <div
                key={cluster.id}
                style={cardStyle({
                  padding: 20,
                  borderColor: index === 0 ? COLORS.accent : COLORS.border,
                  background: index === 0 ? '#fefdf8' : '#ffffff',
                })}
              >
                <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start'}}>
                  <div style={{fontSize: 24, fontWeight: 800, lineHeight: 1.15}}>{cluster.label}</div>
                  <Pill tone={index === 0 ? 'accent' : 'default'}>{modules.length}</Pill>
                </div>
                <div style={{height: 10}} />
                <div style={{fontSize: 17, color: COLORS.subtext, lineHeight: 1.45}}>{cluster.summary}</div>
                <div style={{height: 14}} />
                <MiniModuleList items={modules.slice(0, 4).map((module) => module.label)} />
              </div>
            );
          })}
        </div>

        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18}}>
          <div style={cardStyle({padding: 22, background: '#f8f9f4', minHeight: 250})}>
            <div style={{fontSize: 18, fontWeight: 800, color: COLORS.subtext, marginBottom: 14}}>Focused cluster</div>
            <div style={{fontSize: 34, fontWeight: 900, lineHeight: 1.08, marginBottom: 10}}>{focusCluster.label}</div>
            <div style={{fontSize: 18, lineHeight: 1.45, color: COLORS.subtext}}>{focusCluster.summary}</div>
            <div style={{height: 18}} />
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12}}>
              <div style={cardStyle({padding: 16, background: '#fff'})}>
                <div style={{fontSize: 16, color: COLORS.subtext, marginBottom: 8}}>modules</div>
                <div style={{fontSize: 32, fontWeight: 900}}>{lookupModules(snapshot, focusCluster.id).length}</div>
              </div>
              <div style={cardStyle({padding: 16, background: '#fff'})}>
                <div style={{fontSize: 16, color: COLORS.subtext, marginBottom: 8}}>primary service</div>
                <div style={{fontSize: 22, fontWeight: 800, lineHeight: 1.1}}>
                  {snapshot.topServices[0]?.name ?? 'n/a'}
                </div>
              </div>
            </div>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
            {lookupModules(snapshot, focusCluster.id)
              .slice(0, 4)
              .map((module) => (
              <div
                key={module.id}
                style={cardStyle({
                    padding: 18,
                    borderColor: module.changed_recently ? COLORS.green : COLORS.border,
                    background: module.changed_recently ? '#f9fcfa' : '#ffffff',
                  })}
                >
                  <div style={{display: 'flex', justifyContent: 'space-between', gap: 12}}>
                    <div style={{fontSize: 22, fontWeight: 800, lineHeight: 1.15}}>{module.label}</div>
                    {module.changed_recently ? <Pill tone="green">changed</Pill> : <Pill>stable</Pill>}
                  </div>
                  <div style={{height: 8}} />
                  <div style={{fontSize: 17, color: COLORS.subtext, lineHeight: 1.45}}>{module.summary}</div>
                  <div style={{height: 10}} />
                  <div style={{fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace', fontSize: 14, color: COLORS.subtext}}>
                    {module.key_files.slice(0, 2).join(' • ')}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
};
