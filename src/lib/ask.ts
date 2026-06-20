// Phase 3: ask-the-map pipeline.
// Cache-first → live Anthropic API call if VITE_ANTHROPIC_API_KEY is set.
// Uses plain fetch (no SDK) so no extra dependency is needed.

import type { LighthouseData } from "../types/lighthouse";
import { lookupCache } from "./askCache";

export interface AskResult {
  highlight_ids: string[];
  explanation: string;
  source: "cache" | "live";
}

// ---------------------------------------------------------------------------
// Compact data representation sent to the LLM — keeps token count low.
// ---------------------------------------------------------------------------
function buildContext(data: LighthouseData): string {
  const clusterLines = data.clusters
    .map((c) => `cluster:${c.id} "${c.label}" — ${c.summary}`)
    .join("\n");

  const nodeLines = data.nodes
    .map(
      (n) =>
        `node:${n.id} [${n.kind}] parent:${n.parent} "${n.label}" — ${n.summary}`
    )
    .join("\n");

  return `CLUSTERS:\n${clusterLines}\n\nNODES:\n${nodeLines}`;
}

// ---------------------------------------------------------------------------
// Live Anthropic API call via fetch.
// Model: claude-opus-4-8, adaptive thinking, tool-use for structured output.
// ---------------------------------------------------------------------------
async function callLive(
  question: string,
  data: LighthouseData
): Promise<AskResult> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error("VITE_ANTHROPIC_API_KEY is not set");
  }

  const context = buildContext(data);

  const systemPrompt = `You are an expert code-base navigator for the Lighthouse map tool.
The user will ask a question about the repository. You MUST respond by calling the
"highlight_map" tool with the ids of the clusters and nodes that are most relevant,
plus a brief plain-English explanation (2-4 sentences, no markdown headers).
Only include ids that actually appear in the provided cluster/node list.`;

  const userMessage = `Repository map:\n${context}\n\nQuestion: ${question}`;

  const tool = {
    name: "highlight_map",
    description:
      "Return the ids of clusters/nodes that answer the question, plus a short explanation.",
    input_schema: {
      type: "object",
      properties: {
        highlight_ids: {
          type: "array",
          items: { type: "string" },
          description:
            "Cluster or node ids from the map that are most relevant to the question.",
        },
        explanation: {
          type: "string",
          description:
            "2-4 sentence plain-English explanation of why these parts of the codebase are relevant.",
        },
      },
      required: ["highlight_ids", "explanation"],
    },
  };

  const body = {
    model: "claude-opus-4-8",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    tools: [tool],
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: userMessage }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    content: Array<{
      type: string;
      name?: string;
      input?: { highlight_ids: string[]; explanation: string };
    }>;
  };

  const toolUse = json.content.find(
    (block) => block.type === "tool_use" && block.name === "highlight_map"
  );
  if (!toolUse?.input) {
    throw new Error("No highlight_map tool call in API response");
  }

  const { highlight_ids, explanation } = toolUse.input;

  // Validate: filter ids to only real ones present in the data.
  const validIds = new Set([
    ...data.clusters.map((c) => c.id),
    ...data.nodes.map((n) => n.id),
  ]);
  const filtered = highlight_ids.filter((id) => validIds.has(id));

  return { highlight_ids: filtered, explanation, source: "live" };
}

// ---------------------------------------------------------------------------
// Public API — cache-first, live fallback.
// ---------------------------------------------------------------------------
export async function askMap(
  question: string,
  data: LighthouseData
): Promise<AskResult> {
  // 1. Check cache first (zero network, zero API key required).
  const cached = lookupCache(question);
  if (cached) {
    return {
      highlight_ids: cached.highlight_ids,
      explanation: cached.explanation,
      source: "cache",
    };
  }

  // 2. Attempt live call if API key is available.
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error(
      "No cached answer found and VITE_ANTHROPIC_API_KEY is not set. " +
        "Try one of the demo questions or add an API key."
    );
  }

  return callLive(question, data);
}
