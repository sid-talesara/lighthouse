# Module Wiki — Buildable Design Spec

> Lighthouse · Vite + React + TS + Tailwind  
> Consistent with `docs/posthog-design-spec.md` (PostHog design language).  
> Data contract: `src/types/lighthouse.ts` / `public/data.json`.

---

## 1. Presentation Pattern

**Recommendation: Wide slide-over drawer, anchored right, 600 px wide, map stays live behind it.**

### Why not a full-screen modal or dedicated pane replacement?

| Option | Problem |
|---|---|
| Full-screen modal | Destroys map context. User loses their place. Cannot cross-link to neighbors without navigating back. |
| Replace reading panel (380 px) | Too narrow for a wiki page with a right-side TOC column. A real docs page needs ~560–700 px. |
| Dedicated route (`/module/:id`) | Breaks the single-page mental model. Navigation history balloons. Map state lost on back. |

**Wide drawer (600 px)** leaves ~55–60% of a 1440-wide viewport as live map. The map dims slightly (overlay with `bg-ph-canvas/50 backdrop-blur-[2px]`). Clicking anywhere outside the drawer or pressing `Esc` closes it. A "Show on map" button in the drawer header clears the overlay and flies the viewport to the node — keeping the map alive.

This is exactly how Linear, Notion sidebar docs, and Vercel's project pages work: a rich detail surface that doesn't abandon your prior context.

### Motion

```
Drawer open:  translateX(100%) → translateX(0), duration 220ms, ease-out
Drawer close: translateX(0) → translateX(100%), duration 180ms, ease-in
Map overlay:  opacity 0 → 0.5, duration 200ms
```

No spring physics. PostHog motion philosophy: snappy, deliberate, not bouncy.

---

## 2. Page Structure

The drawer is a vertically scrollable document column (560 px content, 40 px scrollbar gutter) with a sticky right-rail TOC (160 px) that appears once the drawer is wider than 600 px (i.e., always in our case). The TOC hides on clusters with <3 sections.

### 2.1 Section Order

```
[Drawer header — sticky]
  1. Breadcrumb + close
  2. Module hero (title, kind badge, path chip, changed badge)

[Scrollable body — 560px content + 160px TOC rail]
  3. Summary
  4. Dependency graph (mini embedded diagram)
  5. Key files
  6. Functions
  7. Database tables
  8. Appears in flows
  9. Recent changes (PRs)
 10. Wiki prose (sections)
```

### 2.2 Section-by-Section Specification

---

#### DRAWER HEADER (sticky, `position: sticky; top: 0; z-index: 10`)

```
bg: #FFFFFF  border-bottom: 1px solid #BFC1B7  padding: 12px 20px
height: 52px  display: flex  align-items: center  justify-content: space-between
```

**Left — Breadcrumb:**
```
Cluster label  ›  Module label
font: 12px / 600 / Nunito  color: #9B9C92  letter-spacing: 0.04em
Cluster portion: clickable → opens that cluster's wiki
› separator: color #BFC1B7
Current node portion: color #4D4F46 (not clickable, it's current)
```

**Right — Action buttons:**
```
[Show on map]  [×]
"Show on map": ghost button, lucide MapPin 16px icon + label
              onClick → close overlay, fitView to this node (500ms)
"×": ghost button, lucide X 20px, closes drawer
```

---

#### SECTION 3 — SUMMARY

```
padding-top: 24px
```

**Module hero block:**
```
Row 1: <h1> node.label — 24px / 800 / Nunito / #151515
Row 2: kind badge + [changed badge?] + path chip
  - kind badge: neutral pill — "cluster" | "module" | "file"
    cluster: bg #E7D8EE text #7C44A6   (purple)
    module:  bg #DCEAF6 text #1078A3   (blue-teal)
    file:    bg #E5E7E0 text #4D4F46   (neutral)
  - changed badge: shown only if node.changed_recently === true
    bg #FEF3C7  text #92400E  label "Recently changed"
  - path chip: IBM Plex Mono 12px, bg #E5E7E0 border #BFC1B7 rounded-ph-sm px-2 py-0.5
    text: node.path (truncated to 40 chars with ellipsis)
Row 3: summary prose
  font: 16px / 400 / system-ui  color: #4D4F46  line-height: 1.6
  max-width: 520px
```

