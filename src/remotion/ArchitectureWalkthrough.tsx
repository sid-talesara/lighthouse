import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {useMemo} from 'react';
import {useArchitectureData} from './architecture-data';
import {STORYBOARD} from './storyboard';
import {RepoMapScene} from './scenes/RepoMapScene';
import {ClusterZoomScene} from './scenes/ClusterZoomScene';
import {ServiceGraphScene} from './scenes/ServiceGraphScene';
import {EvidenceScene} from './scenes/EvidenceScene';
import {AskCodexScene} from './scenes/AskCodexScene';

export const ArchitectureWalkthrough: React.FC = () => {
  const {snapshot, error} = useArchitectureData();

  const scenes = useMemo(
    () => [
      {scene: STORYBOARD[0], render: RepoMapScene},
      {scene: STORYBOARD[1], render: ClusterZoomScene},
      {scene: STORYBOARD[2], render: ServiceGraphScene},
      {scene: STORYBOARD[3], render: EvidenceScene},
      {scene: STORYBOARD[4], render: AskCodexScene},
    ],
    [],
  );

  if (error) {
    return (
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          background: '#eef0e8',
          color: '#2d2f29',
          fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div style={{fontSize: 36, fontWeight: 800, maxWidth: 1100, textAlign: 'center', lineHeight: 1.2}}>
          Remotion data load failed: {error}
        </div>
      </AbsoluteFill>
    );
  }

  if (!snapshot) {
    return null;
  }

  return (
    <AbsoluteFill style={{background: '#eef0e8'}}>
      <Audio src={staticFile('remotion/architecture-walkthrough.mp3')} volume={0.85} />
      {scenes.map(({scene, render: Scene}) => (
        <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationInFrames}>
          <Scene snapshot={snapshot} scene={scene} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
