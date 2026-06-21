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
1. Group into 5-8 top-level CAPABILITY clusters, named by what they do rather than where files live.
2. For each cluster, enumerate 2-6 modules and list each module's key_files.
3. Write a one-sentence summary for every node. No node may have an empty summary.
4. Capture the 5-10 most important dependency edges between modules. kind must be one of: depends, calls, imports.
5. Identify 2-3 key request or data flows with ordered steps. Each step.node must be a valid node id.
6. Write 4-6 wiki sections in markdown. Suggested sections: Overview, Architecture, Key Flows, Entry Points, Data Model, Getting Started.
7. Every id referenced in clusters.modules, nodes.parent, edges, flows.steps.node, and sections.related_nodes must exist as a node id or cluster id as appropriate for the field.
8. Be accurate to the actual code. Do not invent files, paths, or capabilities you did not see.
9. changed_recently must be true only for nodes whose files you can confirm were modified recently, such as git log changes in the last 14 days. Default false if uncertain.
10. Identify the ~20-40 most important exported functions across key files as "functions" ({id, name, module_id, signature, summary}) where module_id is one of your node ids. Give each function a stable unique id (e.g. moduleId_functionName). signature is a short one-line type signature; summary is one sentence.
11. Capture "calls" edges ({from, to}) between those functions where one function invokes another. Both from and to must be ids that appear in functions. Include only edges you can confirm from the code; an empty array is acceptable if none are clear.
12. OPTIONAL: identify deployable "services" (e.g. apps/* in a monorepo, distinct servers, frontends, workers, realtime servers) with a kind, one-line summary, path, and module_ids (your node ids that belong to the service). Add "serviceLinks" describing how services talk to each other with a protocol (http/ws/queue/grpc/db/event). This is optional enrichment; omit or leave empty arrays if the repo is a single service or unclear.
13. Output ONLY the JSON object. No markdown fences. No text before or after.`;
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
