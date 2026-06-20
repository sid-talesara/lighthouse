import { readdir } from "node:fs/promises";

import type { LighthouseData } from "../validate/schema.js";
import type { TrackedFileInventoryEntry } from "./tracked-files.js";

type ParsedNode = LighthouseData["nodes"][number];
type ParsedCluster = LighthouseData["clusters"][number];
type Service = NonNullable<LighthouseData["services"]>[number];
type ServiceKind = Service["kind"];
type ServiceLink = NonNullable<LighthouseData["serviceLinks"]>[number];
type ServiceProtocol = ServiceLink["protocol"];

export interface DerivedServices {
  services: Service[];
  serviceLinks: ServiceLink[];
}

/**
 * Infer a deployable-service kind from the service name and path.
 * web/frontend → frontend, api → backend, ws/socket/collab → realtime,
 * worker/queue/job → worker, gateway/proxy → gateway, etc.
 */
function inferKind(name: string, path: string): ServiceKind {
  const haystack = `${name} ${path}`.toLowerCase();
  if (/\b(ws|socket|websocket|collab|realtime|presence)\b/.test(haystack)) return "realtime";
  if (/\b(worker|queue|jobs?|cron|scheduler|consumer)\b/.test(haystack)) return "worker";
  if (/\b(gateway|proxy|tunnel|ingress|edge)\b/.test(haystack)) return "gateway";
  if (/\b(api|server|backend|service|graphql|rest)\b/.test(haystack)) return "backend";
  if (
    /\b(web|frontend|client|app|ui|dashboard|site|landing|docs|mobile|pwa|desktop|extension)\b/.test(
      haystack,
    )
  ) {
    return "frontend";
  }
  if (/\b(db|database|migrations?|prisma|drizzle)\b/.test(haystack)) return "db";
  return "other";
}

