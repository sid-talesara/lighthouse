import {interpolate, useCurrentFrame} from 'remotion';
import type {ArchitectureSnapshot} from '../architecture-data';
import type {StoryScene} from '../storyboard';
import {COLORS, SceneFrame, cardStyle, MonospaceBlock, Pill} from './shared';

function highlightIds(snapshot: ArchitectureSnapshot) {
  return [
    ...snapshot.changedModules.slice(0, 3).map((module) => module.id),
    snapshot.topServices[0]?.id,
    snapshot.topServices[1]?.id,
  ].filter(Boolean) as string[];
}

export const AskCodexScene: React.FC<{snapshot: ArchitectureSnapshot; scene: StoryScene}> = ({snapshot}) => {
  const frame = useCurrentFrame();
  const slide = interpolate(frame, [0, 110], [18, 0]);
  const ids = highlightIds(snapshot);
  const answerBlocks = [
    {
      title: 'highlight_ids',
      body: ids.join(', '),
    },
    {
      title: 'explanation',
      body: `The web app starts the interaction, the API coordinates the request, and the worker/runner pair executes the run. For recording, the extension and WebSocket server handle the live step stream, while the changed AI modules show where Local Codex would surface the review path.`,
    },
    {
      title: 'evidence',
      body: snapshot.evidenceFiles.slice(0, 3).map((file) => file.path).join('\n'),
    },
  ];

  return (
    <SceneFrame
      kicker="Local Codex angle"
      title="Fast evidence comes from the index; reasoning comes from the local coding agent."
      subtitle="For structured visual answers, the RAG/index layer should retrieve the right proof quickly, then the local agent should render the explanation and the highlighted answer path."
      frameLabel="5 / 5"
    >
      <div style={{display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 28, alignItems: 'stretch'}}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 14, transform: `translateY(${slide}px)`}}>
          <div style={{...cardStyle({padding: 20, background: '#11140f', color: '#f4f7ef'}), borderColor: '#2a2f27'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center'}}>
              <div style={{fontSize: 20, fontWeight: 800}}>Local Codex</div>
              <Pill tone="accent">ask / change-review</Pill>
            </div>
            <div style={{height: 14}} />
            <div style={{fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace', fontSize: 18, lineHeight: 1.5}}>
              &gt; Where does the execution path start, and which files prove it?
            </div>
            <div style={{height: 14}} />
            <div style={{fontSize: 16, color: '#c5cfbf', lineHeight: 1.5}}>
              The retrieval layer should point to the right nodes and files fast. The reasoning layer can then compose the answer, compare alternatives, and render the visual evidence.
            </div>
          </div>

          <div style={cardStyle({padding: 18, background: '#fbfcf7'})}>
            <div style={{fontSize: 18, fontWeight: 800, marginBottom: 10}}>Retrieval architecture decision</div>
            <div style={{display: 'grid', gap: 10}}>
              <div style={{display: 'flex', gap: 10, alignItems: 'flex-start'}}>
                <Pill tone="accent">RAG / index</Pill>
                <div style={{fontSize: 17, color: COLORS.subtext, lineHeight: 1.45}}>fast evidence layer for node lookup, file lookup, and section lookup</div>
              </div>
              <div style={{display: 'flex', gap: 10, alignItems: 'flex-start'}}>
                <Pill tone="green">Local agent</Pill>
                <div style={{fontSize: 17, color: COLORS.subtext, lineHeight: 1.45}}>reasoning and rendering layer for the structured visual answer</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{display: 'grid', gridTemplateRows: 'repeat(3, 1fr)', gap: 14}}>
          {answerBlocks.map((block) => (
            <div key={block.title} style={cardStyle({padding: 18, background: '#ffffff'})}>
              <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10}}>
                <div style={{fontSize: 20, fontWeight: 800}}>{block.title}</div>
                <Pill>{block.title === 'highlight_ids' ? `${ids.length} refs` : 'grounded'}</Pill>
              </div>
              <MonospaceBlock>{block.body}</MonospaceBlock>
            </div>
          ))}
        </div>
      </div>
    </SceneFrame>
  );
};