**Section divider** (after each major section):
```html
<hr class="border-0 border-t border-ph-border-soft my-6" />
```

---

#### SECTION 4 — DEPENDENCY GRAPH (mini diagram)

**Show when:** `edges` exist where `source === node.id` OR `target === node.id`. Always show for clusters (they always have connections).

**Hide when:** node is kind `file` AND has 0 edges.

**Label:** `ON THIS PAGE` label "Connections" as section anchor `#connections`.

```
Section header: "Connections"
  font: 14px / 700 / Nunito  color: #151515  letter-spacing: 0.01em
  padding-bottom: 8px  border-bottom: 1px solid #BFC1B7
```

**Diagram approach — lightweight custom SVG, NOT a full @xyflow/react instance.**

Rationale: A second React Flow instance inside a drawer adds ~200 KB bundle weight, re-triggers layout engine, and fights with scroll. For 3–12 neighbors, a bespoke SVG is simpler and faster.

**SVG layout algorithm:**
1. Center node = the selected module (large circle, 48px radius, yellow fill `#F7A501`, ink text).
2. Incoming deps = left column, outgoing deps = right column. Each neighbor = small pill (140px × 32px, white fill, olive border).
3. Edges = curved `<path>` with `stroke="#BFC1B7" stroke-width="1.5"` + arrowhead marker.
4. Edge label: small `<text>` on midpoint — "imports" | "calls" | "depends", font 10px, color #9B9C92.
5. Canvas: 520px × (auto height, min 180px). `bg: #EEEFE9`, `border: 1px solid #BFC1B7`, `border-radius: 6px`.

**Interaction:** clicking a neighbor pill fires `onNodeClick(neighborId)` → replaces drawer content with that module's wiki (history-stack push so back button works).

**Data assembly:**
```ts
const incomingEdges = data.edges.filter(e => e.target === node.id);
const outgoingEdges = data.edges.filter(e => e.source === node.id);
const neighborIds = [...new Set([...incomingEdges.map(e=>e.source), ...outgoingEdges.map(e=>e.target)])];
const neighbors = data.nodes.filter(n => neighborIds.includes(n.id));
// Cap at 8 neighbors each side for legibility; show "+N more" text if overflow
```

**Fallback (no edges):** Show a structured two-column text list instead of SVG:
```
INCOMING (n)           OUTGOING (n)
- ModuleName [kind]    - ModuleName [kind]
  edge.kind badge        edge.kind badge
```

---

#### SECTION 5 — KEY FILES

**Show when:** `node.key_files.length > 0`. Always shown for `file` and `module` kinds.

**Hide when:** `kind === 'cluster'` AND `key_files` is empty (clusters may aggregate instead).

```
Section header: "Key files"  anchor: #key-files
```

Render each as a monospace file chip row:
```tsx
// File chip
<div class="flex items-center gap-2 py-1.5 border-b border-ph-border-soft last:border-0">
  <lucide.File class="w-4 h-4 text-ph-mute flex-shrink-0" />
  <code class="font-mono text-[13px] text-ph-body truncate">{filePath}</code>
</div>
```

For `cluster` kind: list key_files from all child modules, grouped by module label:
```
mod_api_server
  api/src/server.ts
  api/src/app.ts
```

---

#### SECTION 6 — FUNCTIONS

**Show when:** `data.functions.filter(f => f.module_id === node.id).length > 0`.

