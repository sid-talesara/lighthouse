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
    question: "Where does authentication happen?",
    highlight_ids: [
      "auth",
      "mod_auth_routes",
      "mod_passport",
      "mod_oauth",
      "mod_auth_providers",
      "mod_middlewares",
    ],
    explanation:
      "Authentication lives in the **Auth** cluster. " +
      "HTTP login flows are mounted in **Auth Routes** (`server/routes/auth/`), which hand off to " +
      "pluggable **Auth Provider Plugins** (Google, OIDC, Slack, Azure) under `plugins/`. " +
      "The **Passport Strategy** (`server/utils/passport.ts`) normalises any provider profile into a " +
      "provisioned account via the `accountProvisioner` command, then issues a signed session cookie. " +
      "**OAuth Provider Server** routes let Outline act as an OAuth server for third-party clients. " +
      "Finally, the **Middlewares** layer (`server/middlewares/authentication.ts`) guards every API " +
      "request by verifying the session on each call.",
  },
  {
    question: "How does real-time collaborative editing work?",
    highlight_ids: [
      "realtime",
      "mod_collaboration",
      "mod_websockets",
      "mod_app_editor",
      "mod_shared_editor",
      "node_document_model",
    ],
    explanation:
      "Real-time collaboration runs across two clusters. " +
      "On the client, the **Client Editor** (`app/editor/`) opens a WebSocket to the collaboration server " +
      "and syncs Yjs CRDTs through the **Shared Editor Schema** (`shared/editor/`) — the same ProseMirror " +
      "schema consumed by both the browser and the server. " +
      "Server-side, the **Collaboration Server** (Hocuspocus, `server/collaboration/`) authenticates the " +
      "socket via `AuthenticationExtension`, merges incoming Yjs updates, and persists the result back to " +
      "the **Document model** via `PersistenceExtension`. " +
      "In parallel, **Websockets** (Socket.io, `server/services/websockets.ts`) broadcast entity-change " +
      "and presence events to every other connected client so the UI stays live.",
  },
  {
    question: "Where is the API layer and what does it depend on?",
    highlight_ids: [
      "api",
      "mod_server_entry",
      "mod_api_routes",
      "node_documents_api",
      "mod_middlewares",
      "mod_commands",
      "mod_presenters",
      "mod_policies",
      "mod_models",
    ],
    explanation:
      "The **API Layer** cluster is the Koa HTTP server. " +
      "**Server Entry** (`server/index.ts`) bootstraps the process services; the **web** service mounts " +
      "the versioned JSON **API Routes** (`server/routes/api/`). " +
      "Every request is first filtered by **Middlewares** (auth, rate-limiting, CSRF), then **Authorization " +
      "Policies** confirm the user may perform the action, before **Commands** execute the transactional " +
      "business logic (e.g. `documentCreator`, `accountProvisioner`). " +
      "Responses are shaped by **Presenters**, which serialise **Sequelize Models** into the JSON the " +
      "client consumes. The `documents.ts` file is highlighted as the busiest single endpoint — it " +
      "handles create, update, search, move, and archive.",
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
  ["auth", "authentication", "login", "sso", "oauth", "session", "passport", "sign in"],
  ["realtime", "real-time", "real time", "collaborative", "collaboration", "websocket", "yjs", "hocuspocus", "editing"],
  ["api", "layer", "routes", "endpoint", "koa", "http", "server", "depend"],
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
