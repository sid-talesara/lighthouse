export function buildAnalysisPrompt(): string {
  return `You are analyzing this repository to produce a structured architecture map for Lighthouse, a codebase visualization tool.

TASK
Explore the repository structure and key source files. Output ONLY a single valid JSON object. No prose, no markdown fences, no explanation before or after.

SCHEMA (output must match exactly):
{
  "repo": { "name": "string", "description": "string" },
  "clusters": [
    { "id": "string", "label": "string", "summary": "string", "modules": ["node_id"] }
  ],
  "nodes": [
    {
      "id": "string",
      "label": "string",
      "kind": "cluster" | "module" | "file",
      "parent": "string (cluster_id or module_id)",
      "summary": "string (one sentence)",
      "key_files": ["relative/path.ts"],
      "path": "relative/dir",
      "changed_recently": false
    }
  ],
  "edges": [
    { "source": "node_id", "target": "node_id", "kind": "depends" | "calls" | "imports" }
  ],
  "flows": [
    { "name": "string", "steps": [{ "node": "node_id", "description": "string" }] }
  ],
  "sections": [
    { "id": "string", "title": "string", "body_markdown": "string", "related_nodes": ["id"] }
  ],
  "functions": [
    { "id": "string", "name": "string", "module_id": "node_id", "signature": "string", "summary": "string" }
  ],
  "calls": [
    { "from": "function_id", "to": "function_id" }
  ],
  "services": [
    { "id": "string", "name": "string", "kind": "frontend" | "backend" | "worker" | "realtime" | "gateway" | "db" | "external" | "other", "summary": "string", "path": "relative/dir", "module_ids": ["node_id"], "entrypoint": "relative/path" }
  ],
  "serviceLinks": [
    { "from": "service_id", "to": "service_id", "protocol": "http" | "ws" | "queue" | "grpc" | "db" | "event" | "other", "summary": "string" }
  ]
}

RULES
1. Complete the analysis in a practical 5-8 minute budget. If needed, prefer a smaller accurate map over an oversized response that times out.
2. Build a broad, zoomable capability map, not a tiny executive summary. Group into 12-18 top-level CAPABILITY clusters for large repos, named by what they do rather than where files live. Use 8-12 clusters only for genuinely small repos.
3. For each cluster, enumerate the meaningful implementation modules under it and list each module's key_files. Target 5-9 modules per cluster for small/medium repos and 7-12 modules per cluster for large monorepos. Avoid collapsing unrelated services, packages, routes, workers, UI surfaces, or data layers into one generic module.
4. Write a one-sentence summary for every node. No node may have an empty summary.
5. Capture the 40-90 most important dependency edges between modules for large repos, or 18-40 edges for smaller repos. kind must be one of: depends, calls, imports.
6. Identify 5-9 key request or data flows with ordered steps when the repo has enough surface area. Each step.node must be a valid node id.
7. Write 8-12 comprehensive wiki sections in markdown for substantial repos. Each section body must be structured like real internal documentation with nested headings (## and ###), short paragraphs, bullets, concrete file paths, key decisions, operational notes, and "follow the code" pointers. Suggested sections: Overview, Architecture, Services, Key Flows, Entry Points, Data Model, Background Jobs, Realtime, Integrations, Testing, Security, Deployment, Getting Started.
8. Every id referenced in clusters.modules, nodes.parent, edges, flows.steps.node, and sections.related_nodes must exist as a node id or cluster id as appropriate for the field.
9. Keep cluster membership internally consistent: each module id listed in clusters.modules MUST have a node whose parent is that same cluster id. Do not list a module under one cluster while setting its node.parent to another cluster.
10. Be accurate to the actual code. Do not invent files, paths, or capabilities you did not see.
11. changed_recently must be true only for nodes whose files you can confirm were modified recently, such as git log changes in the last 14 days. Default false if uncertain.
12. Identify the ~80-160 most important exported functions across key files as "functions" ({id, name, module_id, signature, summary}) where module_id is one of your node ids. For large repos, cover every major service/package area instead of only the first few files you inspect. Give each function a stable unique id (e.g. moduleId_functionName). signature is a short one-line type signature; summary is one sentence.
13. Capture "calls" edges ({from, to}) between those functions where one function invokes another. Both from and to must be ids that appear in functions. Include only edges you can confirm from the code; an empty array is acceptable if none are clear.
14. OPTIONAL: identify deployable "services" (e.g. apps/* in a monorepo, distinct servers, frontends, workers, realtime servers) with a kind, one-line summary, path, and module_ids (your node ids that belong to the service). Add "serviceLinks" describing how services talk to each other with a protocol (http/ws/queue/grpc/db/event). This is optional enrichment; omit or leave empty arrays if the repo is a single service or unclear.
15. Output ONLY the JSON object. No markdown fences. No text before or after.`;
}