**Hide when:** `kind === 'cluster'` (clusters don't own functions directly — skip or roll-up with count).

```
Section header: "Functions"  anchor: #functions
count badge: neutral pill  e.g. "12 functions"
```

Render as a collapsible list. First 5 visible; rest behind "Show N more" toggle.

```tsx
// Function row
<div class="py-3 border-b border-ph-border-soft last:border-0">
  <div class="flex items-start gap-3">
    <lucide.Code2 class="w-4 h-4 text-ph-mute mt-0.5 flex-shrink-0" />
    <div>
      <code class="font-mono text-[13px] text-ph-ink font-medium">{fn.name}</code>
      {fn.signature && (
        <code class="block font-mono text-[11px] text-ph-mute mt-0.5 leading-relaxed">
          {fn.signature}
        </code>
      )}
      {fn.summary && (
        <p class="text-[13px] text-ph-body mt-1 leading-snug">{fn.summary}</p>
      )}
    </div>
  </div>
</div>
```

---

#### SECTION 7 — DATABASE TABLES

**Show when:** `data.dbTables.filter(t => t.module_id === node.id).length > 0`.

**Hide when:** No db tables for this node. (`kind === 'cluster'` shows rolled-up count from children.)

```
Section header: "Database tables"  anchor: #database-tables
count badge: purple pill  e.g. "3 tables"
```

Each table renders as an expandable mini schema card:

```tsx
// Table card (collapsed by default, expand on click)
<div class="border border-ph-border rounded-ph mb-2 overflow-hidden">
  <button class="w-full flex items-center justify-between px-4 py-3
                 bg-ph-surface hover:bg-ph-surface-soft transition-colors text-left">
    <div class="flex items-center gap-2">
      <lucide.Database class="w-4 h-4 text-ph-purple" />
      <span class="font-mono text-[13px] font-medium text-ph-ink">{table.name}</span>
      <span class="text-[11px] text-ph-mute">({table.columns.length} cols)</span>
    </div>
    <lucide.ChevronDown class="w-4 h-4 text-ph-ash" />  {/* rotates 180 when open */}
  </button>
  {/* expanded: column list */}
  <div class="border-t border-ph-border-soft">
    {table.columns.map(col => (
      <div class="flex items-center gap-3 px-4 py-2 border-b border-ph-border-soft last:border-0
                  text-[12px] font-mono">
        {col.pk && <lucide.Key class="w-3 h-3 text-ph-yellow" />}
        {col.fk && <lucide.Link class="w-3 h-3 text-ph-blue" />}
        <span class="text-ph-ink">{col.name}</span>
        <span class="text-ph-ash">{col.type}</span>
        {col.fk && <span class="text-ph-mute text-[11px]">→ {col.fk}</span>}
      </div>
    ))}
  </div>
</div>
```

Table summary rendered below name if present: `text-[13px] text-ph-mute italic`.

---

#### SECTION 8 — APPEARS IN FLOWS

**Show when:** any `flow.steps` references `node.id`.

**Hide when:** no flows reference this node.

```
Section header: "Appears in flows"  anchor: #flows
```

For each matching flow, show a flow trace card — a horizontal step timeline:

```tsx
// Flow card
<div class="border border-ph-border rounded-ph p-4 mb-3">
  <div class="flex items-center gap-2 mb-3">
    <lucide.Workflow class="w-4 h-4 text-ph-blue" />
    <span class="font-sans font-semibold text-[14px] text-ph-ink">{flow.name}</span>
  </div>
  {/* Step list — vertical on narrow width */}
  <ol class="relative border-l border-ph-border-soft ml-3">
    {flow.steps.map((step, i) => {
      const isThisNode = step.node === node.id;
      return (
        <li class={`ml-4 mb-3 last:mb-0 ${isThisNode ? 'font-semibold' : ''}`}>
          <span class={`
            absolute -left-1.5 w-3 h-3 rounded-full border border-ph-border
            ${isThisNode ? 'bg-ph-yellow border-ph-yellow-pressed' : 'bg-ph-surface'}
          `} />
          <button class="text-[13px] text-ph-body hover:text-ph-ink hover:underline text-left"
                  onClick={() => openWiki(step.node)}>
            {data.nodes.find(n=>n.id===step.node)?.label ?? step.node}
          </button>
          <p class="text-[12px] text-ph-mute mt-0.5 leading-snug">{step.description}</p>
        </li>
      );
    })}
  </ol>
</div>
```

This node's step is highlighted in yellow — the "you are here" in the flow.

---

#### SECTION 9 — RECENT CHANGES

**Show when:** `data.pullRequests.filter(pr => pr.touched.some(t => t.node_id === node.id)).length > 0`.

**Hide when:** no PRs touch this node.

```
Section header: "Recent changes"  anchor: #recent-changes
```

List PRs in reverse chronological order. Show max 5; "View all" expands the rest.

```tsx
// PR row
<div class="flex items-start gap-3 py-3 border-b border-ph-border-soft last:border-0">
  <span class={`
    mt-0.5 w-2 h-2 rounded-full flex-shrink-0
    ${pr.status === 'merged' ? 'bg-ph-purple' :
      pr.status === 'open'   ? 'bg-ph-green'  : 'bg-ph-ash'}
  `} />
  <div class="min-w-0">
    <p class="text-[13px] font-medium text-ph-ink leading-snug truncate">{pr.title}</p>
    <div class="flex items-center gap-2 mt-0.5">
      <span class="text-[11px] text-ph-mute">{pr.author}</span>
      <span class="text-[11px] text-ph-ash">·</span>
      <span class="text-[11px] text-ph-ash">{formatDate(pr.date)}</span>
      {/* change kind badge for THIS node's touch */}
      <span class={badge(touchKindVariant(touchForNode.change))}>
        {touchForNode.change}  {/* "added" | "modified" | "removed" */}
      </span>
    </div>
    {pr.additions != null && (
      <div class="flex gap-2 mt-1 text-[11px]">
        <span class="text-ph-green">+{pr.additions}</span>
        <span class="text-ph-red">-{pr.deletions}</span>
      </div>
    )}
  </div>
</div>
```

PR status color mapping:
```
merged → purple badge
open   → success/green badge
draft  → neutral badge
```

---

#### SECTION 10 — WIKI PROSE

**Show when:** `data.sections.filter(s => s.related_nodes.includes(node.id)).length > 0`.

**Hide when:** no sections relate to this node.

```
Section header: "Documentation"  anchor: #documentation
```

Render each matched section as a prose block with markdown (use a lightweight renderer like `marked` or `react-markdown`):

```tsx
// Wiki section block
<div class="prose prose-sm max-w-none mb-6">
  <h3 class="font-sans font-bold text-[16px] text-ph-ink mb-3">{section.title}</h3>
  <div class="text-[14px] text-ph-body leading-relaxed">
    <ReactMarkdown>{section.body_markdown}</ReactMarkdown>
  </div>
</div>
```

**Markdown element overrides (PostHog docs style):**

```tsx
components={{
  // Code blocks
  code: ({inline, children}) => inline
    ? <code class="font-mono text-[12px] bg-ph-surface-soft text-ph-ink px-1.5 py-0.5 rounded-ph-sm border border-ph-border">{children}</code>
    : <pre class="bg-ph-code-bg text-ph-ink-dark font-mono text-[13px] p-4 rounded-ph border border-[#3A3C32] overflow-x-auto">{children}</pre>,

  // Block quote / callout simulation
  blockquote: ({children}) => (
    <div class="border-l-4 border-ph-yellow bg-yellow-50 px-4 py-3 rounded-r-ph my-4 text-[13px] text-ph-body">
      {children}
    </div>
  ),

  // Links → open neighbor wiki if it's a node id, else external
  a: ({href, children}) => (
    <button class="text-ph-blue-link hover:underline text-left"
            onClick={() => isNodeId(href) ? openWiki(href) : window.open(href)}>
      {children}
    </button>
  ),
}}
```

---

### 2.3 Visibility by Kind

| Section | cluster | module | file |
|---|---|---|---|
| Summary | Yes | Yes | Yes |
| Dependency graph | Yes | Yes | Yes |
| Key files | Roll up from children | Yes | Yes (just the path) |
| Functions | Count only (no details) | Yes | Yes |
| Database tables | Count from children | Yes | Yes |
| Appears in flows | Yes (any step) | Yes | Yes |
| Recent changes | Yes | Yes | Yes |
| Wiki prose | Yes | Yes | Yes |

**Empty section handling:** omit the section header entirely if its data is empty. Do not render "No functions found" placeholders — silently skip. Exception: Dependency graph (always show at least the connections list or "No connections" note).

---

## 3. Navigation

### 3.1 Breadcrumb (sticky header)

```
Repo name  ›  Cluster label  ›  Module label
```

For `cluster` kind:
```
Repo name  ›  Cluster label
```

For `file` kind:
```
Repo name  ›  Cluster label  ›  Parent module label  ›  file.path (mono)
```

Each segment is a clickable link that opens that entity's wiki drawer.

### 3.2 Right-rail in-page TOC

Position: `sticky top-[52px]` (below the drawer header), right column 160 px, visible when scrollable body has ≥3 sections.

```tsx
// TOC container
<nav class="
  sticky top-[52px] w-40 flex-shrink-0 self-start
  pl-4 border-l border-ph-border-soft
  hidden lg:block
">
  <p class="text-[11px] font-bold font-sans text-ph-ash uppercase tracking-widest mb-3">
    On this page
  </p>
  <ul class="space-y-1">
    {tocItems.map(item => (
      <li key={item.anchor}>
        <a href={`#${item.anchor}`}
           class={`
             block text-[12px] py-0.5 leading-snug transition-colors
             ${activeAnchor === item.anchor
               ? 'text-ph-ink font-semibold border-l-2 border-ph-yellow -ml-px pl-2'
               : 'text-ph-mute hover:text-ph-body pl-2'}
           `}>
          {item.label}
        </a>
      </li>
    ))}
  </ul>
