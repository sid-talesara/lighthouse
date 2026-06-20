# Lighthouse

> **Lighthouse turns any codebase into a living, zoomable map you *explore* — instead of a wall of text you read.**

---

## Problem Statement

Getting up to speed in an unfamiliar codebase takes weeks. Docs are stale, code is a wall of text, and AI now writes more of that code every day — so engineers spend more time than ever in code they didn't write and don't understand. There is no fast way to build an accurate mental model of how a system actually fits together.

## Users & Context

**Primary user:** A software engineer working in a codebase they didn't write — most acutely, a new engineer onboarding onto a team.

**Job to be done:** "Help me understand how this system is built — fast — so I can start contributing."

**Broader reach:** Every developer is a newcomer constantly — a new service, a teammate's PR, a dependency to debug, AI-generated code they must own. The new hire is the spearhead; the iceberg is everyone in unfamiliar code.

## Solution Overview

Lighthouse has three roles and a single JSON file (`data.json`) as the handoff between them.

```
   THE REPO              CODING AGENT              data.json             REACT APP
  (code files) ──read──▶ (Claude Code / Codex) ──writes──▶ (map data) ──loads──▶ (zoomable UI)
                         = the understanding engine                      renders only the JSON;
                         (AST / comprehension)                           never reads source code
```

1. **Generate (once, offline — the coding agent).** Run Claude Code / Codex inside the repo. It reads the code and outputs `data.json`. Review and hand-edit it, then commit it alongside the repo.
2. **Render (always — the React app).** The app loads `data.json` and draws the zoomable map and reading panel. It never analyzes source code at runtime.
3. **Ask (live — a light LLM call).** The user asks a question; the app sends `question + data.json` to an LLM, which answers strictly from the JSON and returns which nodes to highlight plus an explanation.

The result: a **zoomable architecture map** (clusters → modules → files), a **linked reading panel** (click a node ↔ highlight the related wiki section), and an **ask-the-map** interaction — all rendered from a single reviewed JSON file.

## Setup & Run

> **Prerequisites:** Node 18+, npm 9+.

```bash
# 1. Clone the repo
git clone <repository-url>
cd lighthouse

# 2. Install dependencies
npm install
# Installs: Vite, React, TypeScript, Tailwind CSS, React Flow, elkjs

# 3. Place the map data
# data.json is generated offline by a coding agent (see §8 of the PRD).
# For the demo: a pre-generated data.json for the demo repo is already at public/data.json.
# To analyze a new repo, run the agent prompt from the PRD inside that repo and save the
# output to public/data.json. Review and hand-edit before committing.

# 4. Start the dev server
npm run dev
# App runs at http://localhost:5173
```

> **Note:** `public/data.json` is generated offline by a coding agent (Claude Code or Codex). The app never analyzes source code at runtime; it only renders the JSON. The demo ships with a cached `data.json` so the entire demo runs offline.

## Models & Data

**Understanding engine:** A local coding agent — Claude Code or Codex — run offline inside the target repo. It reads the file structure and key source files, then outputs a single `data.json` matching the Lighthouse schema (clusters, nodes, edges, flows, sections). No proprietary model is bundled; you supply your own agent access.

**Ask-the-map:** Any LLM with a sufficient context window. At demo time, answers to the 2–3 demo questions are pre-cached in `data.json` so the feature runs fully offline and without a live API key.

**Data sources:** Static `public/data.json`, generated once offline and committed. The demo repo's `data.json` is derived from the analysis of a chosen open-source JS/TS repository.

**Licenses:**
- Lighthouse application code: MIT (placeholder — confirm before release).
- Demo `data.json`: derived from the analyzed open-source repository; that repo's own license applies to any content faithfully reproduced from it. Check the source repo's license before redistribution.

> This is a hackathon MVP. Demo repo data is cached and hand-verified; no live code analysis runs during the demo.

## Evaluation & Guardrails

Lighthouse takes the following steps to minimize hallucination and bias in the generated map data:

| Guardrail | How it works |
|---|---|
| No-invention prompt | The agent prompt explicitly instructs: *"Be accurate to the actual code; do not invent. Output only the JSON, no prose."* |
| Human review + hand-edit | After generation, the JSON is manually reviewed and corrected before being committed to `public/data.json`. |
| Answers grounded in data.json | The ask feature sends `question + data.json` to the LLM — it answers from the JSON only, not by re-reading the source repository. |
| Cached demo answers | The 2–3 demo questions have pre-cached answers, eliminating live model variance on stage. |
| Cluster cap | The prompt caps top-level clusters at 5–8 to prevent an unreadable hairball map. Human review enforces this. |

## Known Limitations & Risks

- **Single language (JS/TS only).** The MVP demo repo is JavaScript/TypeScript. Multi-language support is not in scope.
- **Not runtime tracing.** Lighthouse maps static structure derived from code reading — it does not trace actual execution paths, real call graphs, or runtime behavior.
- **JSON can become a hairball.** If the agent produces too many nodes or poorly bounded clusters, the map degrades. Mitigated by the cluster cap, hand-editing, and Phase 0 investment in clean data.
- **Not always-current by default.** `data.json` is regenerated manually (or on PR). It is current when regenerated, not continuously.
- **Not a coding assistant.** Lighthouse does not compete with Cursor or Copilot in the editor. It is a shared exploration artifact, not an inline tool.
- **No PR review / approval workflow.** No inline line comments, no approve/reject. Out of scope.
- **No execution/runtime tracing.** Different data source; explicitly out of scope.
- **No auth, persistence, or multi-repo.** MVP only; no backend required.
- **Live LLM call can fail.** If the ask API is unreachable, the demo falls back to cached answers.

