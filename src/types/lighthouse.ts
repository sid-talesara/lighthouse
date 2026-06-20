// §7 data contract — exact model of data.json

export interface Repo {
  name: string;
  description: string;
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

export interface LighthouseData {
  repo: Repo;
  clusters: Cluster[];
  nodes: LighthouseNode[];
  edges: Edge[];
  flows: Flow[];
  sections: Section[];
}