</nav>
```

Active anchor tracked via `IntersectionObserver` on each section `<h2>`.

TOC items (anchors generated from section labels):
```
#summary · #connections · #key-files · #functions
#database-tables · #flows · #recent-changes · #documentation
```

### 3.3 Neighbor cross-links

Every neighbor node mention (in the diagram, in flow steps, in PR touched list) is clickable and pushes a new wiki entry. Implement as a history stack in local state:

```ts
const [wikiStack, setWikiStack] = useState<string[]>([]);  // node ids
const openWiki = (nodeId: string) => setWikiStack(s => [...s, nodeId]);
const goBack = () => setWikiStack(s => s.slice(0, -1));
```

Back button in drawer header: `← Back` (ghost, appears when `wikiStack.length > 1`).

### 3.4 "Show on map" action

In drawer header (always visible):
- Fires `onShowOnMap(node.id)` prop callback.
- Parent (`App.tsx`) closes the overlay (not the drawer — keeps it open), calls `setCenter` / `fitView` on the React Flow instance to the node.
- Node is highlighted on map (sets `selected: true` on the node, dims others).
- Map tab switches to Architecture view if on a different tab.

---

## 4. Diagrams

### 4.1 Neighbor mini-diagram (Section 4)

**Technology: custom SVG — not @xyflow/react.**

A second React Flow instance in a drawer adds ~200 KB, re-triggers layout, and requires its own context. For 3–12 neighbors it's gross overkill. Custom SVG is ~50 lines, renders instantly, matches the design precisely.

**Component: `<NeighborGraph node={node} edges={edges} nodes={nodes} onNodeClick={fn} />`**

SVG layout:
```
Left column (incoming):  x=20,  y distributed
Center node:             x=260, y=center
Right column (outgoing): x=380, y distributed
Canvas width: 520px, height: max(180, nodeCount * 44 + 60)px
```

Node pill rendering:
```tsx
// Center node (selected)
<circle cx={260} cy={cy} r={40} fill="#F7A501" stroke="#DD9001" strokeWidth={1.5} />
<text x={260} y={cy} textAnchor="middle" dy="0.35em"
      fill="#151515" fontSize={12} fontWeight={700} fontFamily="Nunito">
  {truncate(node.label, 14)}
