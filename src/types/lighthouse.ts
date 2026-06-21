// §7 data contract — exact model of data.json

export interface Repo {
  name: string;
  description: string;
  /** Absolute local path for the generated repo, present only for local generated data. */
  path?: string;
}

export interface IndexedFile {
  path: string;
  language: string;
  size_bytes: number;
}

export type NodeKind = 'cluster' | 'module' | 'file';
export type EdgeKind = 'depends' | 'calls' | 'imports';

export interface Cluster {
  id: string;
  label: string;
  summary: string;
  modules: string[]; // node ids
}

export interface LighthouseNode {
  id: string;
  label: string;
  kind: NodeKind;
  parent: string; // cluster id or module id
  summary: string;
  key_files: string[];
  path: string;
  changed_recently: boolean;
}

export interface Edge {
  source: string; // node id
  target: string; // node id
  kind: EdgeKind;
}

export interface FlowStep {
  node: string; // node id
  description: string;
}

export interface Flow {
  name: string;
  steps: FlowStep[];
}

export interface Section {
  id: string;
  title: string;
  body_markdown: string;
  related_nodes: string[]; // node ids or cluster ids
}

// ── PR / change-evolution dimension ──────────────────────────────────────────

export type PullRequestStatus = 'merged' | 'open' | 'draft';
export type ChangeKind = 'added' | 'modified' | 'removed';

export interface PullRequestTouch {
  node_id: string; // references a node or cluster id
  change: ChangeKind;
}

export interface PullRequest {
  id: string;
  title: string;
  author: string;
  date: string; // ISO date string
  status: PullRequestStatus;
  summary: string;
  touched: PullRequestTouch[];
  additions?: number;
  deletions?: number;
}

// ── Database schema dimension ─────────────────────────────────────────────────

export interface DbColumn {
  name: string;
  type: string;
  pk?: boolean;
  fk?: string; // references another DbTable id
}

export interface DbTable {
  id: string;
  name: string;
  module_id?: string; // owning node id
  columns: DbColumn[];
  summary?: string;
}

// ── Functions / call-graph dimension ──────────────────────────────────────────

export interface FunctionNode {
  id: string;
  name: string;
  module_id: string; // owning node id
  signature?: string;
  summary?: string;
}

export interface CallEdge {
  from: string; // function id
  to: string; // function id
}

// ── Service-architecture dimension ────────────────────────────────────────────

export type ServiceKind =
  | 'frontend'
  | 'backend'
  | 'worker'
  | 'realtime'
  | 'gateway'
  | 'db'
  | 'external'
  | 'other';

export interface Service {
  id: string;
  name: string;
  kind: ServiceKind;
  summary: string;
  path?: string; // relative dir of the deployable service
  module_ids?: string[]; // node ids that belong to this service
  entrypoint?: string; // relative path to the service entrypoint
}

export type ServiceProtocol = 'http' | 'ws' | 'queue' | 'grpc' | 'db' | 'event' | 'other';

export interface ServiceLink {
  from: string; // service id
  to: string; // service id
  protocol: ServiceProtocol;
  summary?: string;
}

export interface LighthouseData {
  repo: Repo;
  files?: IndexedFile[];
  clusters: Cluster[];
  nodes: LighthouseNode[];
  edges: Edge[];
  flows: Flow[];
  sections: Section[];
  // New optional dimensions (kept optional so existing data stays valid).
  pullRequests?: PullRequest[];
  dbTables?: DbTable[];
  functions?: FunctionNode[];
  calls?: CallEdge[];
  services?: Service[];
  serviceLinks?: ServiceLink[];
}
