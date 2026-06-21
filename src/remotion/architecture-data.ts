import {staticFile, useDelayRender} from 'remotion';
import {useEffect, useMemo, useState} from 'react';
import type {Cluster, Edge, Flow, LighthouseData, LighthouseNode, Section, Service, ServiceLink} from '../types/lighthouse';

export interface EvidenceFileCard {
  path: string;
  moduleId: string;
  moduleLabel: string;
  clusterLabel: string;
  summary: string;
}

export interface ArchitectureSnapshot {
  repo: LighthouseData['repo'];
  clusters: Cluster[];
  nodes: LighthouseNode[];
  edges: Edge[];
  flows: Flow[];
  sections: Section[];
  services: Service[];
  serviceLinks: ServiceLink[];
  changedModules: LighthouseNode[];
  topClusters: Cluster[];
  topServices: Service[];
  primaryFlows: Flow[];
  keySections: Section[];
  evidenceFiles: EvidenceFileCard[];
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(item);
  }
  return result;
}

function sortByModuleCoverage<T extends {modules?: string[]; module_ids?: string[]}>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.modules?.length ?? b.module_ids?.length ?? 0) - (a.modules?.length ?? a.module_ids?.length ?? 0));
}

function buildPrimaryFlows(flows: Flow[]): Flow[] {
  const names = ['Manual test case run', 'Browser recording to editable steps', 'AI-assisted test authoring'];
  const prioritized = names
    .map((name) => flows.find((flow) => flow.name === name))
    .filter((flow): flow is Flow => Boolean(flow));
  const rest = flows.filter((flow) => !prioritized.includes(flow));
  return [...prioritized, ...rest].slice(0, 3);
}

function buildKeySections(sections: Section[]): Section[] {
  const priorityIds = ['sec_overview', 'sec_architecture', 'sec_key_flows', 'sec_entry_points'];
  const prioritized = priorityIds
    .map((id) => sections.find((section) => section.id === id))
    .filter((section): section is Section => Boolean(section));
  const rest = sections.filter((section) => !prioritized.includes(section));
  return [...prioritized, ...rest].slice(0, 4);
}

export function buildArchitectureSnapshot(data: LighthouseData): ArchitectureSnapshot {
  const clusterById = new Map(data.clusters.map((cluster) => [cluster.id, cluster]));

  const changedModules = data.nodes.filter((node) => node.kind === 'module' && node.changed_recently);
  const topClusters = sortByModuleCoverage(data.clusters).slice(0, 7);
  const topServices = sortByModuleCoverage(data.services ?? []).slice(0, 8);
  const primaryFlows = buildPrimaryFlows(data.flows);
  const keySections = buildKeySections(data.sections);

  const evidenceFiles = dedupeBy(
    changedModules.flatMap((module) =>
      module.key_files.map((path) => ({
        path,
        moduleId: module.id,
        moduleLabel: module.label,
        clusterLabel: clusterById.get(module.parent)?.label ?? module.parent,
        summary: module.summary,
      })),
    ),
    (entry) => entry.path,
  ).slice(0, 8);

  return {
    repo: data.repo,
    clusters: data.clusters,
    nodes: data.nodes,
    edges: data.edges,
    flows: data.flows,
    sections: data.sections,
    services: data.services ?? [],
    serviceLinks: data.serviceLinks ?? [],
    changedModules,
    topClusters,
    topServices,
    primaryFlows,
    keySections,
    evidenceFiles,
  };
}

export function useArchitectureData() {
  const [data, setData] = useState<LighthouseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [handle] = useState(() => delayRender('load-architecture-data'));

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const response = await fetch(staticFile('data.json'));
        if (!response.ok) {
          throw new Error(`Failed to load data.json: ${response.status} ${response.statusText}`);
        }
        const json = (await response.json()) as LighthouseData;
        if (!mounted) return;
        setData(json);
        continueRender(handle);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load architecture data.';
        if (mounted) {
          setError(message);
        }
        cancelRender(err instanceof Error ? err : new Error(message));
      }
    })();

    return () => {
      mounted = false;
    };
  }, [cancelRender, continueRender, handle]);

  const snapshot = useMemo(() => (data ? buildArchitectureSnapshot(data) : null), [data]);

  return {snapshot, error};
}