</text>

// Neighbor pill
<rect x={x} y={y} width={140} height={32} rx={6}
      fill="#FFFFFF" stroke="#BFC1B7" strokeWidth={1} />
<text x={x+16} y={y+16} dy="0.35em"
      fill="#4D4F46" fontSize={11} fontFamily="system-ui">
  {truncate(neighbor.label, 16)}
</text>
// hover: stroke="#9B9C92"
// onClick → openWiki(neighbor.id)
```

Edge paths:
```tsx
// Cubic bezier from center to neighbor
const path = `M ${startX},${startY} C ${midX},${startY} ${midX},${endY} ${endX},${endY}`;
<path d={path} fill="none" stroke="#BFC1B7" strokeWidth={1.5}
      markerEnd="url(#arrowhead)" />
// SVG <defs> contains arrowhead marker:
<marker id="arrowhead" markerWidth={8} markerHeight={6}
        refX={8} refY={3} orient="auto">
  <polygon points="0 0, 8 3, 0 6" fill="#BFC1B7" />
</marker>
```

Edge kind label:
```tsx
<text x={midX} y={(startY+endY)/2 - 6} textAnchor="middle"
      fill="#9B9C92" fontSize={9} fontFamily="system-ui">
  {edge.kind}
</text>
```

### 4.2 Flow sequence mini-diagram (Section 8)

Inside each flow card, the vertical timeline (described in Section 8 above) doubles as a mini sequence diagram. The current node's step is yellow-accented. No separate SVG needed — the CSS timeline handles it.

For clusters or when a node appears in multiple flows, optionally add a horizontal swimlane view: one row per flow, columns per step, current node column highlighted. This is a stretch goal — implement the vertical list first.

---

## 5. PostHog-Docs Styling — Tailwind Recipes

All tokens defined in `tailwind.config.js` per `docs/posthog-design-spec.md`.

### 5.1 Drawer shell

```tsx
// Overlay
<div class="fixed inset-0 bg-ph-canvas/50 backdrop-blur-[2px] z-40"
     onClick={closeDrawer} />

