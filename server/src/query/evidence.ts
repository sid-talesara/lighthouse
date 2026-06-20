import type { LighthouseData } from "../validate/schema.js";
import type { BuildEvidenceInput, QueryAnswer, QueryEvidence, QueryVisualBlock } from "./types.js";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "hello",
  "hey",
  "hi",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
]);

const MAX_EVIDENCE = 8;
const MAX_HIGHLIGHTS = 10;
const MAX_FILES = 12;
const DIAGRAM_TERMS = /\b(diagram|flowchart|visuali[sz]e|architecture map|dependency map|graph|sequence|flow)\b/i;

function normalizeToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_/-]+/)
    .flatMap((part) => part.split(/[\/_-]+/))
    .map(normalizeToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function countOverlap(questionTokens: Set<string>, text: string): number {
  const evidenceTokens = new Set(tokenize(text));
  let score = 0;
  questionTokens.forEach((token) => {
    if (evidenceTokens.has(token)) score += 1;
  });
  return score;
}

function compactSummary(value: string, maxLength = 220): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}...`;
}

function mermaidLabel(value: string): string {
  return value.replace(/["\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 72);
}

export function wantsDiagram(question: string): boolean {
  return DIAGRAM_TERMS.test(question);
}

function nodeLabel(data: LighthouseData, id: string): string {
  const node = data.nodes.find((item) => item.id === id);
  if (node) return node.label;
  const cluster = data.clusters.find((item) => item.id === id);
  return cluster?.label ?? id;
}

function scoreEvidence(
  question: string,
  questionTokens: Set<string>,
  evidence: Omit<QueryEvidence, "score">,
): QueryEvidence {
  const haystack = [
    evidence.id,
    evidence.kind,
    evidence.title,
    evidence.summary,
    evidence.highlightIds.join(" "),
    evidence.paths.join(" "),
  ].join(" ");
  const normalizedQuestion = question.toLowerCase();
  const normalizedHaystack = haystack.toLowerCase();
  const phraseBoost = normalizedHaystack.includes(normalizedQuestion) ? 4 : 0;
  const pathBoost = evidence.paths.some((path) => normalizedQuestion.includes(path.toLowerCase())) ? 3 : 0;

  return {
    ...evidence,
    score: countOverlap(questionTokens, haystack) + phraseBoost + pathBoost,
  };
}

function buildCandidates(data: LighthouseData): Array<Omit<QueryEvidence, "score">> {
  const candidates: Array<Omit<QueryEvidence, "score">> = [];
  const mappedFilePaths = new Set<string>();

  for (const cluster of data.clusters) {
    const modules = cluster.modules.map((id) => nodeLabel(data, id));
    candidates.push({
      id: cluster.id,
      kind: "cluster",
      title: cluster.label,
      summary: compactSummary(`${cluster.summary} Modules: ${modules.join(", ")}`),
      highlightIds: [cluster.id, ...cluster.modules],
      paths: [],
    });
  }

  for (const node of data.nodes) {
    candidates.push({
      id: node.id,
      kind: "node",
      title: node.label,
      summary: compactSummary(`${node.kind} in ${node.path || "repo root"}. ${node.summary}`),
      highlightIds: [node.id, node.parent],
      paths: unique([node.path, ...node.key_files]),
    });

    for (const filePath of node.key_files) {
      mappedFilePaths.add(filePath);
      candidates.push({
        id: `${node.id}:${filePath}`,
        kind: "file",
        title: filePath,
        summary: compactSummary(`${filePath} belongs to ${node.label}. ${node.summary}`),
        highlightIds: [node.id, node.parent],
        paths: [filePath],
      });
    }
  }

  for (const file of data.files ?? []) {
    if (mappedFilePaths.has(file.path)) continue;
    candidates.push({
      id: `file:${file.path}`,
      kind: "file",
      title: file.path,
      summary: `${file.language} file from full tracked inventory (${file.size_bytes} bytes). This file is not assigned to an architecture map module yet.`,
      highlightIds: [],
      paths: [file.path],
    });
  }

  for (const edge of data.edges) {
    candidates.push({
      id: `${edge.source}->${edge.target}`,
      kind: "edge",
      title: `${nodeLabel(data, edge.source)} ${edge.kind} ${nodeLabel(data, edge.target)}`,
      summary: `${edge.source} ${edge.kind} ${edge.target}`,
      highlightIds: [edge.source, edge.target],
      paths: [],
    });
  }

  for (const flow of data.flows) {
    const stepText = flow.steps
      .map((step, index) => `${index + 1}. ${nodeLabel(data, step.node)}: ${step.description}`)
      .join(" ");
    candidates.push({
      id: flow.name,
      kind: "flow",
      title: flow.name,
      summary: compactSummary(stepText, 320),
      highlightIds: flow.steps.map((step) => step.node),
      paths: [],
    });
  }

  for (const section of data.sections) {
    candidates.push({
      id: section.id,
      kind: "section",
      title: section.title,
      summary: compactSummary(section.body_markdown, 320),
      highlightIds: section.related_nodes,
      paths: [],
    });
  }

  return candidates;
}

export function buildRankedEvidence({ question, data }: BuildEvidenceInput): QueryEvidence[] {
  const questionTokens = new Set(tokenize(question));
  if (questionTokens.size === 0) return [];

  const candidates = buildCandidates(data).map((candidate) => scoreEvidence(question, questionTokens, candidate));

  const ranked = candidates
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.title.localeCompare(b.title);
    })
    .filter((item) => item.score > 0);

  return ranked.slice(0, MAX_EVIDENCE);
}

export function highlightsFromEvidence(evidence: QueryEvidence[], data: LighthouseData): string[] {
  const validIds = new Set([...data.clusters.map((cluster) => cluster.id), ...data.nodes.map((node) => node.id)]);
  return unique(evidence.flatMap((item) => item.highlightIds)).filter((id) => validIds.has(id)).slice(0, MAX_HIGHLIGHTS);
}

export function filePathsFromEvidence(evidence: QueryEvidence[]): string[] {
  return unique(evidence.flatMap((item) => item.paths)).slice(0, MAX_FILES);
}

function diagramBlockFromEvidence(evidence: QueryEvidence[]): QueryVisualBlock | null {
  const diagramEvidence = evidence
    .slice(0, 6);

  if (diagramEvidence.length < 2) return null;

  const nodeLines = diagramEvidence.map((item, index) => `  n${index}["${mermaidLabel(item.title)}"]`);
  const edgeLines = diagramEvidence
    .slice(0, -1)
    .map((_, index) => `  n${index} --> n${index + 1}`);

  return {
    type: "diagram",
    title: "Answer diagram",
    format: "mermaid",
    source: ["flowchart TD", ...nodeLines, ...edgeLines].join("\n"),
    items: diagramEvidence.map((item) => ({
      label: item.title,
      value: item.summary,
      nodeId: item.highlightIds[0],
      path: item.paths[0],
    })),
  };
}

export function visualBlocksFromEvidence(
  evidence: QueryEvidence[],
  options: { includeDiagram?: boolean } = {},
): QueryVisualBlock[] {
  const filePaths = filePathsFromEvidence(evidence);
  const panelItems = evidence.slice(0, 5).map((item) => ({
    label: item.title,
    value: item.summary,
    nodeId: item.highlightIds[0],
    path: item.paths[0],
  }));

  const blocks: QueryVisualBlock[] = [
    {
      type: "file_set",
      title: "Relevant files",
      items: filePaths.map((path) => ({ label: path, path })),
    },
    {
      type: "panel",
      title: "Top evidence",
      items: panelItems,
    },
  ];

  const diagramBlock = options.includeDiagram ? diagramBlockFromEvidence(evidence) : null;
  return diagramBlock ? [diagramBlock, ...blocks] : blocks;
}

export function buildLocalIndexAnswer(
  question: string,
  data: LighthouseData,
  codexError?: string,
  repoPathStatus: QueryAnswer["repo_path_status"] = "missing",
  sourceReason = "Local Codex skipped because no repository path is configured.",
): QueryAnswer {
  const evidence = buildRankedEvidence({ question, data });
  const highlightIds = highlightsFromEvidence(evidence, data);
  const filePaths = filePathsFromEvidence(evidence);
  const topEvidence = evidence.slice(0, 4);

  if (topEvidence.length === 0) {
    return {
      source: "no-match",
      source_reason: sourceReason,
      attempted_codex: false,
      indexing_mode: "deterministic-map",
      markdown:
        "I could not match that to the current codebase map. Ask about a file, module, flow, API, dependency, PR, or behavior and I will return matching evidence.",
      highlight_ids: [],
      evidence: [],
      file_paths: [],
      visual_blocks: [],
      query_events: [],
      codex_error: codexError,
      repo_path_status: repoPathStatus,
    };
  }

  const evidenceLines = topEvidence.map((item) => `- **${item.title}** (${item.kind}): ${item.summary}`);
  const fileLine =
    filePaths.length > 0
      ? `\n\nRelevant files: ${filePaths.slice(0, 5).map((path) => `\`${path}\``).join(", ")}.`
      : "";
  const fallbackLine = codexError
    ? "\n\nLocal Codex was unavailable for this question, so this answer is ranked from the current map data."
    : "";

  return {
    source: "local-index",
    source_reason: sourceReason,
    attempted_codex: Boolean(codexError),
    indexing_mode: "deterministic-map",
    markdown: [
      `I found ${topEvidence.length} relevant map ${topEvidence.length === 1 ? "entry" : "entries"} for: **${question}**.`,
      "",
      ...evidenceLines,
      fileLine,
      fallbackLine,
    ]
      .filter(Boolean)
      .join("\n"),
    highlight_ids: highlightIds,
    evidence,
    file_paths: filePaths,
    visual_blocks: visualBlocksFromEvidence(evidence, { includeDiagram: wantsDiagram(question) }),
    query_events: [],
    codex_error: codexError,
    repo_path_status: repoPathStatus,
  };
}
