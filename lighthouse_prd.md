# Lighthouse — MVP Product Requirements Document
### Understand any codebase in minutes, not weeks.

| | |
|---|---|
| **Product** | Lighthouse |
| **One-liner** | Lighthouse turns any codebase into a living, zoomable map you *explore* — instead of a wall of text you read. |
| **Build window** | ~6 hours, solo, with a local coding agent |
| **Status** | Locked for MVP build |

---

## 1. What it is (in one paragraph)

Lighthouse is a shared, always-current **map of a software system** that a developer can explore visually and ask questions of. A local coding agent reads the repository and produces a structured description of the system (clusters, modules, dependencies, flows, and a written wiki). Lighthouse renders that description as a **zoomable architecture map** with a **linked reading panel** and an **ask-the-map** interaction, so a developer dropped into unfamiliar code can build an accurate mental model fast.

---

## 2. The core mechanism (read this first — everything depends on it)

There are **three roles**, and a single JSON file (`data.json`) is the handoff between them.

```
   THE REPO               CODING AGENT               data.json              REACT APP
  (code files)  ──read──▶ (Claude Code / Codex) ──writes──▶ (the map data) ──loads──▶ (zoomable UI)
                          = the understanding engine                          renders only the JSON;
                          (AST / comprehension)                               never reads source code
```

1. **Generate (once, offline — the coding agent).** You run Claude Code / Codex inside the repo. It reads the code and outputs `data.json` matching the schema in §7. You review/hand-fix it, then commit it. This is the "understanding engine" — you borrow it instead of building your own parser.
2. **Render (always — the React app).** The app loads `data.json` and draws the map + reading panel. It never analyzes source code; it only renders the JSON. Nothing slow or fragile at runtime.
3. **Ask (live — a light LLM call).** When a user asks a question, the app sends `question + data.json` to an LLM, which answers *from the JSON* (it does **not** re-read the codebase) and returns which nodes to highlight + an explanation.

**Implication for the MVP:** generate `data.json` for ONE demo repo before the demo, cache it, and build the entire app against that file. No live code analysis on stage.

---

## 3. Persona & problem (locked)

**Primary persona:** a software engineer working in a codebase they didn't write — most acutely, **a new engineer onboarding onto a team.**

**Problem:** Getting up to speed in an unfamiliar codebase takes weeks. Docs are stale, code is a wall of text, and AI now writes more of the code every day — so engineers spend more time than ever in code they didn't write and don't understand. There's no fast way to build a mental model of how a system actually fits together.

**Job to be done:** "Help me understand how this system is built — fast — so I can start contributing."

**Why now:** AI writes more of the code, so more of every engineer's time is spent in unfamiliar code (increasingly *their own repos*, because an agent wrote part of it). Comprehension is the new bottleneck, and it worsens every month.

