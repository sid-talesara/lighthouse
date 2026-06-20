import { z } from "zod";

const NonEmptyString = z.string().trim().min(1);
const NodeKind = z.enum(["cluster", "module", "file"]);
const EdgeKind = z.enum(["depends", "calls", "imports"]);

const ClusterSchema = z.object({
  id: NonEmptyString,
  label: NonEmptyString,
  summary: NonEmptyString,
  modules: z.array(NonEmptyString),
});

const NodeSchema = z.object({
  id: NonEmptyString,
  label: NonEmptyString,
  kind: NodeKind,
  parent: NonEmptyString,
  summary: NonEmptyString,
  key_files: z.array(NonEmptyString),
  path: z.string().trim(),
  changed_recently: z.boolean(),
});

const EdgeSchema = z.object({
  source: NonEmptyString,
  target: NonEmptyString,
  kind: EdgeKind,
});

const FlowSchema = z.object({
  name: NonEmptyString,
  steps: z.array(
    z.object({
      node: NonEmptyString,
      description: NonEmptyString,
    }),
  ),
});

const SectionSchema = z.object({
  id: NonEmptyString,
  title: NonEmptyString,
  body_markdown: NonEmptyString,
  related_nodes: z.array(NonEmptyString),
});

const FileInventoryEntrySchema = z.object({
  path: NonEmptyString,
  language: NonEmptyString,
  size_bytes: z.number().int().nonnegative(),
});

// ── New additive dimensions ───────────────────────────────────────────────────

const PullRequestStatus = z.enum(["merged", "open", "draft"]);
const ChangeKind = z.enum(["added", "modified", "removed"]);

const PullRequestTouchSchema = z.object({
  node_id: NonEmptyString,
  change: ChangeKind,
});

const PullRequestSchema = z.object({
  id: NonEmptyString,
  title: NonEmptyString,
  author: NonEmptyString,
  date: NonEmptyString,
  status: PullRequestStatus,
  summary: z.string(),
  touched: z.array(PullRequestTouchSchema),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
});

const DbColumnSchema = z.object({
  name: NonEmptyString,
  type: NonEmptyString,
  pk: z.boolean().optional(),
  fk: z.string().optional(),
});

const DbTableSchema = z.object({
  id: NonEmptyString,
  name: NonEmptyString,
  module_id: z.string().optional(),
  columns: z.array(DbColumnSchema),
  summary: z.string().optional(),
});

const FunctionNodeSchema = z.object({
  id: NonEmptyString,
  name: NonEmptyString,
  module_id: NonEmptyString,
  signature: z.string().optional(),
  summary: z.string().optional(),
});

const CallEdgeSchema = z.object({
  from: NonEmptyString,
  to: NonEmptyString,
});

const ServiceKind = z.enum([
  "frontend",
  "backend",
  "worker",
  "realtime",
  "gateway",
  "db",
  "external",
  "other",
]);
const ServiceProtocol = z.enum(["http", "ws", "queue", "grpc", "db", "event", "other"]);

const ServiceSchema = z.object({
  id: NonEmptyString,
  name: NonEmptyString,
  kind: ServiceKind,
  summary: z.string(),
  path: z.string().optional(),
  module_ids: z.array(NonEmptyString).optional(),
  entrypoint: z.string().optional(),
});

const ServiceLinkSchema = z.object({
  from: NonEmptyString,
  to: NonEmptyString,
  protocol: ServiceProtocol,
  summary: z.string().optional(),
});

function addDuplicateIssues(
  ctx: z.RefinementCtx,
  values: string[],
  pathPrefix: string,
): void {
  const firstSeen = new Map<string, number>();
  values.forEach((value, index) => {
    const firstIndex = firstSeen.get(value);
    if (firstIndex === undefined) {
      firstSeen.set(value, index);
      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate id "${value}" also appears at ${pathPrefix}.${firstIndex}.id`,
      path: [pathPrefix, index, "id"],
    });
  });
}

export const LighthouseDataSchema = z
  .object({
    repo: z.object({
      name: NonEmptyString,
      description: NonEmptyString,
    }),
    clusters: z.array(ClusterSchema),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
    flows: z.array(FlowSchema),
    sections: z.array(SectionSchema),
    files: z.array(FileInventoryEntrySchema).optional(),
    pullRequests: z.array(PullRequestSchema).optional(),
    dbTables: z.array(DbTableSchema).optional(),
    functions: z.array(FunctionNodeSchema).optional(),
    calls: z.array(CallEdgeSchema).optional(),
    services: z.array(ServiceSchema).optional(),
    serviceLinks: z.array(ServiceLinkSchema).optional(),
  })
  .superRefine((data, ctx) => {
    const clusterIds = new Set(data.clusters.map((cluster) => cluster.id));
    const nodeIds = new Set(data.nodes.map((node) => node.id));
    const allGraphIds = new Set([...clusterIds, ...nodeIds]);

    addDuplicateIssues(
      ctx,
      data.clusters.map((cluster) => cluster.id),
      "clusters",
    );
    addDuplicateIssues(
      ctx,
      data.nodes.map((node) => node.id),
      "nodes",
    );
    addDuplicateIssues(
      ctx,
      data.sections.map((section) => section.id),
      "sections",
    );

    data.clusters.forEach((cluster, clusterIndex) => {
      cluster.modules.forEach((moduleId, moduleIndex) => {
        if (!nodeIds.has(moduleId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `clusters.modules reference missing node id "${moduleId}"`,
            path: ["clusters", clusterIndex, "modules", moduleIndex],
          });
          return;
        }

        const moduleNode = data.nodes.find((node) => node.id === moduleId);
        if (moduleNode && moduleNode.parent !== cluster.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `module "${moduleId}" must use parent "${cluster.id}"`,
            path: ["clusters", clusterIndex, "modules", moduleIndex],
          });
        }
      });
    });

    data.nodes.forEach((node, nodeIndex) => {
      if (!allGraphIds.has(node.parent)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `node.parent references missing id "${node.parent}"`,
          path: ["nodes", nodeIndex, "parent"],
        });
      }

      if (node.parent === node.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "node.parent cannot reference the same node",
          path: ["nodes", nodeIndex, "parent"],
        });
      }
    });

    data.edges.forEach((edge, edgeIndex) => {
      if (!nodeIds.has(edge.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edge.source references missing node id "${edge.source}"`,
          path: ["edges", edgeIndex, "source"],
        });
      }
      if (!nodeIds.has(edge.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edge.target references missing node id "${edge.target}"`,
          path: ["edges", edgeIndex, "target"],
        });
      }
    });

    data.flows.forEach((flow, flowIndex) => {
      flow.steps.forEach((step, stepIndex) => {
        if (!nodeIds.has(step.node)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `flow step references missing node id "${step.node}"`,
            path: ["flows", flowIndex, "steps", stepIndex, "node"],
          });
        }
      });
    });

    data.sections.forEach((section, sectionIndex) => {
      section.related_nodes.forEach((relatedNode, relatedIndex) => {
        if (!allGraphIds.has(relatedNode)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `section related_nodes references missing id "${relatedNode}"`,
            path: ["sections", sectionIndex, "related_nodes", relatedIndex],
          });
        }
      });
    });
  });

export type LighthouseData = z.infer<typeof LighthouseDataSchema>;