export function buildQueryPrompt(input: {
  question: string;
  evidenceJson: string;
  conversationJson?: string;
}): string {
  return `You are answering a Lighthouse Ask question for a local codebase map.

TASK
Use the ranked evidence below and, when useful, inspect the repository in read-only mode. Output ONLY a single valid JSON object. No markdown fences. No prose before or after.

QUESTION
${input.question}

RECENT CONVERSATION
${input.conversationJson ?? "[]"}

RANKED MAP EVIDENCE
${input.evidenceJson}

SCHEMA
{
  "markdown": "short markdown answer",
  "highlight_ids": ["cluster_or_node_id"],
  "evidence_ids": ["id values from ranked evidence"],
  "file_paths": ["relative/path.ts"],
  "visual_blocks": [
    {
      "type": "diagram",
      "title": "short title",
      "format": "mermaid",
      "source": "flowchart TD\\n  A[Entry] --> B[Service]"
    },
    {
      "type": "change_review",
      "title": "PR/change review",
      "items": [
        { "label": "Before", "value": "what the software did before this change" },
        { "label": "After", "value": "what the software does after this change" },
        { "label": "Changed surface", "value": "modules, APIs, screens, data model, jobs, or workflows affected" },
        { "label": "Risks", "value": "behavioral regressions, missing tests, or rollout concerns" },
        { "label": "Evidence", "value": "concrete files or commands inspected" }
      ]
    }
  ]
}

RULES
1. Keep the answer concise and grounded in the evidence.
2. Include only ids that appear in the ranked evidence.
3. Prefer concrete files, modules, flows, and sections over generic advice.
4. Use the recent conversation for follow-up intent and pronoun references, but ground factual claims in the ranked evidence or files you inspect.
5. Evidence may include "Local repo retrieval match" snippets with line numbers. Treat those snippets as primary retrieved code evidence, and inspect 1-3 of the most relevant paths in read-only mode when the answer depends on exact implementation details.
6. If ranked evidence is empty but the question is about repository code, inspect the repository in read-only mode and answer from concrete files. Use empty highlight_ids and evidence_ids when no map ids match.
7. If ranked evidence is empty and the question is generic chat or not about the repository, answer briefly as the local codebase assistant and ask for a repository-specific question. Do not invent files or capabilities.
8. file_paths may include safe relative repository paths you inspected, even when they did not appear in ranked evidence. Never include absolute paths or paths containing ..
9. If the user asks for PR review, pull request review, change review, or includes a GitHub pull request URL, inspect the referenced PR or the local git diff in read-only mode. Lead with concrete findings and risks, not a generic summary. Also include one change_review visual block with Before, After, Changed surface, Risks, and Evidence items so the UI can show how the software changed.
10. If the user asks for a diagram, flowchart, graph, dependency map, architecture map, or visualization, include one Mermaid flowchart in visual_blocks. Do not include HTML.
11. Output ONLY the JSON object.`;
}