**Reach beyond new hires (one line, don't build separately):** every developer is a newcomer constantly — a new service, a teammate's PR, a dependency they must debug, AI-generated code. The new hire is the spearhead; the iceberg is everyone in unfamiliar code.

---

## 4. Positioning & differentiation

**Against DeepWiki / AutoWiki (your real competitor):** they render text plus static Mermaid diagrams you scroll past. Lighthouse fuses the diagram and the explanation into **one linked, zoomable, askable surface** — you explore the system spatially instead of reading a wall of text. The bet is entirely on **consumption quality**.

**Against Cursor / Codex (the inevitable objection):** Cursor's understanding is private and ephemeral — it lives in one developer's chat and evaporates. Lighthouse is a **shared, durable, always-current team artifact** — linked in the README, opened by every new hire, glanced at by the lead. Different job. *Proof the job is real: DeepWiki and AutoWiki get used today, in a world that already has Cursor.*

**Rebuttal line:** "Cursor is a private conversation that disappears. Lighthouse is your team's shared map of the system that stays current."

---

## 5. Goals & non-goals

**Goals**
- A developer grasps how an unfamiliar system is organized in minutes.
- The map is visibly, dramatically nicer to explore than a Mermaid-based wiki.
- The reading content and the map are linked and move together.
- A developer can ask the map a question and get a highlighted, explained answer.

**Non-goals (state explicitly)**
- ❌ Not a PR review/approval tool (no approve/reject, no inline line comments).
- ❌ Not a coding assistant competing with Cursor in the editor.
- ❌ Not Mermaid-grade static diagrams.
- ❌ Not execution/runtime tracing (different data source; out of scope).
- ❌ Not multi-language on day one (JS/TS demo repo).

---

## 6. Scope

### P0 — Must build (the MVP)
1. **Zoomable architecture map** — clusters → modules → files, custom-designed nodes, smooth expand/zoom. *The differentiator; ~half your hours.*
2. **Linked reading panel** — wiki sections rendered cleanly; click a node ⇄ highlight related section, click a section ⇄ highlight related nodes.
3. **Ask the map** — question → highlighted nodes + explanation (answers cached for demo questions).
4. **Generate / load** — loads `data.json`; a "Generate wiki" intro (can be theatrical) to frame the story.

### P1 — If time
5. **"What changed" lens** — a toggle that badges recently-changed nodes (the always-current / update-on-PR story). *Change is a lens here, not the spine.*
6. **Flow / sequence view** — one key request flow rendered as steps (model picks when it's the best view).
7. **Module/file tree** — a simple orientation tree.

### Out of scope
- Execution maps, visual code review, standalone call-graphs, multi-repo, auth/RBAC, persistence, live arbitrary-repo generation (optional cached-only flourish).

---

## 7. The data contract (`data.json`) — the keystone

Design the whole product around this. The two links that make Lighthouse better than DeepWiki are `kind` (drives zoom levels) and `related_nodes` (links reading ⇄ map).

```jsonc
{
  "repo": { "name": "string", "description": "string" },

  "clusters": [
    { "id": "auth", "label": "Authentication", "summary": "one sentence",
      "modules": ["mod_session", "mod_oauth"] }
  ],

  "nodes": [
    { "id": "mod_session", "label": "Session", "kind": "module",
      "parent": "auth", "summary": "one sentence",
      "key_files": ["src/auth/session.ts"], "path": "src/auth",
      "changed_recently": false }
    // kind: "cluster" | "module" | "file"  → powers the zoom levels
  ],

  "edges": [
    { "source": "mod_session", "target": "mod_db", "kind": "depends" }
    // kind: "depends" | "calls" | "imports"
  ],

  "flows": [
    { "name": "Login", "steps": [ { "node": "mod_oauth", "description": "..." } ] }
  ],

  "sections": [
    { "id": "overview", "title": "Overview", "body_markdown": "## ...",
      "related_nodes": ["auth", "mod_session"] }
    // suggested sections: Overview, Architecture, Key Flows, Entry Points, Data Model, Getting Started
  ]
}
```

**Rules for good data:** 5–8 top-level clusters max (more = hairball); every node has a one-sentence summary; every section tagged with `related_nodes`; accurate to the real code, nothing invented. **You may hand-edit the JSON** — it's one repo.

---

## 8. The agent prompt (how `data.json` gets made)

Run this with Claude Code / Codex inside the demo repo:

> You are analyzing this repository to produce a structured map for a visualization tool. Explore the repo structure and the key files. Output **only** a single valid JSON object matching this schema: `{repo, clusters, nodes, edges, flows, sections}` *(paste §7)*.
> - Group the codebase into **5–8 top-level capability clusters** (e.g. Authentication, Payments, API Layer), named for what they do, not where files live.
> - For each cluster list its modules; for each module write a **one-sentence** summary and list its key files.
> - Capture dependencies between modules as `edges`.
> - Identify **2–3 key request flows** with ordered steps.
> - Write **4–6 wiki `sections`** as markdown (Overview, Architecture, Key Flows, Entry Points, Data Model, Getting Started), each tagged with the `related_nodes` it describes.
> - Be accurate to the actual code; do not invent. Output only the JSON, no prose.

Review the result, fix clustering by hand if needed, save to `public/data.json`.

---

## 9. Tech stack & architecture

- **Frontend:** Vite + React + TypeScript + Tailwind.
- **Map:** **React Flow** with **custom node components** + **nested group nodes** (parent/child = zoom-in) + **elkjs** layout. *Not Mermaid* (it's the look you're beating). *Not LLM-generated HTML* (fragile, kills zoom).
- **Reading panel:** designed React components rendering `sections` markdown.
- **Ask feature:** `question + data.json` → LLM (any; cache demo answers) → `{ highlight_ids, explanation }`.
- **Data:** static `public/data.json`, generated offline by the coding agent.
- **No backend required for the MVP** (optional thin proxy for the ask call).

---

## 10. Build sequence (time-boxed, ~6 hrs)

**Phase 0 — Setup + data (0:45).** Pick a clean mid-size JS/TS repo. Scaffold Vite+React+TS+Tailwind+React Flow+elkjs. Run the §8 agent prompt → review/fix → `public/data.json`. *Don't proceed until the JSON is clean.*

**Phase 1 — The map (2:00) — over-invest.** Load JSON → React Flow. Clusters as group nodes, modules nested. Custom node cards (label, hover summary, optional changed-badge). elkjs layout, distinctive dark theme. Click/zoom to expand cluster → modules → files. *Let the agent write boilerplate; you hand-tune the design and zoom feel.*

**Phase 2 — Reading panel + linking (1:00).** Render `sections`. Bidirectional highlight: node ⇄ section. This is the "better than DeepWiki" moment.

**Phase 3 — Ask the map (1:00).** Input → LLM over `data.json` → highlight + explain. **Pre-cache the 2–3 demo questions** for an offline-safe run.

**Phase 4 — Polish + demo prep (0:45) + buffer (0:30).** "Generate wiki" intro animation; optional "what changed" badge beat; motion polish. 5-slide deck, timed script, fully offline fallback. Dogfood Lighthouse on its own repo for the README.

---

## 11. UX & design direction

- **The map is the hero; spend your boldness there.** Everything else stays quiet.
- **Custom, designed nodes** — never default React Flow boxes, never Mermaid.
- **Distinctive identity**, not the templated dark-mode-neon default: a deep canvas, a restrained palette, a characterful display face + clean body + mono for any data/labels so it reads like an instrument. (Use the `frontend-design` skill when building components.)
- **Motion = meaning:** smooth expand on zoom, gentle highlight pulse when a node is selected/answered. No decorative animation.
- **Reading is calm and legible** (NotebookLM-style) — generous spacing, clear hierarchy.
- **Dead simple:** land on the map; one obvious way to explore (click to expand) and one to ask (the input). No menus to hunt.

---

## 12. Demo script (target the 3-min finals)

1. **Hook (15s):** "Dropping into a codebase you didn't write takes weeks. AI writes more of that code every day. Comprehension is the bottleneck."
2. **Reveal (20s):** the clustered map of a recognizable repo appears. "This is the whole system, at a glance."
3. **Explore (45s):** zoom into a cluster → modules → a file; the reading panel follows. "The map and the explanation move together — that's the part a wiki can't do."
4. **Ask (40s):** "Where does authentication happen?" → the map highlights auth, the panel explains. "Ask it anything; it shows you where."
5. **Stay-current (15s):** toggle "what changed" → recently-changed nodes badge. "It updates as the system changes — never stale."
6. **Close (15s):** "Cursor is a private chat that disappears. Lighthouse is your team's shared, always-current map. Understand any system in minutes, not weeks."

**Offline discipline:** every demo-critical view reads from cached `data.json` + cached answers. Live LLM/agent calls are flourishes, never load-bearing. If anything breaks: "live chaos-engineering" → cached fallback.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| JSON is messy → ugly/hairball map | Spend Phase 0 on it; hand-edit; cap to 5–8 clusters and limit nodes per view |
| Map looks generic | Custom nodes + `frontend-design` skill; the map *is* the differentiator, design it like one |
| Live call fails on stage | Everything demo-critical reads from cache; live calls are optional |
| Scope creep (extra map types, change/review) | P0 is the map + reading + ask; everything else is P1 or cut |
| "Isn't this just DeepWiki / Cursor?" | §4 rebuttals: linked+zoomable+askable beats static wikis; shared durable artifact beats ephemeral editor chat |

---

## 14. Success criteria

- A first-time viewer understands how the demo system is organized within ~1 minute of exploring.
- The zoom (cluster → module → file) and the node⇄section linking both work smoothly on the demo repo.
- The ask feature highlights the right region and explains it for the demo questions.
- The entire demo runs **offline** from cached data.

---

## 15. Open items (lock at Phase 0)

- ⬜ Choose the demo repo (clean module boundaries > fame).
- ⬜ Generate + hand-verify `data.json`.
- ⬜ Decide which P1 features (change-lens / flow view / file tree) to attempt if ahead.