// Drawer
<aside class="
  fixed right-0 top-0 bottom-0 z-50
  w-[600px] max-w-[95vw]
  bg-ph-surface dark:bg-ph-surface-dark
  border-l border-ph-border dark:border-ph-border-dark
  flex flex-col
  animate-panel-in
  overflow-hidden
">
  {/* sticky header */}
  <header class="
    sticky top-0 z-10 flex items-center justify-between
    px-5 h-[52px] flex-shrink-0
    bg-ph-surface dark:bg-ph-surface-dark
    border-b border-ph-border dark:border-ph-border-dark
  ">
    {/* breadcrumb + actions */}
  </header>

  {/* scrollable body with TOC rail */}
  <div class="flex flex-1 overflow-hidden">
    <main class="flex-1 overflow-y-auto px-6 py-6 scroll-smooth" id="wiki-scroll">
      {/* sections */}
    </main>
    {/* right TOC rail — see §3.2 */}
  </div>
</aside>
```

### 5.2 Section header recipe

```tsx
// H2 — major section (appears in TOC)
<h2 id={anchor} class="
  font-sans font-bold text-[16px] text-ph-ink dark:text-ph-ink-dark
  pt-6 pb-2 mb-4
  border-b border-ph-border dark:border-ph-border-dark
  scroll-mt-[60px]
">
  {label}
</h2>

// H3 — subsection (prose inside wiki sections)
<h3 class="
  font-sans font-semibold text-[14px] text-ph-ink dark:text-ph-ink-dark
  mt-5 mb-2
">
  {label}
</h3>
```

`scroll-mt-[60px]` accounts for the 52px sticky header + 8px breathing room.

### 5.3 Callout / info box

PostHog docs use a colored left-border info box. Our callouts (e.g., "This module was recently changed") use:

```tsx
// Info callout (blue)
<div class="flex gap-3 p-3 rounded-ph bg-ph-blue-soft border-l-4 border-ph-blue mb-4">
  <lucide.Info class="w-4 h-4 text-ph-blue-teal flex-shrink-0 mt-0.5" />
  <p class="text-[13px] text-ph-body leading-relaxed">{message}</p>
</div>

// Warning callout (yellow) — used for "recently changed"
<div class="flex gap-3 p-3 rounded-ph bg-yellow-50 border-l-4 border-ph-yellow mb-4">
  <lucide.AlertTriangle class="w-4 h-4 text-ph-yellow flex-shrink-0 mt-0.5" />
  <p class="text-[13px] text-ph-body leading-relaxed">{message}</p>
</div>
```

Place the "recently changed" callout directly below the module hero if `node.changed_recently === true`:
```
"This module was recently changed — see Recent changes below for details."
```

### 5.4 Code / file chips

Inline file path:
```tsx
<code class="
  font-mono text-[12px]
  bg-ph-surface-soft dark:bg-ph-surface-dark-soft
  text-ph-body dark:text-ph-body-dark
  border border-ph-border dark:border-ph-border-dark
  rounded-ph-sm px-1.5 py-0.5
">{path}</code>
```

### 5.5 Kind badge (module hero)

```tsx
const kindBadge = {
  cluster: 'bg-ph-purple-soft text-ph-purple',
  module:  'bg-ph-blue-soft   text-ph-blue-teal',
  file:    'bg-ph-surface-soft text-ph-body',
};
<span class={`
  inline-flex items-center px-2.5 py-0.5 rounded-ph-pill
  font-sans text-label font-semibold tracking-wider
  ${kindBadge[node.kind]}
`}>
  {node.kind}
