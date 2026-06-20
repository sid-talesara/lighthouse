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
10. Output ONLY the JSON object. No markdown fences. No text before or after.`;
}