function prettyName(dir: string): string {
  return dir
    .split(/[/_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Find module node ids whose path/key_files live under a service directory. */
function moduleIdsUnder(dir: string, nodes: ParsedNode[]): string[] {
  const prefix = dir.replace(/^\.\//, "").replace(/\/$/, "");
  const ids: string[] = [];
  for (const node of nodes) {
    const nodePath = (node.path ?? "").replace(/^\.\//, "").replace(/\/$/, "");
    const underPath = nodePath === prefix || nodePath.startsWith(`${prefix}/`);
    const underKeyFile = (node.key_files ?? []).some((file) => {
      const normalized = file.replace(/^\.\//, "");
      return normalized === prefix || normalized.startsWith(`${prefix}/`);
    });
    if (underPath || underKeyFile) ids.push(node.id);
  }
  return ids;
}

/** Pick a likely entrypoint file for a service from its tracked files. */
function findEntrypoint(dir: string, files: TrackedFileInventoryEntry[]): string | undefined {
  const prefix = `${dir.replace(/\/$/, "")}/`;
  const candidates = files.filter((file) => file.path.startsWith(prefix));
  const patterns = [
    /\/(src\/)?(index|main|server|app)\.(ts|tsx|js|mjs)$/,
    /\/(src\/)?(index|main|server|app|__main__)\.py$/,
    /\/(src\/)?(main|index)\.(go|rs)$/,
  ];
  for (const pattern of patterns) {
    const hit = candidates.find((file) => pattern.test(`/${file.path}`));
    if (hit) return hit.path;
  }
  return undefined;
}

/** List immediate subdirectories of a tracked top-level dir (e.g. apps/*). */
function subdirsOf(parent: string, files: TrackedFileInventoryEntry[]): string[] {
  const prefix = `${parent}/`;
  const dirs = new Set<string>();
  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const rest = file.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash > 0) dirs.add(`${parent}/${rest.slice(0, slash)}`);
  }
  return [...dirs].sort();
}

/** True when `parent` exists as a tracked top-level directory. */
function hasDir(parent: string, files: TrackedFileInventoryEntry[]): boolean {
  const prefix = `${parent}/`;
  return files.some((file) => file.path.startsWith(prefix));
}

/**
 * Choose a sensible protocol guess for a cross-service edge from the kinds of
 * the two services. frontend→realtime = ws, →worker = queue, →db = db, else http.
 */
function protocolFor(fromKind: ServiceKind, toKind: ServiceKind): ServiceProtocol {
  if (toKind === "realtime") return "ws";
  if (toKind === "worker") return "queue";
  if (toKind === "db") return "db";
  if (toKind === "external") return "other";
  return "http";
}

/**
 * Derive deployable services + their interconnections from repo structure.
 *
 * Strategy (best-effort, degrades gracefully):
 *  1. Monorepo: detect top-level `apps/*` (and `services/*`/`packages/*` app-like
 *     dirs) as distinct services.
 *  2. Non-monorepo: fall back to well-known single-service dirs, else map each
 *     cluster to a coarse service, else return [].
 *  3. Map module_ids by matching node paths under each service dir.
 *  4. Derive serviceLinks from existing module edges that cross service
 *     boundaries, with a protocol guess from the service kinds.
 */
export async function deriveServices(
  repoPath: string,
  files: TrackedFileInventoryEntry[],
  nodes: ParsedNode[],
  clusters: ParsedCluster[],
  edges: LighthouseData["edges"] = [],
): Promise<DerivedServices> {
  const serviceDirs = await detectServiceDirs(repoPath, files);

  let services: Service[];
  if (serviceDirs.length > 0) {
    services = serviceDirs.map((dir) => {
      const name = prettyName(dir.split("/").slice(-1)[0] ?? dir);
      const kind = inferKind(name, dir);
      const moduleIds = moduleIdsUnder(dir, nodes);
      const entrypoint = findEntrypoint(dir, files);
      const service: Service = {
        id: `svc_${dir.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`,
        name,
        kind,
        summary: `${kind} service deployed from ${dir}.`,
        path: dir,
      };
      if (moduleIds.length > 0) service.module_ids = moduleIds;
      if (entrypoint) service.entrypoint = entrypoint;
      return service;
    });
  } else {
    // Non-monorepo fallback: one coarse service per cluster (or a single service).
    services = clusters.map((cluster) => ({
      id: `svc_${cluster.id}`,
      name: cluster.label,
      kind: inferKind(cluster.label, cluster.summary),
      summary: cluster.summary,
      module_ids: cluster.modules.slice(),
    }));
  }

  if (services.length === 0) return { services: [], serviceLinks: [] };

  const serviceLinks = deriveServiceLinks(services, edges);
  return { services, serviceLinks };
}

/** Detect the set of deployable-service directories in a repo. */
async function detectServiceDirs(
  repoPath: string,
  files: TrackedFileInventoryEntry[],
): Promise<string[]> {
  const dirs: string[] = [];

  // Monorepo convention: apps/* and services/* are deployable units.
  for (const root of ["apps", "services"]) {
    if (hasDir(root, files)) dirs.push(...subdirsOf(root, files));
  }

  if (dirs.length > 0) return dirs;

  // Flat monorepo: well-known single-purpose top-level dirs (best-effort).
  const known = [
    "frontend",
    "web",
    "client",
    "ui",
    "api",
    "server",
    "backend",
    "worker",
    "workers",
    "ws-server",
    "runner",
    "runner-py",
    "extension",
    "recorder",
    "cli",
    "agent",
    "email",
    "landing",
    "docs",
  ];
  for (const dir of known) {
    if (hasDir(dir, files)) dirs.push(dir);
  }
  if (dirs.length > 0) return dirs;

  // Last resort: scan top-level directories for package.json-bearing units.
  try {
    const entries = await readdir(repoPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const hasPkg = files.some((file) => file.path === `${entry.name}/package.json`);
      if (hasPkg) dirs.push(entry.name);
    }
  } catch {
    // ignore
  }

  return dirs;
}

/**
 * Build service-to-service links from module edges that cross service
 * boundaries. Dedupes by (from,to) keeping the first protocol guess.
 */
function deriveServiceLinks(
  services: Service[],
  edges: LighthouseData["edges"],
): ServiceLink[] {
  // node id → service id
  const nodeToService = new Map<string, string>();
  for (const service of services) {
    for (const moduleId of service.module_ids ?? []) {
      if (!nodeToService.has(moduleId)) nodeToService.set(moduleId, service.id);
    }
  }
  const kindById = new Map(services.map((service) => [service.id, service.kind]));

  const links = new Map<string, ServiceLink>();
  for (const edge of edges) {
    const fromSvc = nodeToService.get(edge.source);
    const toSvc = nodeToService.get(edge.target);
    if (!fromSvc || !toSvc || fromSvc === toSvc) continue;
    const key = `${fromSvc}->${toSvc}`;
    if (links.has(key)) continue;
    const fromKind = kindById.get(fromSvc) ?? "other";
    const toKind = kindById.get(toSvc) ?? "other";
    links.set(key, {
      from: fromSvc,
      to: toSvc,
      protocol: protocolFor(fromKind, toKind),
    });
  }

  return [...links.values()];
}