</span>
```

### 5.6 Dividers

```tsx
// Between major sections
<hr class="border-0 border-t border-ph-border-soft dark:border-ph-border-dark my-6" />
```

### 5.7 Typography scale inside wiki

| Element | Class recipe |
|---|---|
| Page title (H1) | `font-sans font-extrabold text-2xl text-ph-ink` |
| Section H2 | `font-sans font-bold text-base text-ph-ink border-b border-ph-border pb-2` |
| Subsection H3 | `font-sans font-semibold text-[14px] text-ph-ink` |
| Body prose | `text-[14px] text-ph-body leading-relaxed font-body` |
| Secondary / caption | `text-[12px] text-ph-mute` |
| Mono / path / code | `font-mono text-[12px] text-ph-body` |
| Count / meta number | `font-sans font-semibold text-[13px] text-ph-mute` |

### 5.8 Full component breakdown

```
WikiDrawer                    — root, manages open/close/stack state, overlay
  WikiHeader                  — sticky, breadcrumb + actions (ShowOnMap, Close, Back)
  WikiScrollBody              — flex row: WikiContent + WikiTOC
    WikiContent               — main scrollable column
      ModuleHero              — H1, kind badge, path chip, changed badge, changed callout
      WikiSection             — wraps each section (header + content + divider)
        SummarySection        — prose
        ConnectionsSection    — NeighborGraph SVG + fallback list
        KeyFilesSection       — file chip rows
        FunctionsSection      — collapsible function rows
        DbTablesSection       — expandable table cards
        FlowsSection          — flow timeline cards
        RecentChangesSection  — PR rows
        WikiProseSection      — markdown sections
    WikiTOC                   — sticky right rail with IntersectionObserver active tracking
  NeighborGraph               — standalone SVG component (~80 lines)
```

---

## 6. Onboarding Tie-in

### 6.1 First-load intro state

On first visit (no node selected, fresh load), render an intro card centered on the canvas — PostHog-style empty state that explains the feature and invites action:

```tsx
// Floats above canvas, pointer-events: none on canvas behind it
<div class="
  absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
  bg-ph-surface border border-ph-border rounded-ph
  p-8 max-w-[400px] w-full z-10
  animate-fade-in
">
  <p class="font-sans font-extrabold text-xl text-ph-ink mb-1">
    Your codebase, mapped.
  </p>
  <p class="text-[14px] text-ph-mute mb-4 leading-relaxed">
    Each cluster is a feature area. Each node is a module.
    Click any cluster to open its wiki — structure, dependencies,
    recent changes, and prose docs, all in one place.
  </p>

  {/* Animated hint: pulsing arrow pointing at nearest cluster */}
  <div class="flex items-center gap-2 text-[13px] text-ph-body">
    <lucide.MousePointerClick class="w-4 h-4 text-ph-yellow" />
    <span>Click a cluster to start</span>
  </div>
</div>
```

Dismiss condition: user clicks any node. Card fades out and never reappears (localStorage flag `lh_onboarded=true`).

### 6.2 Cluster nodes — invitation hint label

On the map itself, each cluster node gets a secondary label underneath its title when `lh_onboarded` is falsy:

```tsx
{!isOnboarded && (
  <div class="text-[10px] text-ph-ash mt-0.5 font-sans">
    Click to open wiki →
  </div>
)}
```

Remove after first click.

### 6.3 Wiki empty-state (node with no data at all)

If a node somehow has no summary, no edges, no functions, no PRs, and no sections, show:

```tsx
<div class="text-center py-12">
  <lucide.FileQuestion class="w-8 h-8 text-ph-stone mx-auto mb-3" />
  <p class="text-[14px] text-ph-mute">
    No documentation generated for this module yet.
  </p>
  <p class="text-[12px] text-ph-ash mt-1">
    Re-run the Lighthouse indexer with a richer config.
  </p>
