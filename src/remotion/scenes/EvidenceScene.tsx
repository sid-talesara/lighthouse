import {interpolate, useCurrentFrame} from 'remotion';
import type {ArchitectureSnapshot} from '../architecture-data';
import type {StoryScene} from '../storyboard';
import {COLORS, SceneFrame, cardStyle, EvidencePath, Pill} from './shared';

export const EvidenceScene: React.FC<{snapshot: ArchitectureSnapshot; scene: StoryScene}> = ({snapshot}) => {
  const frame = useCurrentFrame();
  const lift = interpolate(frame, [0, 100], [18, 0]);
  const evidence = snapshot.evidenceFiles.slice(0, 4);
  return (
    <SceneFrame
      kicker="Evidence layer"
      title="Every claim should land on a file path or a section in the index."
      subtitle="This is where the architecture video shifts from a broad shape to concrete proof: changed modules, key files, and related sections that explain why those nodes matter."
      frameLabel="4 / 5"
    >
      <div style={{display: 'grid', gridTemplateColumns: '1.02fr 0.98fr', gap: 28, alignItems: 'start'}}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 14, transform: `translateY(${lift}px)`}}>
          {snapshot.changedModules.slice(0, 3).map((module) => (
            <div
              key={module.id}
              style={cardStyle({
                padding: 18,
                background: '#ffffff',
                borderColor: module.changed_recently ? COLORS.green : COLORS.border,
              })}
            >
              <div style={{display: 'flex', justifyContent: 'space-between', gap: 12}}>
                <div style={{fontSize: 23, fontWeight: 800, lineHeight: 1.15}}>{module.label}</div>
                <Pill tone="green">recently changed</Pill>
              </div>
              <div style={{height: 8}} />
              <div style={{fontSize: 17, color: COLORS.subtext, lineHeight: 1.45}}>{module.summary}</div>
              <div style={{height: 10}} />
              <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                {module.key_files.slice(0, 3).map((file) => (
                  <Pill key={file}>{file}</Pill>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
          <div style={cardStyle({padding: 20, background: '#fefdf8'})}>
            <div style={{fontSize: 20, fontWeight: 800, marginBottom: 12}}>Code evidence cards</div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
              {evidence.map((entry) => (
                <div key={entry.path} style={cardStyle({padding: 16, background: '#ffffff'})}>
                  <div style={{display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10}}>
                    <EvidencePath path={entry.path} />
                    <Pill tone="accent">{entry.clusterLabel}</Pill>
                  </div>
                  <div style={{fontSize: 16, color: COLORS.subtext, lineHeight: 1.45}}>{entry.summary}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </SceneFrame>
  );
};
