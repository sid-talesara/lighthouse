/**
 * FunctionDetailPanel — side panel shown when a function is selected.
 *
 * Shows: name, signature, summary, owning module/service, callers, callees,
 * and a CodeViewer snippet of the owning module's first key_file.
 *
 * Constraints:
 *  - Uses CodeViewer from '../../components/CodeViewer'
 *  - Uses fetchFileContent from '../../lib/fileContent' (only for file resolution)
 *  - PostHog LIGHT theme (cream canvas, white cards, #BFC1B7 borders)
 *  - No transform/translate/scale animations on outer wrapper
 */

import { useMemo } from 'react';
import type { FunctionNode, LighthouseNode, Service } from '../../types/lighthouse';
import { CodeViewer } from '../CodeViewer';

// ── Service kind accent colors ─────────────────────────────────────────────────

const SERVICE_KIND_COLOR: Record<string, string> = {
  frontend: '#2C84E0',
  backend:  '#7C44A6',
  worker:   '#F54E00',
  realtime: '#2C8C66',
  gateway:  '#DC9300',
  db:       '#1078A3',
  external: '#CD4239',
  other:    '#9B9C92',
};

function svcColor(kind: string): string {
  return SERVICE_KIND_COLOR[kind] ?? '#9B9C92';
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface FunctionDetailPanelProps {
  fn: FunctionNode;
  moduleNode: LighthouseNode | null;
  service: Service | null;
  callerFns: FunctionNode[];
  calleeFns: FunctionNode[];
  onSelectFn: (id: string) => void;
  onClose: () => void;
  /** Module accent color */
  accentColor: string;
}

// ── Small sub-components ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: '"Nunito", system-ui, sans-serif',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: '#9B9C92',
      marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

function FnChip({
  fn,
  accentColor,
  onClick,
}: {
  fn: FunctionNode;
  accentColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={fn.summary}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        border: '1px solid #BFC1B7',
        borderRadius: 4,
        background: '#FFFFFF',
        cursor: 'pointer',
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        fontSize: 11,
        color: '#151515',
        lineHeight: 1.4,
        textAlign: 'left',
        transition: 'border-color 80ms ease-out, background 80ms ease-out',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor;
        (e.currentTarget as HTMLButtonElement).style.background = `${accentColor}0D`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#BFC1B7';
        (e.currentTarget as HTMLButtonElement).style.background = '#FFFFFF';
      }}
    >
      <span style={{
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: accentColor,
        flexShrink: 0,
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {fn.name}
      </span>
    </button>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function FunctionDetailPanel({
  fn,
  moduleNode,
  service,
  callerFns,
  calleeFns,
  onSelectFn,
  onClose,
  accentColor,
}: FunctionDetailPanelProps) {
  // Pick the first key_file from the owning module to show in CodeViewer
  const codeFilePath = useMemo(() => {
    if (!moduleNode) return null;
    return moduleNode.key_files?.[0] ?? null;
  }, [moduleNode]);

  const serviceColor = service ? svcColor(service.kind) : '#9B9C92';

  return (
    <div style={{
      width: 340,
      minWidth: 300,
      maxWidth: 380,
      height: '100%',
      background: '#FFFFFF',
      borderLeft: '1px solid #BFC1B7',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '14px 16px 12px',
        borderBottom: '1px solid #BFC1B7',
        flexShrink: 0,
      }}>
        {/* Accent stripe indicator */}
        <div style={{
          width: 3,
          alignSelf: 'stretch',
          background: accentColor,
          borderRadius: 2,
          flexShrink: 0,
          marginTop: 1,
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Function name */}
          <div style={{
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 13,
            fontWeight: 500,
            color: '#151515',
            lineHeight: 1.35,
            wordBreak: 'break-all',
          }}>
            {fn.name}
          </div>

          {/* Module / Service breadcrumb */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 5,
            flexWrap: 'wrap',
          }}>
            {service && (
              <>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '1px 7px',
                  borderRadius: 9999,
                  background: `${serviceColor}15`,
                  border: `1px solid ${serviceColor}40`,
                  fontFamily: '"Nunito", system-ui, sans-serif',
                  fontSize: 10,
                  fontWeight: 700,
                  color: serviceColor,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>
                  {service.name}
                </span>
                <span style={{ color: '#BFC1B7', fontSize: 10 }}>›</span>
              </>
            )}
            {moduleNode && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '1px 7px',
                borderRadius: 9999,
                background: `${accentColor}15`,
                border: `1px solid ${accentColor}40`,
                fontFamily: '"Nunito", system-ui, sans-serif',
                fontSize: 10,
                fontWeight: 700,
                color: accentColor,
                letterSpacing: '0.04em',
              }}>
                {moduleNode.label}
              </span>
            )}
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          style={{
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid transparent',
            borderRadius: 4,
            background: 'transparent',
            color: '#9B9C92',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            flexShrink: 0,
            transition: 'background 75ms ease-out, border-color 75ms ease-out',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#E5E7E0';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#BFC1B7';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
          }}
        >
          ×
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Signature */}
        {fn.signature && (
          <div>
            <SectionLabel>Signature</SectionLabel>
            <div style={{
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              fontSize: 11,
              color: '#4D4F46',
              background: '#F5F5F2',
              border: '1px solid #E5E7E0',
              borderRadius: 4,
              padding: '8px 10px',
              lineHeight: 1.6,
              wordBreak: 'break-all',
            }}>
              {fn.signature}
            </div>
          </div>
        )}

        {/* Summary */}
        {fn.summary && (
          <div>
            <SectionLabel>What it does</SectionLabel>
            <p style={{
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: 13,
              color: '#4D4F46',
              lineHeight: 1.6,
              margin: 0,
            }}>
              {fn.summary}
            </p>
          </div>
        )}

        {/* Module summary */}
        {moduleNode?.summary && (
          <div>
            <SectionLabel>Module context</SectionLabel>
            <div style={{
              display: 'flex',
              gap: 8,
              padding: '8px 10px',
              background: '#FCFCFA',
              border: '1px solid #DCDFD2',
              borderRadius: 4,
            }}>
              <div style={{
                width: 3,
                background: accentColor,
                borderRadius: 2,
                flexShrink: 0,
                alignSelf: 'stretch',
              }} />
              <p style={{
                fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                fontSize: 12,
                color: '#6C6E63',
                lineHeight: 1.6,
                margin: 0,
              }}>
                {moduleNode.summary}
              </p>
            </div>
          </div>
        )}

        {/* Callers */}
        {callerFns.length > 0 && (
          <div>
            <SectionLabel>Called by ({callerFns.length})</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {callerFns.map(caller => (
                <FnChip
                  key={caller.id}
                  fn={caller}
                  accentColor="#2C84E0"
                  onClick={() => onSelectFn(caller.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Callees */}
        {calleeFns.length > 0 && (
          <div>
            <SectionLabel>Calls ({calleeFns.length})</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {calleeFns.map(callee => (
                <FnChip
                  key={callee.id}
                  fn={callee}
                  accentColor={accentColor}
                  onClick={() => onSelectFn(callee.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* No callers + no callees */}
        {callerFns.length === 0 && calleeFns.length === 0 && (
          <div style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 12,
            color: '#9B9C92',
            padding: '6px 0',
          }}>
            No call edges recorded for this function.
          </div>
        )}

        {/* Code snippet */}
        <div>
          <SectionLabel>Source file</SectionLabel>
          {codeFilePath ? (
            <>
              <CodeViewer
                path={codeFilePath}
                maxHeight="260px"
                className=""
              />
              <div style={{
                marginTop: 5,
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                color: '#9B9C92',
                lineHeight: 1.4,
              }}>
                First key file of <strong style={{ color: '#6C6E63' }}>{moduleNode?.label}</strong>.
                Exact line range for <code>{fn.name}</code> requires index.
              </div>
            </>
          ) : (
            <div style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 12,
              color: '#9B9C92',
              padding: '8px 0',
            }}>
              No key files available for this module.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