</div>
```

### 6.4 "Explore related" footer nudge

At the bottom of every wiki page (after all sections), add a PostHog-style "What's next?" block:

```tsx
<div class="mt-8 pt-6 border-t border-ph-border">
  <p class="text-[11px] font-bold text-ph-ash uppercase tracking-widest mb-3">
    Explore related
  </p>
  <div class="flex flex-wrap gap-2">
    {/* Up to 4 direct neighbors as pill links */}
    {neighbors.slice(0, 4).map(n => (
      <button key={n.id}
              onClick={() => openWiki(n.id)}
              class="
                inline-flex items-center gap-1.5 px-3 py-1.5
                bg-ph-surface-soft border border-ph-border rounded-ph-pill
                text-[12px] text-ph-body font-sans
                hover:border-ph-mute hover:text-ph-ink transition-colors
              ">
        <lucide.ArrowRight class="w-3 h-3" />
        {n.label}
      </button>
    ))}
    {/* Parent cluster link */}
    <button onClick={() => openWiki(parentClusterId)}
            class="inline-flex items-center gap-1.5 px-3 py-1.5
                   bg-ph-yellow/10 border border-ph-yellow/30 rounded-ph-pill
                   text-[12px] text-ph-yellow-pressed font-sans font-semibold
                   hover:bg-ph-yellow/20 transition-colors">
      <lucide.Layers class="w-3 h-3" />
      {parentCluster.label}
    </button>
  </div>
</div>
```

---

## 7. Data Assembly Reference

For any given `nodeId`, here is how to assemble the complete wiki payload from `LighthouseData`:

```ts
function assembleWikiPayload(nodeId: string, data: LighthouseData) {
  const node = data.nodes.find(n => n.id === nodeId)
             ?? data.clusters.find(c => c.id === nodeId);  // clusters too

  const parentCluster = data.clusters.find(c =>
    c.modules.includes(nodeId) || c.id === node?.parent
  );

  const childModules = node && 'modules' in node   // cluster
    ? data.nodes.filter(n => (node as Cluster).modules.includes(n.id))
    : [];

  const incomingEdges = data.edges.filter(e => e.target === nodeId);
  const outgoingEdges = data.edges.filter(e => e.source === nodeId);

  const functions = (data.functions ?? []).filter(f => f.module_id === nodeId);
  const calls = (data.calls ?? []).filter(c =>
    functions.some(f => f.id === c.from || f.id === c.to)
  );

  const dbTables = (data.dbTables ?? []).filter(t => t.module_id === nodeId);

  const flows = data.flows.filter(f => f.steps.some(s => s.node === nodeId));

  const pullRequests = (data.pullRequests ?? [])
    .filter(pr => pr.touched.some(t => t.node_id === nodeId))
    .sort((a, b) => b.date.localeCompare(a.date));

  const sections = data.sections.filter(s => s.related_nodes.includes(nodeId));

  return {
    node, parentCluster, childModules,
    incomingEdges, outgoingEdges,
    functions, calls, dbTables,
    flows, pullRequests, sections,
  };
}
```

---

## 8. Implementation Checklist

- [ ] `WikiDrawer.tsx` — slide-over shell, overlay, close/back/show-on-map wiring
- [ ] `WikiHeader.tsx` — sticky header with breadcrumb + action buttons
- [ ] `WikiTOC.tsx` — right rail with IntersectionObserver active tracking
- [ ] `ModuleHero.tsx` — title, badges, path chip, changed callout
- [ ] `NeighborGraph.tsx` — custom SVG, ~80 lines, accepts edges/nodes, fires onNodeClick
- [ ] `WikiSection.tsx` — generic wrapper: H2 + content + divider
- [ ] `FunctionsSection.tsx` — collapsible list, show/hide toggle at 5
- [ ] `DbTablesSection.tsx` — expandable table schema cards
- [ ] `FlowsSection.tsx` — vertical timeline flow cards, current node highlighted
- [ ] `RecentChangesSection.tsx` — PR rows with status dot + touch kind badge
- [ ] `WikiProseSection.tsx` — react-markdown with PostHog-styled components map
- [ ] `assembleWikiPayload.ts` — pure data function (fully unit-testable)
- [ ] `useWikiStack.ts` — history stack hook (push/pop, expose current nodeId)
- [ ] Onboarding card on first load (localStorage gate)
- [ ] "Show on map" callback wired from drawer → App.tsx → React Flow

---

*Consistent with `docs/posthog-design-spec.md`. Color tokens, font stack, border radius, motion timings, and component patterns all inherited from that spec.*
