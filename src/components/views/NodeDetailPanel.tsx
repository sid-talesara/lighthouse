/**
 * NodeDetailPanel — slide-in detail panel for a selected dependency node.
 *
 * Shows: label, summary, outgoing deps, incoming dependents, and a
 * CodeViewer snippet of the node's primary source file.
 *
 * PostHog LIGHT theme (cream canvas #E8E9E2, white cards, olive accents).
 */

import { useCallback } from 'react';
import { CodeViewer } from '../CodeViewer';
import type { LighthouseData, LighthouseNode, Edge } from '../../types/lighthouse';

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  nodeId: string | null;
  data: LighthouseData;
  onClose: () => void;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getNode(data: LighthouseData, id: string): LighthouseNode | undefined {
  return data.nodes.find((n) => n.id === id);
}

function outgoing(data: LighthouseData, id: string): Edge[] {
  return data.edges.filter((e) => e.source === id);
}

function incoming(data: LighthouseData, id: string): Edge[] {
  return data.edges.filter((e) => e.target === id);
}

const KIND_COLOR: Record<string, string> = {
  depends: '#7C44A6',
  calls: '#2C84E0',
  imports: '#2C8C66',
};

// ─── sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: '#9B9C92',
        marginBottom: 6,
        fontFamily: '"Nunito", system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  );
}

function EdgePill({ edge, label }: { edge: Edge; label: string }) {
  const color = KIND_COLOR[edge.kind] ?? '#BFC1B7';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        background: '#F4F5EF',
        borderRadius: 4,
        border: '1px solid #E0E1D8',
        marginBottom: 4,
        fontFamily: '"Nunito", system-ui, sans-serif',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#151515',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 10,
          color: color,
          fontWeight: 700,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {edge.kind}
      </span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function NodeDetailPanel({ nodeId, data, onClose }: Props) {
  const handleClose = useCallback(() => onClose(), [onClose]);

  const isOpen = nodeId !== null;
  const node = nodeId ? getNode(data, nodeId) : undefined;

  // Resolve primary file path
  const primaryFile =
    node?.key_files?.[0] ??
    (node?.path && node.path !== '' ? node.path : undefined);

  const deps = node ? outgoing(data, node.id) : [];
  const dependents = node ? incoming(data, node.id) : [];

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        background: '#FFFFFF',
        borderLeft: '1px solid #BFC1B7',
        boxShadow: '-4px 0 16px rgba(20,20,20,0.08)',
        // Slide-in animation on the inner wrapper (NOT on .react-flow__node)
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 220ms cubic-bezier(0.32,0.72,0,1)',
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid #E0E1D8',
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: '#151515',
              fontFamily: '"Nunito", system-ui, sans-serif',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node?.label ?? '—'}
          </div>
          <div
            style={{
              fontSize: 11,
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              color: '#6C6E63',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node?.parent ?? ''}
          </div>
        </div>
        <button
          onClick={handleClose}
          aria-label="Close detail panel"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#9B9C92',
            fontSize: 18,
            lineHeight: 1,
            padding: '2px 4px',
            borderRadius: 4,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Scrollable body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* Summary */}
        {node?.summary && (
          <div>
            <SectionHeader>Summary</SectionHeader>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.6,
                color: '#4D4F46',
                fontFamily: '"Nunito", system-ui, sans-serif',
              }}
            >
              {node.summary}
            </p>
          </div>
        )}

        {/* Deps outgoing */}
        {deps.length > 0 && (
          <div>
            <SectionHeader>Dependencies ({deps.length})</SectionHeader>
            {deps.map((e, i) => {
              const target = getNode(data, e.target);
              return (
                <EdgePill
                  key={`dep-${i}`}
                  edge={e}
                  label={target?.label ?? e.target}
                />
              );
            })}
          </div>
        )}

        {/* Dependents incoming */}
        {dependents.length > 0 && (
          <div>
            <SectionHeader>Used by ({dependents.length})</SectionHeader>
            {dependents.map((e, i) => {
              const src = getNode(data, e.source);
              return (
                <EdgePill
                  key={`dep-by-${i}`}
                  edge={e}
                  label={src?.label ?? e.source}
                />
              );
            })}
          </div>
        )}

        {/* Code snippet */}
        {primaryFile && (
          <div>
            <SectionHeader>Source</SectionHeader>
            <CodeViewer
              path={primaryFile}
              maxHeight="320px"
            />
          </div>
        )}

        {/* Empty state when no file */}
        {!primaryFile && node && (
          <div
            style={{
              fontSize: 12,
              color: '#9B9C92',
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              textAlign: 'center',
              padding: '24px 0',
            }}
          >
            No source file linked
          </div>
        )}
      </div>
    </div>
  );
}
