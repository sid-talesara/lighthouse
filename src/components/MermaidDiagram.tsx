import { useEffect, useId, useState } from 'react';

interface MermaidDiagramProps {
  source: string;
}

type RenderState =
  | { status: 'loading' }
  | { status: 'ready'; svg: string }
  | { status: 'error'; message: string };

export function MermaidDiagram({ source }: MermaidDiagramProps) {
  const reactId = useId();
  const diagramId = `lh-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [state, setState] = useState<RenderState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      const compact = source.trim();
      if (!compact) {
        setState({ status: 'error', message: 'No diagram source returned.' });
        return;
      }

      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: {
            background: '#FCFCFA',
            primaryColor: '#F5F5F2',
            primaryBorderColor: '#BFC1B7',
            primaryTextColor: '#151515',
            lineColor: '#6C6E63',
            secondaryColor: '#E5E7E0',
            tertiaryColor: '#FBF1DA',
            fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
          },
        });
        const { svg } = await mermaid.render(diagramId, compact);
        if (!cancelled) setState({ status: 'ready', svg });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    setState({ status: 'loading' });
    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [diagramId, source]);

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-ph-sm border border-ph-border bg-ph-surface font-body text-label text-ph-mute">
        Rendering diagram...
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-ph-sm border border-ph-red bg-ph-red-soft p-2">
        <div className="mb-1 font-sans text-label font-bold text-ph-red">Mermaid render failed</div>
        <div className="mb-2 font-body text-label text-ph-red">{state.message}</div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-ph-sm border border-ph-border bg-ph-surface px-2 py-2 font-mono text-code leading-snug text-ph-body">
          {source}
        </pre>
      </div>
    );
  }

  return (
    <div
      className="overflow-auto rounded-ph-sm border border-ph-border bg-ph-surface p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
