// Phase 3: cached demo Q&A entries — load-bearing, zero network required.
// highlight_ids reference real ids from public/data.json.

export interface CachedAnswer {
  question: string;
  highlight_ids: string[];
  explanation: string;
}

// Three pre-written demo entries with real node/cluster ids.
export const CACHED_ANSWERS: CachedAnswer[] = [
  {
    question: "Where does browser recording and test authoring happen?",
    highlight_ids: [
      "cluster_recording_realtime",
      "mod_frontend_no_code_editor",
      "mod_recorder_engine",
      "mod_extension_background",
      "mod_extension_content",
      "mod_ws_server",
    ],
    explanation:
      "Test authoring via browser recording spans two clusters. " +
      "The no-code editor (frontend/src/components/nocode-editor/) starts and stops recording sessions " +
      "and renders editable steps. The Chrome extension captures DOM events, generates Playwright " +
      "locators, and buffers actions through background and content scripts. The recorder engine " +
      "packages a newer modular worker that converts captured actions into Supatest DSL steps. " +
      "All realtime coordination — forwarding action events, screenshots, and recorder lifecycle messages — " +
      "runs through the Socket.IO server.",
  },
  {
    question: "How does the API layer handle authentication and routing?",
    highlight_ids: [
      "cluster_api_platform",
      "mod_api_server",
      "mod_api_auth_middleware",
      "mod_api_domain_controllers",
      "mod_public_api",
    ],
    explanation:
      "The API platform is an Express server (api/src/server.ts) that registers all routes and " +
      "middleware at startup. Every authenticated request passes through Clerk JWT verification and " +
      "organization role checks in the auth middleware layer before reaching domain controllers. " +
      "Controllers handle REST endpoints for tests, plans, runs, issues, environments, and attachments. " +
      "A separate versioned public API surface (api/src/controllers/public/v1/) exposes API-key-gated " +
      "endpoints so external clients can trigger test plan runs without a Clerk session.",
  },
  {
    question: "How does AI test generation and failure healing work?",
    highlight_ids: [
      "cluster_ai_generation",
      "mod_ai_step_generation",
      "mod_ai_code_generation",
      "mod_ai_chat",
      "mod_ai_failure_healing",
      "mod_shared_contracts",
    ],
    explanation:
      "AI capabilities live entirely in the AI Generation cluster. Step generation builds OpenAI " +
      "prompts from page context and user instructions, then validates responses against Zod-constrained " +
      "DSL schemas shared across packages. Code generation translates those DSL steps into executable " +
      "Playwright Python. The AI chat module manages conversation history and context documents so users " +
      "can author tests conversationally. When a test fails, the failure healing module categorizes the " +
      "error, stores healing sessions, and drives automated repair flows.",
  },
];

// Normalise a question string for fuzzy matching.
function normalise(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Shared keywords for each cached question (order mirrors CACHED_ANSWERS).
const KEYWORDS: string[][] = [
  ["record", "recording", "browser", "authoring", "author", "capture", "extension", "no-code", "nocode", "step"],
  ["api", "authentication", "auth", "routing", "route", "endpoint", "middleware", "express", "http", "server", "clerk"],
  ["ai", "generation", "generate", "heal", "healing", "failure", "chat", "playwright", "dsl", "step generation"],
];

/**
 * Look up a question in the cache.
 * Returns the matching CachedAnswer or null if no confident match.
 */
export function lookupCache(question: string): CachedAnswer | null {
  const norm = normalise(question);

  let bestIndex = -1;
  let bestScore = 0;

  KEYWORDS.forEach((keywords, i) => {
    const score = keywords.reduce((acc, kw) => acc + (norm.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  });

  // Require at least one keyword match.
  if (bestScore === 0 || bestIndex === -1) return null;
  return CACHED_ANSWERS[bestIndex];
}

/** The three demo chip labels — shown as one-click suggestions in the UI. */
export const DEMO_QUESTIONS: string[] = CACHED_ANSWERS.map((a) => a.question);
