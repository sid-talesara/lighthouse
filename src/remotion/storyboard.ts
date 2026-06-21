export interface StoryScene {
  id: string;
  title: string;
  subtitle: string;
  startFrame: number;
  durationInFrames: number;
}

export const FPS = 30;
export const TOTAL_DURATION_IN_FRAMES = 1800;

export const STORYBOARD: StoryScene[] = [
  {
    id: 'repo-map',
    title: 'Repo map',
    subtitle: 'Start with the whole system and the generated `data.json` contract.',
    startFrame: 0,
    durationInFrames: 360,
  },
  {
    id: 'clusters',
    title: 'Clusters and modules',
    subtitle: 'Zoom from product areas into the modules that actually carry the work.',
    startFrame: 360,
    durationInFrames: 360,
  },
  {
    id: 'services',
    title: 'Services and dependencies',
    subtitle: 'Follow the runtime path through the services and the links between them.',
    startFrame: 720,
    durationInFrames: 360,
  },
  {
    id: 'evidence',
    title: 'Files and code evidence',
    subtitle: 'Anchor the story in concrete file paths, module summaries, and recent changes.',
    startFrame: 1080,
    durationInFrames: 360,
  },
  {
    id: 'ask',
    title: 'Local Codex ask',
    subtitle: 'Use the index as evidence and the local coding agent as the reasoning layer.',
    startFrame: 1440,
    durationInFrames: 360,
  },
];

export function sceneProgress(frame: number, scene: StoryScene) {
  const local = frame - scene.startFrame;
  const p = Math.min(1, Math.max(0, local / Math.max(scene.durationInFrames - 1, 1)));
  return p;
}
