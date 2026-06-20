import { type NodeProps } from '@xyflow/react'

export interface ClusterNodeData {
  label: string;
  summary: string;
  moduleCount: number;
}

export function ClusterNode({ data }: NodeProps) {
  const d = data as unknown as ClusterNodeData;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-5 py-4 min-w-[180px] shadow-lg">
      <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">cluster</div>
      <div className="text-base font-semibold text-slate-100">{d.label}</div>
      <div className="mt-2 text-xs text-slate-400 leading-snug line-clamp-2">{d.summary}</div>
      <div className="mt-3 text-xs font-mono text-indigo-400">{d.moduleCount} module{d.moduleCount !== 1 ? 's' : ''}</div>
    </div>
  );
}