## Team

| Name | Role | Contact |
|---|---|---|
| Sid Talesara | Founder / Engineer | admin@supatest.ai |

> Solo build. Lighthouse was designed and built in a single ~6-hour session with a local coding agent.

---

## Pitch Deck

### Slide 1 — Problem & Who Cares

- **The problem:** Onboarding into an unfamiliar codebase takes weeks. Docs are stale. Code is a wall of text.
- **Who feels this:** Every engineer, every day — new hires most acutely, but also anyone reading a PR, debugging a dependency, or inheriting AI-generated code they didn't write.
- **Why it's getting worse:** AI now writes more of the code. More of every engineer's time is spent in code they didn't write and don't understand. Comprehension is the new bottleneck — and it worsens every month.
- **The ask:** There is no fast, shared, visual way to build a mental model of how a system fits together.

### Slide 2 — Insight & Why Now

- **The insight:** Comprehension is the bottleneck, not generation. The tools that help you *write* code (Cursor, Copilot) are mature. The tools that help you *understand* it are not.
- **Why now:** AI-generated code is flooding codebases. Engineers spend more time than ever in code they didn't write — including their own repos, because an agent wrote part of it.
- **The gap competitors leave open:** DeepWiki and AutoWiki render text + static Mermaid diagrams you scroll past. Cursor's understanding is private and ephemeral — it lives in one chat and evaporates. Neither is a shared, explorable, durable team artifact.
- **The job to be done:** "Help me understand how this system is built — fast — so I can start contributing."

### Slide 3 — Solution Demo

- **The map:** A zoomable architecture map of the full codebase — clusters, modules, files — rendered from a single reviewed `data.json`.
- **Explore:** Click a cluster to expand it into modules; click a module to see files. The reading panel follows — the explanation and the map move together.
- **Ask:** Type "Where does authentication happen?" — the map highlights the relevant nodes; the panel explains. Answers are grounded in the map data, not the raw codebase.
- **Stay current:** A "what changed" lens badges recently-modified nodes so the map reflects the current state of the system.
- *(Screenshots / GIF — placeholder: add demo recording here)*

### Slide 4 — Tech Architecture

**Stack:**
- Frontend: Vite + React + TypeScript + Tailwind CSS
- Map: React Flow + custom node components + elkjs layout (not Mermaid)
- Reading panel: Designed React components rendering markdown sections
- Ask feature: `question + data.json` → LLM → `{ highlight_ids, explanation }`

**Models & data:**
- Understanding engine: local coding agent (Claude Code / Codex), run once offline
- Ask LLM: any model with sufficient context window; demo answers pre-cached
- Data: static `public/data.json` — generated offline, human-reviewed, committed

**No backend required for the MVP.** The entire demo runs from a single cached JSON file.

### Slide 5 — Value & GTM

**Who benefits:**
- Engineering teams onboarding new hires (immediate, measurable time-to-contribution reduction)
- Tech leads who need a shared system map for reviews and planning
- Any developer navigating a codebase they didn't write

**Differentiation:**
- vs. DeepWiki / AutoWiki: linked + zoomable + askable beats static text wikis
- vs. Cursor / Codex: a shared, durable team artifact vs. an ephemeral private chat

**Rebuttal line:** "Cursor is a private conversation that disappears. Lighthouse is your team's shared map of the system that stays current."

**GTM entry point:** Ship as a README-linked artifact for open-source repos → viral distribution via GitHub. Upsell private-repo generation and team hosting.

### Slide 6 — Roadmap & Risks

**P0 (MVP — shipped):**
- Zoomable architecture map (clusters → modules → files)
- Linked reading panel (node ↔ section, bidirectional)
- Ask-the-map (highlighted nodes + explanation)
- Offline demo from cached `data.json`

**P1 (next):**
- "What changed" lens — badge recently-modified nodes; the always-current story
- Flow / sequence view — key request flows rendered as ordered steps
- Module / file tree — orientation sidebar

**Risks:**
| Risk | Mitigation |
|---|---|
| JSON hairball → ugly map | Cap 5–8 clusters; hand-edit Phase 0; limit nodes per view |
| Map looks generic | Custom nodes + design investment; the map *is* the differentiator |
| Live call fails on stage | All demo-critical views read from cache; live calls are optional |
| Scope creep | P0 is map + reading + ask; everything else is P1 or cut |
| "Isn't this just DeepWiki / Cursor?" | Linked + zoomable + askable beats static wikis; shared durable artifact beats ephemeral editor chat |

---

## AI Impact Statement

Lighthouse uses AI at two points. First, a local coding agent (Claude Code or Codex) automates codebase comprehension: it reads the repository's file structure and key source files, then outputs a structured `data.json` capturing clusters, modules, dependencies, flows, and a written wiki. Building an accurate mental model of a large unfamiliar codebase is the exact bottleneck Lighthouse addresses; automating it with an agent compresses hours of manual exploration into a single offline run. The agent is prompted explicitly to be accurate and not invent; a human reviews and hand-edits the output before it is committed. Second, a light LLM call powers ask-the-map: the user's question plus the already-reviewed `data.json` are sent to the model, which answers strictly from the JSON — it does not re-read source code. Demo answers are pre-cached for offline safety. Data provenance is clean: the source is an open-source repository analyzed with permission; output is a static JSON file committed alongside the app. Safety risk is low — Lighthouse only renders reviewed, human-verified JSON; no model output reaches users unreviewed. Business impact: faster onboarding, a durable shared team artifact, and a comprehension layer that improves as AI writes more code humans must inherit.
