import type { LighthouseData } from "../validate/schema.js";

export type QuerySource = "local-codex" | "local-index" | "no-match";

export interface QueryEvidence {
  id: string;
  kind: "cluster" | "node" | "edge" | "flow" | "section" | "file";
  title: string;
  summary: string;
  score: number;
  highlightIds: string[];
  paths: string[];
}

export interface QueryVisualBlock {
  type: "file_set" | "panel" | "diagram";
  title: string;
  format?: "mermaid";
  source?: string;
  items: Array<{
    label: string;
    value?: string;
    nodeId?: string;
    path?: string;
  }>;
}

export interface QueryProgressEvent {
  type: string;
  message: string;
  elapsedMs: number;
  codexType?: string;
}

export interface QueryAnswer {
  source: QuerySource;
  source_reason: string;
  attempted_codex: boolean;
  indexing_mode: "deterministic-map" | "local-codex-with-map-evidence" | "local-codex-direct";
  markdown: string;
  highlight_ids: string[];
  evidence: QueryEvidence[];
  file_paths: string[];
  visual_blocks: QueryVisualBlock[];
  query_events: QueryProgressEvent[];
  codex_error?: string;
  repo_path_status?: "valid" | "missing" | "invalid";
}

export interface BuildEvidenceInput {
  question: string;
  data: LighthouseData;
}
