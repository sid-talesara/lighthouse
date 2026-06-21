/**
 * WikiSourceFiles — "Source files" section for the module wiki drawer.
 *
 * Lists a node's key_files as an accordion. Clicking a file expands it inline
 * using CodeViewer, which fetches content through fetchFileContent and handles
 * loading / unavailable states internally.
 *
 * One file is open at a time (accordion pattern). A second click on the same
 * file collapses it.
 */

import { useState } from 'react';
import { CodeViewer } from '../CodeViewer';

// ── Tiny inline icons (Lucide-style, 1.5 px stroke) ──────────────────────────

function IconFile({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Section header (shared style with the rest of the wiki) ──────────────────

function SectionHeader({ id, title }: { id: string; title: string }) {
  return (
    <h2
      id={id}
      className="scroll-mt-[60px] flex items-center gap-2 border-b border-ph-border pb-2 pt-6 font-sans text-[16px] font-bold text-ph-ink"
    >
      {title}
    </h2>
  );
}

const Divider = () => <hr className="my-6 border-0 border-t border-ph-border-soft" />;

// ── File row with expandable CodeViewer ───────────────────────────────────────

function FileRow({
  path,
  isOpen,
  onToggle,
}: {
  path: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-ph border border-ph-border mb-2 last:mb-0">
      {/* Header button */}
      <button
        onClick={onToggle}
        className={[
          'flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors',
          isOpen
            ? 'bg-ph-surface-soft border-b border-ph-border'
            : 'bg-ph-surface hover:bg-ph-surface-soft',
        ].join(' ')}
        aria-expanded={isOpen}
      >
        <IconChevronRight
          className={[
            'h-3.5 w-3.5 shrink-0 text-ph-ash transition-transform duration-150',
            isOpen ? 'rotate-90' : '',
          ].join(' ')}
        />
        <IconFile className="h-4 w-4 shrink-0 text-ph-mute" />
        <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ph-body" title={path}>
          {path}
        </code>
      </button>

      {/* Inline CodeViewer — mounts only when open */}
      {isOpen && (
        <div className="bg-[#23251D]">
          <CodeViewer
            path={path}
            maxHeight="42vh"
            className="rounded-none border-0"
          />
        </div>
      )}
    </div>
  );
}

// ── Cluster roll-up variant ───────────────────────────────────────────────────

function ClusterFileGroup({
  moduleLabel,
  files,
  openPath,
  onToggle,
}: {
  moduleLabel: string;
  files: string[];
  openPath: string | null;
  onToggle: (path: string) => void;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-2 font-sans text-[12px] font-semibold text-ph-mute">{moduleLabel}</p>
      <div className="pl-1">
        {files.map((f) => (
          <FileRow
            key={f}
            path={f}
            isOpen={openPath === f}
            onToggle={() => onToggle(f)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface WikiSourceFilesProps {
  /** Node kind — determines whether to use flat list or cluster roll-up. */
  kind: 'cluster' | 'module' | 'file';
  /** Files for a module/file node. */
  files?: string[];
  /** Grouped files for a cluster node. */
  clusterGroups?: { moduleId: string; moduleLabel: string; files: string[] }[];
}

/**
 * WikiSourceFiles — renders the "Source files" wiki section.
 *
 * Returns null when there are no files to show (the section is silently omitted,
 * consistent with how the rest of the wiki handles empty sections).
 */
export function WikiSourceFiles({ kind, files = [], clusterGroups = [] }: WikiSourceFilesProps) {
  // Track which file is currently expanded (accordion: one at a time).
  const [openPath, setOpenPath] = useState<string | null>(null);

  const toggle = (path: string) =>
    setOpenPath((prev) => (prev === path ? null : path));

  // ── Cluster roll-up ──
  if (kind === 'cluster') {
    const hasAny = clusterGroups.some((g) => g.files.length > 0);
    if (!hasAny) return null;

    return (
      <section>
        <Divider />
        <SectionHeader id="source-files" title="Source files" />
        <div className="mt-3">
          {clusterGroups.map((group) =>
            group.files.length === 0 ? null : (
              <ClusterFileGroup
                key={group.moduleId}
                moduleLabel={group.moduleLabel}
                files={group.files}
                openPath={openPath}
                onToggle={toggle}
              />
            ),
          )}
        </div>
      </section>
    );
  }

  // ── Module / file flat list ──
  const cleanFiles = files.filter((f) => f.trim() !== '');
  if (cleanFiles.length === 0) return null;

  return (
    <section>
      <Divider />
      <SectionHeader id="source-files" title="Source files" />
      <div className="mt-3">
        {cleanFiles.map((f) => (
          <FileRow
            key={f}
            path={f}
            isOpen={openPath === f}
            onToggle={() => toggle(f)}
          />
        ))}
      </div>
    </section>
  );
}
