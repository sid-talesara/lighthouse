import {Composition} from 'remotion';
import {ArchitectureWalkthrough} from './ArchitectureWalkthrough';
import {FPS, TOTAL_DURATION_IN_FRAMES} from './storyboard';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ArchitectureWalkthrough"
        component={ArchitectureWalkthrough}
        durationInFrames={TOTAL_DURATION_IN_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
