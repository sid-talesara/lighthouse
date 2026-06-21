/**
 * EditorPane — IDE-style main content area for the FilesView.
 *
 * Renders open file tabs at the top, and the active file's source via
 * CodeViewer below. Shows a welcome state when nothing is open.
 */

// No React hooks needed at this scope — state lives in FilesView.
import { CodeViewer } from '../CodeViewer';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenTab {
  filePath: string;
  /** node id this file belongs to, or null */
  nodeId: string | null;
  /** human-readable module label for the tab badge */
  nodeLabel?: string;
}

interface EditorPaneProps {
  openTabs: OpenTab[];
  activeFilePath: string | null;
  onActivate: (filePath: string) => void;
  onClose: (filePath: string) => void;
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

function TabBar({ openTabs, activeFilePath, onActivate, onClose }: EditorPaneProps) {
  if (openTabs.length === 0) return null;

  return (
    <div
      className="flex items-end gap-0 overflow-x-auto shrink-0 border-b border-ph-border"
      style={{ background: '#1A1C14', scrollbarWidth: 'none' }}
    >
      {openTabs.map((tab) => {
        const fileName = tab.filePath.split('/').pop() ?? tab.filePath;
        const isActive = tab.filePath === activeFilePath;
        return (
          <div
            key={tab.filePath}
            role="tab"
            aria-selected={isActive}
            className={[
              'group flex items-center gap-1.5 px-3 py-2 cursor-pointer shrink-0 border-r border-ph-border select-none',
              isActive
                ? 'bg-[#23251D] border-t-2 border-t-ph-yellow'
                : 'bg-transparent hover:bg-[#23251D]/60 border-t-2 border-t-transparent',
            ].join(' ')}
            onClick={() => onActivate(tab.filePath)}
          >
            <span
              className="font-mono text-[12px] truncate max-w-[160px]"
              style={{ color: isActive ? '#EEEFE9' : '#9B9C92' }}
              title={tab.filePath}
            >
              {fileName}
            </span>
            <button
              type="button"
              aria-label={`Close ${fileName}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.filePath);
              }}
              className={[
                'rounded-sm text-[10px] leading-none w-4 h-4 flex items-center justify-center transition-colors',
                isActive
                  ? 'text-[#6C6E63] hover:text-[#EEEFE9] hover:bg-[#3A3C32]'
                  : 'text-transparent group-hover:text-[#6C6E63] hover:!text-[#EEEFE9] hover:bg-[#3A3C32]',
              ].join(' ')}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ filePath, nodeLabel }: { filePath: string; nodeLabel?: string }) {
  const parts = filePath.split('/');
  return (
    <div
      className="flex items-center gap-1 px-4 py-1.5 shrink-0 border-b border-ph-border overflow-x-auto"
      style={{ background: '#1A1C14', scrollbarWidth: 'none' }}
    >
      {parts.map((part, idx) => (
        <span key={idx} className="flex items-center gap-1">
          {idx > 0 && (
            <span style={{ color: '#4B4B4B', fontSize: '10px' }}>/</span>
          )}
          <span
            className="font-mono shrink-0"
            style={{
              fontSize: '11px',
              color: idx === parts.length - 1 ? '#C4C5BC' : '#6C6E63',
            }}
          >
            {part}
          </span>
        </span>
      ))}
      {nodeLabel && (
        <span
          className="ml-auto shrink-0 rounded-full px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider"
          style={{ background: 'rgba(247,165,1,0.15)', color: '#F7A501' }}
        >
          {nodeLabel}
        </span>
      )}
    </div>
  );
}

// ─── Welcome state ────────────────────────────────────────────────────────────

function WelcomeState() {
  return (
    <div
      className="flex flex-1 items-center justify-center flex-col gap-4 select-none"
      style={{ background: '#23251D' }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#3A3C32"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
      <p
        className="font-sans text-[13px]"
        style={{ color: '#4B4B4B' }}
      >
        Click a file in the tree to open it
      </p>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function EditorPane({ openTabs, activeFilePath, onActivate, onClose }: EditorPaneProps) {
  const activeTab = activeFilePath
    ? openTabs.find((t) => t.filePath === activeFilePath) ?? null
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#23251D' }}>
      {/* Tab bar */}
      <TabBar
        openTabs={openTabs}
        activeFilePath={activeFilePath}
        onActivate={onActivate}
        onClose={onClose}
      />

      {/* Breadcrumb for active file */}
      {activeTab && (
        <Breadcrumb
          filePath={activeTab.filePath}
          nodeLabel={activeTab.nodeLabel}
        />
      )}

      {/* Content area */}
      {activeTab ? (
        <div className="flex-1 overflow-auto">
          <CodeViewer
            path={activeTab.filePath}
            maxHeight="100%"
            className="rounded-none border-0"
          />
        </div>
      ) : (
        <WelcomeState />
      )}
    </div>
  );
}
