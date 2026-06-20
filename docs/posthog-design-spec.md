# Lighthouse × PostHog Design Spec

> Buildable design specification mapping PostHog's actual design language onto Lighthouse (Vite + React + TS + Tailwind + React Flow).
> Research sourced from PostHog's public handbook, brand assets page, VoltAgent DESIGN.md analysis, and xyflow docs.

---

## 1. PostHog Color Palette (Research-grounded)

### 1.1 Brand DNA

PostHog deliberately rejects the dark-tech "enterprise SaaS" look. Light mode is their primary surface — a warm **cream canvas** (`#EEEFE9`) rather than white. They call it "PostHog tan." Dark mode inverts to a near-black olive-charcoal. Their signature accent is **yellow-orange** (`#F7A501`), not blue. Brand red (`#F54E00`) is reserved as a logo/identity color, not for error states.

### 1.2 Official Light-Mode Palette

| Token | Hex | Usage |
|---|---|---|
| `canvas` | `#EEEFE9` | Page/app background (the "PostHog tan") |
| `surface-card` | `#FFFFFF` | Card faces |
| `surface-soft` | `#E5E7E0` | Subtle inset areas, secondary surfaces |
| `surface-doc` | `#FCFCFA` | Reading panels, documentation areas |
| `border` | `#BFC1B7` | Card borders, dividers |
| `border-soft` | `#DCDFD2` | Soft separators |
| `border-dashed` | `#D0D1C9` | Dashed dividers |
| `ink` | `#151515` | Headlines (at 90% opacity → `rgba(21,21,21,0.9)`) |
| `body` | `#4D4F46` | Body text |
| `mute` | `#6C6E63` | Secondary labels, captions |
| `ash` | `#9B9C92` | Placeholder text |
| `stone` | `#B6B7AF` | Disabled states |
| `accent-yellow` | `#F7A501` | Primary CTA, active states |
| `accent-yellow-pressed` | `#DD9001` | CTA pressed/active |
| `accent-yellow-dark` | `#DC9300` | Dark-mode yellow shift |
| `accent-red` | `#F54E00` | Brand only — NOT for errors |
| `accent-blue` | `#2C84E0` | Links, focus, informational |
| `accent-blue-soft` | `#DCEAF6` | Blue badge backgrounds |
| `accent-green` | `#2C8C66` | Success |
| `accent-green-soft` | `#D9EDDF` | Success badge backgrounds |
| `accent-red-semantic` | `#CD4239` | Error state (not brand red) |
| `accent-red-soft` | `#F7D6D3` | Error badge backgrounds |
| `accent-purple` | `#7C44A6` | Misc accent |
| `accent-purple-soft` | `#E7D8EE` | Purple badge backgrounds |
| `code-bg` | `#23251D` | Code blocks (dark olive) |
| `link-blue` | `#1D4ED8` | Hyperlinks |
| `focus-ring` | `rgba(59,130,246,0.5)` | Focus outlines |

### 1.3 Official Dark-Mode Palette

| Token | Hex | Usage |
|---|---|---|
| `canvas` | `#151515` | Background (near-black) |
| `surface-card` | `#23251D` | Cards (olive-charcoal) |
| `surface-soft` | `#2C2C2C` | Subtle surfaces |
| `border` | `#4B4B4B` | Card borders |
| `border-dashed` | `#4B4B4B` | Dashed dividers |
| `ink` | `#EEEFE9` | Headlines (at 90% opacity) |
| `body` | `#C4C5BC` | Body text (softened cream) |
| `mute` | `#8A8B82` | Secondary labels |
| `accent-yellow` | `#F1A82C` | CTA (warmer shift for dark bg) |
| `accent-blue` | `#4DA3F5` | Links, focus (lighter for dark) |
| `accent-red` | `#F54E00` | Brand red (unchanged) |
| `accent-green` | `#3DAE7E` | Success (lighter) |
| `code-bg` | `#0F1109` | Code blocks (deeper) |

---

## 2. Typography

### 2.1 PostHog's Actual Fonts

PostHog uses **two distinct contexts**:

**Website / Marketing (posthog.com)**
- Primary: **Open Runde** — a rounded, friendly sans-serif (proprietary, not on Google Fonts)
- Display: **Squeak** — uppercase bold only, paired with hedgehog artwork (marketing/brand only)
- Quotes in hedgehog art: **Loud Noises** (uppercase only)

