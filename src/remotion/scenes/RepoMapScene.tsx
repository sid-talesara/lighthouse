import {interpolate, useCurrentFrame} from 'remotion';
import type {ArchitectureSnapshot} from '../architecture-data';
import type {StoryScene} from '../storyboard';
import {COLORS, SceneFrame, cardStyle, Metric, Pill, Title} from './shared';

function clusterPosition(index: number, total: number) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const radiusX = 250;
  const radiusY = 160;
  return {
    left: 760 + Math.cos(angle) * radiusX,
    top: 370 + Math.sin(angle) * radiusY,
  };
}

export const RepoMapScene: React.FC<{snapshot: ArchitectureSnapshot; scene: StoryScene}> = ({snapshot}) => {
  const frame = useCurrentFrame();
  const intro = interpolate(frame, [0, 40, 120], [0.92, 1, 1]);
  const titleOpacity = interpolate(frame, [0, 20, 90], [0, 1, 1]);
  const clusterScale = interpolate(frame, [20, 120], [0.85, 1]);
  const clusters = snapshot.topClusters;

  return (
    <SceneFrame
      kicker="Architecture walkthrough"
      title="Map the repo before you zoom into any one surface."
      subtitle="The generated `data.json` is the stable evidence layer. Everything on this video is driven from that reviewed structure, not the live app."
      frameLabel="1 / 5"
    >
      <div style={{display: 'grid', gridTemplateColumns: '0.94fr 1.06fr', gap: 28, alignItems: 'center'}}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          <div style={{...cardStyle({padding: 24, background: '#fdfdf9'}), opacity: titleOpacity}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16}}>
              <div style={{width: 14, height: 14, borderRadius: 999, background: COLORS.accent}} />
              <div style={{fontSize: 18, fontWeight: 700, color: COLORS.subtext, letterSpacing: 0.02}}>Repository</div>
            </div>
            <Title size={42}>{snapshot.repo.name}</Title>
            <div style={{fontSize: 22, color: COLORS.subtext, lineHeight: 1.45, marginTop: 14}}>{snapshot.repo.description}</div>
            <div style={{height: 18}} />
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 10}}>
              <Pill tone="accent">`public/data.json`</Pill>
              <Pill>clusters</Pill>
              <Pill>modules</Pill>
              <Pill>services</Pill>
              <Pill>flows</Pill>
              <Pill>evidence</Pill>
            </div>
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, opacity: intro}}>
            <Metric value={snapshot.topClusters.length} label="top clusters in the story cut" />
            <Metric value={snapshot.topServices.length} label="services shown as the runtime path" />
            <Metric value={snapshot.evidenceFiles.length} label="concrete file paths used as proof" />
          </div>
          <div style={{...cardStyle({padding: 20}), display: 'flex', flexDirection: 'column', gap: 10}}>
            <div style={{fontSize: 20, fontWeight: 800}}>Narration path</div>
            <div style={{fontSize: 18, color: COLORS.subtext, lineHeight: 1.4}}>
              Repo map to clusters and modules to service dependencies to file evidence to Local Codex ask/change-review.
            </div>
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            height: 780,
            transform: `scale(${clusterScale})`,
            transformOrigin: '50% 50%',
          }}
        >
            <div
            style={{
              position: 'absolute',
              left: 595,
              top: 285,
              width: 420,
              height: 280,
              borderRadius: 26,
              background: 'linear-gradient(180deg, #ffffff 0%, #f5f7ef 100%)',
              border: `1px solid ${COLORS.border}`,
              boxShadow: '0 18px 40px rgba(29, 34, 26, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 18,
            }}
          >
            <div style={{fontSize: 16, fontWeight: 800, letterSpacing: 0.08, color: COLORS.subtext}}>Lighthouse map</div>
            <div style={{fontSize: 52, fontWeight: 900, color: COLORS.ink, textAlign: 'center', lineHeight: 1.04}}>
              system understanding
            </div>
            <div style={{fontSize: 20, color: COLORS.subtext, maxWidth: 320, textAlign: 'center', lineHeight: 1.4}}>
              One reviewed data file feeds every scene and every answer.
            </div>
          </div>

          {clusters.map((cluster, index) => {
            const pos = clusterPosition(index, clusters.length);
            const pulse = interpolate(frame, [40 + index * 8, 110 + index * 8], [0.85, 1]);
            return (
              <div
                key={cluster.id}
                style={{
                  position: 'absolute',
                  left: pos.left,
                  top: pos.top,
                  transform: `translate(-50%, -50%) scale(${pulse})`,
                  width: 320,
              ...cardStyle({
                  padding: 18,
                  background: index === 0 ? '#fefdf8' : '#ffffff',
                  borderColor: index === 0 ? COLORS.accent : COLORS.border,
                }),
              }}
            >
                <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start'}}>
                  <div style={{fontSize: 21, fontWeight: 800, lineHeight: 1.15}}>{cluster.label}</div>
                  <Pill tone={index === 0 ? 'accent' : 'default'}>{cluster.modules.length}</Pill>
                </div>
                <div style={{height: 10}} />
                <div style={{fontSize: 17, lineHeight: 1.45, color: COLORS.subtext}}>{cluster.summary}</div>
                <div style={{height: 12}} />
                <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                  {cluster.modules.slice(0, 3).map((moduleId) => (
                    <span
                      key={moduleId}
                      style={{
                        padding: '7px 9px',
                        borderRadius: 999,
                        background: '#eef2ea',
                        border: '1px solid #d1d5c8',
                        fontSize: 14,
                        fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace',
                        color: COLORS.text,
                      }}
                    >
                      {moduleId}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SceneFrame>
  );
};