**Product App (app.posthog.com — the one we're emulating)**
- Titles/buttons: **Open Runde** (same, but used more sparingly in product)
- Body/data: **System font stack** (`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`)
- The deeper DESIGN.md analysis cites **IBM Plex Sans Variable** for the design-system docs layer

### 2.2 Free Google Fonts Substitute

Since Open Runde is proprietary, use this stack for Lighthouse:

**For headings/UI labels/buttons:** [`Nunito`](https://fonts.google.com/specimen/Nunito) — rounded terminals, friendly weight, free on Google Fonts. Best available match to Open Runde's warmth and roundedness.

**Alternative:** [`DM Sans`](https://fonts.google.com/specimen/DM+Sans) — less rounded but clean, professional, and very legible at small sizes. Better for data-dense UIs.

**Body text:** `system-ui, -apple-system, "Segoe UI", sans-serif` — PostHog product uses system fonts for body, which gives a native-app feel.

**Monospace:** [`IBM Plex Mono`](https://fonts.google.com/specimen/IBM+Plex+Mono) — matches PostHog's code block aesthetic.

**Recommended pairing for Lighthouse:**
```
Font display/UI: Nunito (400, 600, 700, 800)
Font body:       system-ui stack
Font mono:       IBM Plex Mono (400, 500)
```

### 2.3 Type Scale

| Role | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|
| Display XL | 36px / 2.25rem | 700 | 1.5 | 0 |
| Display Lg | 24px / 1.5rem | 800 | 1.33 | -0.025em |
| Heading Lg | 21px / 1.3125rem | 700 | 1.4 | 0 |
| Heading Md | 18px / 1.125rem | 700 | 1.4 | 0 |
| Heading Sm | 14px / 0.875rem | 600 | 1.4 | 0.01em |
| Body Md | 16px / 1rem | 400 | 1.5 | 0 |
| Body Sm | 14px / 0.875rem | 400 | 1.43 | 0 |
| Body Strong | 16px / 1rem | 600 | 1.5 | 0 |
| Label | 12px / 0.75rem | 600 | 1.3 | 0.04em |
| Code | 13px / 0.8125rem | 400 | 1.43 | 0 |

---

## 3. Component Style Reference

### 3.1 Core Design Philosophy

PostHog uses **flat design with thin olive/cream borders** — no drop shadows on cards. "No elevation via shadows." Visual hierarchy comes from:
1. Background color differentiation (cream vs white vs olive-dark)
2. Thin 1px `#BFC1B7` borders
3. 6px border radius (nothing too round, nothing sharp)
4. Illustration/mascot accents instead of shadows

### 3.2 Buttons

**Primary (yellow):**
```
bg: #F7A501
text: #23251D (near-black, not white)
font: 14px / 700 / Nunito
padding: 8px 16px
height: 40px
border-radius: 6px
border: 1px solid #DD9001 (slightly darker — the "pressed" look)
hover: bg #DD9001
active/pressed: bg #B17816, transform: translateY(1px)
```
The "fun to click" feel comes from the border being slightly darker than the fill AND the 1px down-translate on press. No drop shadow — the border does the work.

**Secondary:**
```
bg: #E5E7E0
text: #23251D
border: 1px solid #BFC1B7
border-radius: 6px
hover: bg #D0D1C9
```

**Ghost/Tertiary:**
```
bg: transparent
text: #4D4F46
border: 1px solid transparent
hover: bg #E5E7E0, border-color #BFC1B7
```

**Tailwind classes (light mode):**
```
Primary: "bg-ph-yellow text-ph-ink font-semibold text-sm px-4 py-2 rounded-md border border-ph-yellow-pressed hover:bg-ph-yellow-pressed active:translate-y-px transition-colors"
Secondary: "bg-ph-surface-soft text-ph-ink text-sm px-4 py-2 rounded-md border border-ph-border hover:bg-ph-border-dashed transition-colors"
```

### 3.3 Cards

```
bg: #FFFFFF (light) / #23251D (dark)
border: 1px solid #BFC1B7 (light) / #4B4B4B (dark)
border-radius: 6px
padding: 24px
NO box-shadow (flat design)
```

PostHog's distinctive touch: cards sit on the cream `#EEEFE9` canvas — the contrast between white cards and the warm background creates depth without any shadow.

**Tailwind card class:**
```
"bg-white dark:bg-ph-surface-dark border border-ph-border dark:border-ph-border-dark rounded-md p-6"
```

### 3.4 Tabs / Nav

```
Active tab: border-bottom 2px solid #F7A501, text #23251D, font-weight 600
Inactive tab: text #6C6E63, hover text #23251D, hover border-bottom 2px solid #BFC1B7
Tab container: border-bottom 1px solid #BFC1B7
```

### 3.5 Badges / Tags

```
Shape: rounded-full (pill), 4px 10px padding
Font: 12px / 600 / letter-spacing 0.04em
Semantic colors:
  info:    bg #DCEAF6, text #1078A3
  success: bg #D9EDDF, text #2C8C66
  error:   bg #F7D6D3, text #CD4239
  warning: bg #FEF3C7, text #92400E
  neutral: bg #E5E7E0, text #4D4F46
  purple:  bg #E7D8EE, text #7C44A6
```

### 3.6 Tooltips

```
bg: #23251D (dark olive, even in light mode)
text: #EEEFE9
border-radius: 4px
padding: 6px 10px
font: 12px / 400
arrow: small 5px triangle
NO animation — just instant opacity 0→1 (PostHog: "snappy")
```

### 3.7 Code Blocks

```
bg: #23251D
text: #EEEFE9
border-radius: 6px
padding: 16px 20px
font: IBM Plex Mono, 13px / 400
border: 1px solid #3A3C32 (slightly lighter than bg)
```

---

## 4. Brand Personality

### 4.1 Tone

PostHog's copy voice:
- **Specific before generic**: "Track your funnel in 2 minutes" not "Powerful analytics for teams"
- **Direct, no hedging**: "You'll hate PostHog if..." (actual section on their site)
- **Self-deprecating humor**: They make fun of themselves
- **Developer-native**: Short paragraphs, scannable lists, no mission statements as openers
- **Transparency over polish**: Show the thing, explain it plainly

Microcopy examples in PostHog style:
- Empty state: "Nothing here yet. Run an analysis, or [start with a template →]"
- Error: "Something went sideways. [Error details]. Try again or [ping support]."
- Loading: "Loading... (this is the fast part)"
- Success: "Done." (just done — no exclamation mark theatrics)

### 4.2 Mascot (Max the Hedgehog)

PostHog employs two full-time illustrators for hedgehog art. For Lighthouse, we **cannot replicate Max** but can evoke the spirit:

**Emoji substitute:** Use `🦔` sparingly as a mascot stand-in in onboarding copy
**Sketch accents:** Use simple SVG hand-drawn-style underlines/circles on key labels (dashed stroke, slightly irregular)
**Illustration personality:** Posterized, flat-color, minimal shading style — like a sticker
**Irreverence:** Small witty labels on UI sections (e.g., the ask box: "Ask it anything — it won't judge your architecture")

### 4.3 Icons

PostHog uses a **outlined vector icon system** with 1.5px stroke weight. For Lighthouse, use [`lucide-react`](https://lucide.dev) — identical aesthetic (1.5px stroke, rounded joins, consistent sizing grid). Match sizes to 16px (inline), 20px (UI actions), 24px (feature icons).

---

## 5. Motion & Feel

### 5.1 PostHog's Motion Philosophy

- **"Snappy"** — no slow transitions. No hover animations on buttons (instant color swap)
- **"Deliberately understated"** — animation only when it adds clarity
- **Careful easing** — nothing bouncy or spring-based in the product UI
- Pressing buttons has a 1px `translateY` down — a tactile "click" feel
- Page/panel transitions: fade-in `opacity 0→1` over ~150ms, minimal translateY

### 5.2 Recommended Timings

| Action | Duration | Easing |
|---|---|---|
| Button hover/active | 0ms (instant) / 80ms press | ease-out |
| Tooltip appear | 100ms | ease-out |
| Panel open | 200ms | ease-out |
| Page transition | 150ms | ease-in-out |
| React Flow viewport | 600ms | ease-in-out |
| Node hover | 120ms | ease-out |
| Badge/tag appear | 150ms | ease-out |

---

## 6. Lighthouse Application Spec

### 6.1 App Layout & Surfaces

```
App shell background: #EEEFE9 (light) / #151515 (dark)
Left sidebar (if added): #FFFFFF with 1px right border #BFC1B7
React Flow canvas: separate treatment — see 6.2
Right reading panel: #FFFFFF / #23251D
Bottom ask box: #FFFFFF / #23251D, border-top 1px #BFC1B7
```

The canvas background contrasts the warm cream — this makes the white node cards "pop" without shadows.

### 6.2 React Flow Canvas

**Background pattern:** Use `<Background variant="dots" />` with:
```jsx
<Background
  variant="dots"
  gap={20}
  size={1}
  color="#BFC1B7"   // light mode: soft olive dots
  // dark mode: color="#3A3C32"
/>
```
Dots over a grid — more organic, less engineering-grid feel. The dot color matches PostHog's `border-soft` so it recedes.

**Canvas background color:** `#E8E9E2` (slightly darker than cream — gives depth vs the white cards)

**Dark mode canvas:** `#0F1109` (very deep olive-black, darker than card surface `#23251D`)

### 6.3 Node Card Styling (PostHog Idiom)

Each node card should use PostHog's flat-border idiom with a left-accent stripe to indicate node type (instead of shadows):

```
Base card:
  bg: #FFFFFF / dark: #23251D
  border: 1px solid #BFC1B7 / dark: 1px solid #4B4B4B
  border-radius: 6px
  padding: 12px 16px
  min-width: 180px

Left accent stripe (4px wide, full height, border-radius 6px 0 0 6px):
  color varies by node kind (see below)

Node type accent colors:
  component:   #2C84E0  (blue)
  hook:        #7C44A6  (purple)
  context:     #2C8C66  (green)
  util/lib:    #DC9300  (amber)
  type/model:  #6C6E63  (muted gray)
  page/route:  #F54E00  (PostHog brand red — premium feel)
  api/service: #1078A3  (teal)
  test:        #CD4239  (semantic red)

Selected state:
  border: 1.5px solid #2C84E0 (accent-blue)
  box-shadow: 0 0 0 3px rgba(44,132,224,0.15) (soft focus ring)

Hover state:
  border-color: #9B9C92
  transition: border-color 120ms ease-out
```

**CSS variables to set on `.react-flow`:**
```css
.react-flow {
  --xy-node-background-color-default: #FFFFFF;
  --xy-node-border-default: 1px solid #BFC1B7;
  --xy-node-boxshadow-hover-default: 0 0 0 2px rgba(191,193,183,0.5);
  --xy-node-boxshadow-selected-default: 0 0 0 3px rgba(44,132,224,0.2);
  --xy-edge-stroke-default: #BFC1B7;
  --xy-edge-stroke-width-default: 1.5;
  --xy-edge-stroke-selected-default: #2C84E0;
  --xy-handle-background-color-default: #BFC1B7;
  --xy-handle-border-color-default: #FFFFFF;
}
```

### 6.4 Edge Styling

**Default edges:**
```jsx
defaultEdgeOptions={{
  style: { stroke: '#BFC1B7', strokeWidth: 1.5 },
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: '#BFC1B7', width: 12, height: 12 },
  animated: false,
}}
```

**Highlighted edges (when a node is hovered/selected):**
```
stroke: accent color of the source node type
strokeWidth: 2.5
opacity: 1.0 (non-related edges dimmed to opacity 0.2)
```

**Animated edges for "active" connections (e.g., after LLM query highlights a path):**
```jsx
// Set animated: true on specific edges
// React Flow renders a dashed moving stroke — good for "live path" visualization
// Override the dash with:
className="react-flow__edge-path"
style={{ strokeDasharray: '6 3', animation: 'dashdraw 0.6s linear infinite' }}
```

**Glow on selected edges:**
```css
.react-flow__edge.selected .react-flow__edge-path {
  stroke: #2C84E0;
  stroke-width: 2.5;
  filter: drop-shadow(0 0 4px rgba(44,132,224,0.5));
}
```

### 6.5 MiniMap

```jsx
<MiniMap
  nodeColor={(node) => nodeTypeAccentColors[node.data.kind] ?? '#BFC1B7'}
  nodeStrokeColor="transparent"
  nodeBorderRadius={3}
  bgColor="#E8E9E2"       // light canvas color
  maskColor="rgba(238,239,233,0.7)"   // cream overlay
  maskStrokeColor="#BFC1B7"
  maskStrokeWidth={1}
  pannable
  zoomable
  style={{
    background: '#E8E9E2',
    border: '1px solid #BFC1B7',
    borderRadius: '6px',
  }}
/>
```

### 6.6 Controls

```jsx
<Controls
  style={{
    background: '#FFFFFF',
    border: '1px solid #BFC1B7',
    borderRadius: '6px',
    boxShadow: 'none',
  }}
/>
```
Override button styles with:
```css
.react-flow__controls-button {
  background: #FFFFFF;
  border-bottom: 1px solid #BFC1B7;
  color: #4D4F46;
}
.react-flow__controls-button:hover {
  background: #E5E7E0;
}
```

### 6.7 Viewport Transitions (React Flow "Wow" Techniques)

**Initial load — frame the graph well:**
```jsx
const { fitView, setCenter } = useReactFlow();

// On data load:
fitView({
  padding: 0.12,        // 12% padding around all nodes
  duration: 600,         // smooth fly-in
  maxZoom: 1.2,
  minZoom: 0.3,
  ease: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,  // ease-in-out quad
});
```

**On node click — zoom to selected node:**
```jsx
const node = getNode(selectedId);
if (node) {
  setCenter(
    node.position.x + (node.measured?.width ?? 180) / 2,
    node.position.y + (node.measured?.height ?? 80) / 2,
    { zoom: 1.4, duration: 500 }
  );
}
```

**On cluster expand — reframe subtree:**
```jsx
fitView({
  nodes: expandedNodes,
  padding: 0.15,
  duration: 500,
  ease: (t) => 1 - Math.pow(1 - t, 3),  // ease-out cubic
});
```

**Node entrance animation** — add to custom node component:
```css
@keyframes nodeEntrance {
  from { opacity: 0; transform: scale(0.92) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.react-flow__node {
  animation: nodeEntrance 200ms ease-out both;
}
```

**Node hover elevation:**
```css
.react-flow__node:hover {
  z-index: 10;
  transition: border-color 120ms ease-out;
}
```

**Edge highlighting on node hover** — use `useEdges` + `useNodes` in a custom hook:
```tsx
// On nodeMouseEnter: find connected edge IDs, set them highlighted, dim others
// On nodeMouseLeave: reset all edges to default opacity
// Implementation: store hoveredNodeId in state, compute edge styles in render
const edgeStyles = edges.map(e => ({
  ...e,
  style: {
    stroke: hoveredId && (e.source === hoveredId || e.target === hoveredId)
      ? nodeAccentColor(e.source)
      : '#BFC1B7',
    strokeWidth: hoveredId && (e.source === hoveredId || e.target === hoveredId)
      ? 2.5 : 1.5,
    opacity: hoveredId && e.source !== hoveredId && e.target !== hoveredId
      ? 0.2 : 1,
    transition: 'opacity 150ms ease-out, stroke 150ms ease-out',
  }
}));
```

**Smooth `minZoom` / `maxZoom`:**
```jsx
<ReactFlow
  minZoom={0.15}
  maxZoom={2.5}
  defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}  // start slightly zoomed out
  fitViewOptions={{ padding: 0.12, duration: 600 }}
/>
```

---

## 7. Side Reading Panel & Ask Box

### 7.1 Reading Panel

```
Width: 380px (collapsible)
bg: #FFFFFF / dark: #23251D
border-left: 1px solid #BFC1B7
padding: 24px
overflow-y: auto

Header:
  font: 16px / 700 / Nunito
  color: #23251D
  border-bottom: 1px solid #BFC1B7
  padding-bottom: 12px
  margin-bottom: 16px

Section items:
  padding: 12px 0
  border-bottom: 1px solid #DCDFD2 (border-soft)
  Active section: left border 3px solid #F7A501
  cursor: pointer
  hover bg: #EEEFE9 (warm, not cold blue)

Breadcrumb trail:
  font: 12px / 600 / Nunito
  color: #9B9C92 (ash)
  letter-spacing: 0.04em
  text-transform: uppercase

File path labels:
  font: IBM Plex Mono, 12px
  color: #6C6E63
  bg: #E5E7E0
  border-radius: 4px
  padding: 2px 6px
```

### 7.2 Ask Box

```
Container:
  bg: #FFFFFF / dark: #23251D
  border-top: 1px solid #BFC1B7
  padding: 16px

Input field:
  bg: #EEEFE9 / dark: #151515
  border: 1px solid #BFC1B7
  border-radius: 6px
  padding: 10px 14px
  font: 14px / system-ui
  color: #23251D / #EEEFE9
  focus: border-color #2C84E0, box-shadow 0 0 0 3px rgba(44,132,224,0.15)
  placeholder: "Ask about this codebase..."

Submit button: Primary style (yellow) — right-aligned inline
Character/token hint: 12px / #9B9C92, below input

PostHog microcopy label above box:
  "Ask it anything — it reads the whole map"
  Font: 12px / 600 / Nunito / uppercase / letter-spacing 0.06em / color #9B9C92
```

---

## 8. Hero / Onboarding Moment

### 8.1 Empty-State Design (PostHog-style)

PostHog's empty states: tell what to DO next, not just that nothing exists. They show the feature's value proposition inline.

**First-load overlay (before any codebase is loaded):**

```
Center-stage on the canvas (absolutely positioned, dismisses on first data load):

  ╔══════════════════════════════════════╗
  ║  🗺️  Lighthouse                     ║
  ║  ─────────────────────────────────  ║
  ║  Your codebase, as a living map.    ║
  ║                                     ║
  ║  Clusters = feature areas.          ║
  ║  Nodes = files. Edges = imports.    ║
  ║  Click anything to read it.         ║
  ║  Ask the map a question.            ║
  ║                                     ║
  ║  [ Load a codebase → ]              ║
  ╚══════════════════════════════════════╝

  Below, faint canvas text (like PostHog's "ghost" state):
  "This is what the Outline codebase looks like — 
   47 components, 12 clusters, 3 entry points."
```

**Styling of the empty-state card:**
```
bg: #FFFFFF
border: 1px solid #BFC1B7
border-radius: 6px
padding: 32px
max-width: 420px
box-shadow: none (PostHog flat)

Title: 24px / 800 / Nunito / #23251D
Subtitle: 16px / 400 / system-ui / #4D4F46
Hints: 14px / 400 / #6C6E63 (muted)
CTA: Primary yellow button
```

**Value line (one sentence, specific):**
> "Navigate any codebase in seconds — see structure, dependencies, and ask questions about what matters."

**Ghost canvas hint text** (appears on the background dots, very faint):
```
color: #BFC1B7
font: IBM Plex Mono, 12px
text: "← clusters   nodes →   click to read   ask anything ↓"
```

### 8.2 "What Is This" Hint Bar

A thin bar above the canvas (dismissable, max 1 session):
```
bg: #DCEAF6 (accent-blue-soft)
border-bottom: 1px solid #BFC1B7
padding: 8px 16px
font: 14px / #1078A3

Text: "You're looking at a live dependency map of the Outline codebase. 
       Click a cluster to zoom in. Click a node to read the file. 
       Or just ask below."

Dismiss: × icon right-aligned, color #9B9C92
```

---

## 9. Tailwind Theme (tailwind.config.js)

Replace the current `tailwind.config.js` with this PostHog-mapped config:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",  // toggle with class="dark" on <html>
  theme: {
    extend: {
      colors: {
        // ── PostHog Palette ──────────────────────────────────────────
        ph: {
          // Surfaces
          canvas:        "#EEEFE9",   // PostHog tan — light app bg
          "canvas-dark": "#151515",   // near-black for dark mode
          "surface":     "#FFFFFF",   // card face (light)
          "surface-soft":"#E5E7E0",   // subtle areas (light)
          "surface-doc": "#FCFCFA",   // reading panel (light)
          "surface-dark":"#23251D",   // card face (dark — olive charcoal)
          "surface-dark-soft": "#2C2C2C",

          // Borders
          "border":      "#BFC1B7",
          "border-soft": "#DCDFD2",
          "border-dashed":"#D0D1C9",
          "border-dark": "#4B4B4B",

          // Text
          "ink":         "#151515",   // headlines
          "ink-dark":    "#EEEFE9",
          "body":        "#4D4F46",
          "body-dark":   "#C4C5BC",
          "mute":        "#6C6E63",
          "mute-dark":   "#8A8B82",
          "ash":         "#9B9C92",
          "stone":       "#B6B7AF",

          // Accents
          "yellow":      "#F7A501",   // primary CTA
          "yellow-pressed":"#DD9001",
          "yellow-dark": "#F1A82C",   // CTA in dark mode
          "red-brand":   "#F54E00",   // PostHog brand red (NOT for errors)
          "red":         "#CD4239",   // semantic error red
          "red-soft":    "#F7D6D3",
          "blue":        "#2C84E0",
          "blue-soft":   "#DCEAF6",
          "blue-link":   "#1D4ED8",
          "blue-teal":   "#1078A3",
          "green":       "#2C8C66",
          "green-soft":  "#D9EDDF",
          "purple":      "#7C44A6",
          "purple-soft": "#E7D8EE",

          // Code block
          "code-bg":     "#23251D",

          // Node type accents
          "node-component": "#2C84E0",
          "node-hook":      "#7C44A6",
          "node-context":   "#2C8C66",
          "node-util":      "#DC9300",
          "node-type":      "#6C6E63",
          "node-page":      "#F54E00",
          "node-api":       "#1078A3",
          "node-test":      "#CD4239",
        }
      },
      fontFamily: {
        display: ['"Nunito"', 'system-ui', 'sans-serif'],
        sans:    ['"Nunito"', 'system-ui', 'sans-serif'],
        body:    ['system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'ph': '6px',    // PostHog standard radius
        'ph-sm': '4px',
        'ph-pill': '9999px',
      },
      fontSize: {
        'display-xl': ['2.25rem',  { lineHeight: '1.5',  fontWeight: '700' }],
        'display-lg': ['1.5rem',   { lineHeight: '1.33', fontWeight: '800', letterSpacing: '-0.025em' }],
        'heading-lg': ['1.3125rem',{ lineHeight: '1.4',  fontWeight: '700' }],
        'heading-md': ['1.125rem', { lineHeight: '1.4',  fontWeight: '700' }],
        'heading-sm': ['0.875rem', { lineHeight: '1.4',  fontWeight: '600', letterSpacing: '0.01em' }],
        'body-md':    ['1rem',     { lineHeight: '1.5',  fontWeight: '400' }],
        'body-sm':    ['0.875rem', { lineHeight: '1.43', fontWeight: '400' }],
        'label':      ['0.75rem',  { lineHeight: '1.3',  fontWeight: '600', letterSpacing: '0.04em' }],
        'code':       ['0.8125rem',{ lineHeight: '1.43', fontWeight: '400' }],
      },
      keyframes: {
        // Node entrance
        nodeEntrance: {
          'from': { opacity: '0', transform: 'scale(0.92) translateY(4px)' },
          'to':   { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        // Edge dash animation for active paths
        dashdraw: {
          'to': { strokeDashoffset: '-9' },
        },
        // Panel slide-in from right
        panelIn: {
          'from': { opacity: '0', transform: 'translateX(12px)' },
          'to':   { opacity: '1', transform: 'translateX(0)' },
        },
        // Hint bar fade-in
        fadeIn: {
          'from': { opacity: '0' },
          'to':   { opacity: '1' },
        },
        // Button press
        btnPress: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':       { transform: 'translateY(1px)' },
        },
      },
      animation: {
        'node-entrance': 'nodeEntrance 200ms ease-out both',
        'panel-in':      'panelIn 200ms ease-out both',
        'fade-in':       'fadeIn 150ms ease-out both',
        'btn-press':     'btnPress 80ms ease-out',
        'dashdraw':      'dashdraw 0.6s linear infinite',
      },
      boxShadow: {
        // PostHog uses NO elevation shadows — only focus rings
        'ph-focus': '0 0 0 3px rgba(44,132,224,0.2)',
        'ph-focus-yellow': '0 0 0 3px rgba(247,165,1,0.2)',
        'ph-edge-glow': 'drop-shadow(0 0 4px rgba(44,132,224,0.5))',
        // One subtle exception: floating panels over the canvas
        'ph-float': '0 4px 16px rgba(21,21,21,0.12)',
      },
    },
  },
  plugins: [],
};
```

---

## 10. Component Class Recipes

### 10.1 Button Recipes

```tsx
// Primary CTA button
const btnPrimary =
  "inline-flex items-center gap-2 px-4 py-2 h-10 rounded-ph " +
  "bg-ph-yellow text-ph-ink font-sans font-bold text-sm " +
  "border border-ph-yellow-pressed " +
  "hover:bg-ph-yellow-pressed active:translate-y-px " +
  "transition-colors duration-75 cursor-pointer select-none";

// Secondary button
const btnSecondary =
  "inline-flex items-center gap-2 px-4 py-2 h-10 rounded-ph " +
  "bg-ph-surface-soft text-ph-ink font-sans font-semibold text-sm " +
  "border border-ph-border " +
  "hover:bg-ph-border-dashed " +
  "transition-colors duration-75 cursor-pointer select-none";

// Ghost button
const btnGhost =
  "inline-flex items-center gap-2 px-3 py-2 h-9 rounded-ph " +
  "bg-transparent text-ph-body font-sans text-sm " +
  "border border-transparent " +
  "hover:bg-ph-surface-soft hover:border-ph-border " +
  "transition-colors duration-75 cursor-pointer select-none";
```

### 10.2 Card Recipe

```tsx
const card =
  "bg-ph-surface dark:bg-ph-surface-dark " +
  "border border-ph-border dark:border-ph-border-dark " +
  "rounded-ph p-6";

// Card with accent left stripe (node cards on canvas)
const nodeCard = (kind: NodeKind) => `
  bg-ph-surface dark:bg-ph-surface-dark
  border border-ph-border dark:border-ph-border-dark
  rounded-ph
  relative overflow-hidden
  pl-5
  before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1
  before:rounded-l-ph before:bg-ph-node-${kind}
  animate-node-entrance
`;
```

### 10.3 Badge Recipe

```tsx
const badge = (variant: 'info'|'success'|'error'|'warning'|'neutral'|'purple') => {
  const styles = {
    info:    'bg-ph-blue-soft    text-ph-blue-teal',
    success: 'bg-ph-green-soft   text-ph-green',
    error:   'bg-ph-red-soft     text-ph-red',
    warning: 'bg-yellow-100      text-yellow-800',
    neutral: 'bg-ph-surface-soft text-ph-body',
    purple:  'bg-ph-purple-soft  text-ph-purple',
  };
  return `inline-flex items-center px-2.5 py-0.5 rounded-ph-pill ` +
         `font-sans text-label font-semibold tracking-wider ` +
         styles[variant];
};
```

### 10.4 Input Recipe

```tsx
const input =
  "w-full px-3.5 py-2.5 rounded-ph " +
  "bg-ph-canvas dark:bg-ph-canvas-dark " +
  "border border-ph-border dark:border-ph-border-dark " +
  "text-ph-ink dark:text-ph-ink-dark font-body text-sm " +
  "placeholder:text-ph-ash " +
  "focus:outline-none focus:border-ph-blue focus:shadow-ph-focus " +
  "transition-shadow duration-100";
```

---

## 11. Google Fonts Import

Add to `index.html` (or CSS `@import`):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Or in `src/index.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
```

---

## 12. Dark Mode Toggle

Use Tailwind's `class` dark mode strategy. Toggle by adding/removing `dark` class on `<html>`:

```tsx
// In App.tsx or a ThemeProvider:
const toggleTheme = () => {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
};

// On mount:
const saved = localStorage.getItem('theme') ?? 'light';
if (saved === 'dark') document.documentElement.classList.add('dark');
```

Pass `colorMode` to `<ReactFlow>` to match:
```jsx
<ReactFlow
  colorMode={isDark ? 'dark' : 'light'}
  // ...
/>
```

---

## 13. CSS Global Overrides for React Flow

Add to `src/index.css`:

```css
/* PostHog-style React Flow overrides */
.react-flow {
  --xy-node-background-color-default: #FFFFFF;
  --xy-node-border-default: 1px solid #BFC1B7;
  --xy-node-boxshadow-hover-default: none;
  --xy-node-boxshadow-selected-default: 0 0 0 3px rgba(44,132,224,0.2);
  --xy-edge-stroke-default: #BFC1B7;
  --xy-edge-stroke-width-default: 1.5;
  --xy-edge-stroke-selected-default: #2C84E0;
  --xy-handle-background-color-default: #BFC1B7;
  --xy-handle-border-color-default: #FFFFFF;
  --xy-background-color-default: #E8E9E2;
  --xy-minimap-background-color-default: #E8E9E2;
  --xy-controls-button-background-color-default: #FFFFFF;
  --xy-controls-button-border-color-default: #BFC1B7;
  --xy-controls-button-color-default: #4D4F46;
  --xy-controls-button-background-color-hover-default: #E5E7E0;
}

.dark .react-flow {
  --xy-node-background-color-default: #23251D;
  --xy-node-border-default: 1px solid #4B4B4B;
  --xy-edge-stroke-default: #4B4B4B;
  --xy-handle-background-color-default: #4B4B4B;
  --xy-handle-border-color-default: #23251D;
  --xy-background-color-default: #0F1109;
  --xy-minimap-background-color-default: #151515;
  --xy-controls-button-background-color-default: #23251D;
  --xy-controls-button-border-color-default: #4B4B4B;
  --xy-controls-button-color-default: #C4C5BC;
  --xy-controls-button-background-color-hover-default: #2C2C2C;
}

/* Node entrance animation */
@keyframes nodeEntrance {
  from { opacity: 0; transform: scale(0.92) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.react-flow__node {
  animation: nodeEntrance 200ms ease-out both;
}

/* Edge glow on selection */
.react-flow__edge.selected .react-flow__edge-path {
  filter: drop-shadow(0 0 4px rgba(44,132,224,0.5));
}

/* Controls: PostHog flat style */
.react-flow__controls {
  box-shadow: none;
  border: 1px solid #BFC1B7;
  border-radius: 6px;
  overflow: hidden;
}
.dark .react-flow__controls {
  border-color: #4B4B4B;
}
.react-flow__controls-button {
  box-shadow: none;
  border-bottom: 1px solid #BFC1B7;
}
.react-flow__controls-button:last-child {
  border-bottom: none;
}
.dark .react-flow__controls-button {
  border-bottom-color: #4B4B4B;
}

/* MiniMap: match card style */
.react-flow__minimap {
  border-radius: 6px;
  border: 1px solid #BFC1B7;
  overflow: hidden;
}
.dark .react-flow__minimap {
  border-color: #4B4B4B;
}

/* Animated edge dash for active paths */
@keyframes dashdraw {
  to { stroke-dashoffset: -9; }
}
.react-flow__edge.animated .react-flow__edge-path {
  stroke-dasharray: 6 3;
  animation: dashdraw 0.6s linear infinite;
}
```

---

## 14. Summary Quick-Reference

| Decision | PostHog Source | Lighthouse Value |
|---|---|---|
| App BG (light) | `#EEEFE9` PostHog tan | Same |
| App BG (dark) | `#151515` | Same |
| Canvas BG (light) | — | `#E8E9E2` (slightly darker than tan) |
| Canvas dots color | `#BFC1B7` | Same |
| Card BG (light) | `#FFFFFF` | Same |
| Card border | `#BFC1B7` | Same |
| Primary CTA | `#F7A501` yellow | Same |
| CTA text | `#23251D` dark (not white!) | Same |
| Node accent stripe | PostHog semantic colors | Per node kind |
| Heading font | Open Runde (proprietary) | Nunito (Google Fonts) |
| Body font | System font | system-ui stack |
| Mono font | — | IBM Plex Mono |
| Border radius | 6px | 6px |
| Shadows | None (flat) | None except focus rings |
| Edge default | — | `#BFC1B7`, 1.5px, smoothstep |
| Viewport fly-in | — | fitView 600ms ease-in-out |
| Node click zoom | — | setCenter 500ms |
| Edge highlight | — | node accent color, 2.5px, dim others 0.2 |

---

*Sources: PostHog Visual Identity Handbook (posthog.com/handbook/brand/visual-identity), PostHog Brand Assets (posthog.com/handbook/company/brand-assets), VoltAgent DESIGN.md analysis (github.com/VoltAgent/awesome-design-md), React Flow theming docs (reactflow.dev/learn/customization/theming), FitViewOptions API (reactflow.dev/api-reference/types/fit-view-options), MiniMap API (reactflow.dev/api-reference/components/minimap).*
