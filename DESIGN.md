---
name: AXLY Gateway
description: One API. Intelligent Routing. Zero-Downtime Failover.
colors:
  swiss-signal-red: "#e22828"
  swiss-signal-red-light: "#ca1c1c"
  route-cobalt: "#3ebaf4"
  route-cobalt-light: "#0683c1"
  charcoal-ground: "#0f1115"
  gunmetal-rail: "#15181e"
  slate-panel: "#13151b"
  surface-subtle: "#171a21"
  station-paper: "#f5f6f4"
  station-rail: "#e8eae6"
  off-white-ink: "#eceef3"
  muted-steel: "#919aac"
  hairline-rule: "#282e39"
  light-rule: "#d1d4ce"
  architectural-rule: "#d1d6e0"
  status-healthy: "#21c45d"
  status-cooldown: "#f59f0a"
  status-tripped: "#f43e5c"
typography:
  display:
    fontFamily: '"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: '"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  title:
    fontFamily: '"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: '"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace'
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.06em"
rounded:
  sm: "2px"
  md: "3px"
  lg: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.swiss-signal-red}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.slate-panel}"
    textColor: "{colors.off-white-ink}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  input-control:
    backgroundColor: "{colors.charcoal-ground}"
    textColor: "{colors.off-white-ink}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
    height: "36px"
  timetable-cell:
    backgroundColor: "{colors.slate-panel}"
    textColor: "{colors.off-white-ink}"
    rounded: "{rounded.lg}"
    padding: "14px 20px"
  nav-rail-item:
    backgroundColor: "{colors.slate-panel}"
    textColor: "{colors.off-white-ink}"
    rounded: "{rounded.lg}"
    padding: "8px 10px"
  badge-status:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.status-healthy}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
---

# Design System: AXLY Gateway

## Overview

**Creative North Star: "The Swiss Rail Timetable"**

Every LLM completion request traverses **AXLY Gateway** like an express train switching tracks across deterministic schedules: priority aliases, failover hops, cooldown timers, and circuit-breaker gates lock onto rule-divided grids rather than decorative cloud dashboards. The visual system draws from Swiss railway control rooms and modernist grid typography—calm, engineered, flat-by-default, and readable under sustained operational load.

The interface rejects generic AI SaaS aesthetics—no neon gradient backdrops, glassmorphic cards, hero metric bloat, or decorative sparklines. Dark theme (`charcoal-ground`) loads by default to suit engineering control stations, paired seamlessly with a calibrated station-paper light mode (`station-paper`) toggled cleanly via `Ctrl+T`, topbar switch, or Settings.

**Key Characteristics:**
- Rule-divided tabular schedules (`1px` structural hairlines and `2px` architectural section rules) replacing floating card mosaics.
- Crisp `2px`–`4px` geometric radii with restrained Swiss signal red strictly reserved for brand marks, primary CTAs, and active track markers.
- Self-hosted `Public Sans` UI sans-serif paired strictly with `JetBrains Mono` in `tabular-nums` for telemetry, endpoints, keys, and latencies.
- True backend telemetry across every chart, probe pill, and table—never synthetic placeholders or unbacked limits.

## Colors

A disciplined low-chroma architectural neutral scale accented by a single Swiss signal red (`swiss-signal-red`), cobalt route accent (`route-cobalt`), and three high-contrast operational states.

### Primary
- **Swiss Signal Red** (`swiss-signal-red`): Reserved exclusively for the `AXLY` brand mark badge, primary create/execute actions, active sidebar indicator squares, and destructive/focus-caret emphasis. Light theme deepens cleanly to `swiss-signal-red-light` for WCAG contrast against white and paper surfaces.

### Secondary
- **Route Cobalt** (`route-cobalt`): Denotes active routing targets, resolved upstream model hops, inline documentation/action links, SSE stream state tags, and chart throughput vectors. Shifts to `route-cobalt-light` in light mode for crisp readability on `station-paper`.

### Neutral
- **Charcoal Ground** (`charcoal-ground`): Primary dark-mode application canvas backdrop.
- **Gunmetal Rail** (`gunmetal-rail`): Left persistent navigation rail (`240px` fixed / `64px` collapsed) and raw HTTP wire code panels.
- **Slate Panel** (`slate-panel`): Elevated card, timetable, dialog, and table surface with crisp `1px` edge definition.
- **Subtle Surface** (`surface-subtle`): Secondary dock areas, table headers (`<thead>`), segmented tab tracks, and empty-state dashes.
- **Off-White Ink & Muted Steel** (`off-white-ink`, `muted-steel`): High-contrast primary foreground text paired with desaturated cool-gray secondary copy.
- **Hairline & Architectural Rules** (`hairline-rule`, `architectural-rule`): Thin `1px` container borders paired with heavy `2px` bottom/top structural anchors on `PageHeader`, rail headers, and dialogs.
- **Station Paper & Station Rail** (`station-paper`, `station-rail`): Warm neutral-paper ground and recessed left rail for daylight viewing.

### Semantic States
- **Healthy Emerald** (`status-healthy`), **Cooldown Amber** (`status-cooldown`), **Tripped Crimson** (`status-tripped`): Exclusively encode API readiness probes, credential cooldown timers, circuit breaker states (`CLOSED`, `HALF_OPEN`, `OPEN`), and request outcome series.

### Named Rules
**The Ten-Percent Signal Rule.** `swiss-signal-red` appears only on primary actions, active route markers, and the brand mark so genuine alerts and primary CTAs command attention without chromatic noise.
**The Honest Ink Rule.** Status colors never decorate neutral UI containers; emerald, amber, and crimson are strictly bound to telemetry and backend state.

## Typography

**Display Font:** Public Sans (with `system-ui, -apple-system, Segoe UI, sans-serif` fallback)
**Body Font:** Public Sans (with `system-ui, -apple-system, Segoe UI, sans-serif` fallback)
**Label/Mono Font:** JetBrains Mono (with `ui-monospace, SFMono-Regular, Consolas, monospace` fallback)

Self-hosted variable `.woff2` fonts under `frontend/public/fonts/` pair clean modernist proportions (`cv02`, `cv03`, `cv04`, `cv11`) with crisp technical monospace glyphs for operational legibility.

### Hierarchy
- **Display** (`700`, `1.25rem–1.5rem`, `line-height: 1.2`, `letter-spacing: -0.02em`): Top-of-page operational titles inside `PageHeader`.
- **Headline** (`600`, `1rem`, `line-height: 1.35`): Section panel titles, dialog headings, and empty-state titles.
- **Title** (`600`, `0.875rem`, `line-height: 1.4`): Chart headers, ledger subheadings, and group headings.
- **Body** (`400`, `0.75rem–0.875rem`, `line-height: 1.5`, measure `65–75ch` on documentation copy): Operational descriptions, form helpers, and API reference prose.
- **Label** (`600`, `0.6875rem`, `letter-spacing: 0.06em`, uppercase monospace): Section dividers (`CONTROL`, `INFRASTRUCTURE`, `WORKBENCH`, `SYSTEM`), KPI cell headers, and `<TableHead>` columns.

### Named Rules
**The Data-Only Monospace Rule.** Reserve `JetBrains Mono` strictly for metrics (`tabular-nums`), timestamps, latencies, route tracks, API keys, endpoints, and table headers—never set body paragraphs in monospace as a "technical" costume.
**The Self-Contained Heading Rule.** Headings open pages and cards directly without decorative kickers or eyebrows above them.

## Layout

Built on a persistent **App Shell**: fixed left navigation rail (`240px` desktop expanded, `64px` collapsed via toggle, slide-over drawer under `1024px`) paired with a sticky `52px` top status bar housing live `/ready` database latency status, route breadcrumbs, API Docs shortcut, theme toggle, and administrator identity.

- **Page Content Rhythm:** Centered `max-w-7xl` workspace container with `16px` mobile / `24px` desktop horizontal padding and `20px–24px` vertical spacing between bands.
- **Asymmetric Workbench Grids:** `12`-column Tailwind grids (`lg:grid-cols-12` at `gap-5`) pairing primary tracks/inspectors (`8` columns) against secondary pool readiness or parameter control rails (`4` columns).
- **Responsive Reflow:** Below `sm` (`640px`), `TimetableStrip` stacks single-column with horizontal hairlines; above `lg` (`1024px`), columns share a single horizontal strip with `1px` vertical dividers. Zero horizontal scroll overflow across `390px` viewports.

## Elevation & Depth

**Flat-by-default architectural layering.** Resting cards, tables, and timetable strips sit flush on the canvas (`background`) separated solely by tone step (`charcoal-ground` -> `slate-panel` -> `surface-subtle`) and crisp `1px` hairline borders—zero ambient drop shadows on static surfaces.

### Shadow Vocabulary
- **Popover / Floating Menu Shadow** (`0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): Applied to floating chart tooltips (`SwissChartTooltip`), segmented tab active indicator pills, and toast notifications.
- **Modal Overlay Depth** (`0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)` over `rgba(0,0,0,0.65)` scrim): Reserved exclusively for interrupting `Dialog` inspectors and secret-reveal confirmations.

### Named Rules
**The Hairline Separation Rule.** Hierarchy comes from surface tone steps, `1px` hairlines, and `2px` architectural rules—never stack soft box shadows under static dashboard panels.

## Shapes

Precision engineering geometry anchored on `--radius: 0.25rem` (`4px`):
- **Micro badges & code blocks (`2px` / `rounded-sm`):** Status pills, square `AXLY` signal mark, inline color swatches, and active track pips.
- **Standard surfaces & controls (`4px` / `rounded`):** Buttons, inputs, selects, timetable strips, chart panels, dialogs, and cards.
- **Structural Rules:** Every `PageHeader`, sidebar header brand zone, and dialog header uses a crisp `2px` solid rule (`rule-strong-b` / `rule-strong-t`) creating unmistakable Swiss editorial horizontal anchoring.

## Components

### Buttons
Minimalist tactical buttons (`36px` standard height / `32px` compact sm height, `4px` radius, `12px` semibold copy).
- **Primary:** Solid `swiss-signal-red` background with crisp `#ffffff` label and matching `1px` border (`150ms` transition to `90%` opacity on hover).
- **Outline / Secondary:** `slate-panel` or `secondary` surface with `1px` `hairline-rule` border, shifting to `accent` fill on hover.
- **Focus:** `2px` cobalt `route-cobalt` focus ring with `1px–2px` offset.

### Badges / Status Chips
- **Style:** Sharp `2px` corners (`rounded-sm`), `11px` bold wide tracking (`tabular-nums` uppercase monospace at `10px` on `StatusBadge`).
- **State:** `12%` semantic tint background with `30%` semantic border and leading `6px` circular indicator dot (`status-healthy`, `status-cooldown`, `status-tripped`).

### Cards / Containers
- **Corner Style:** `4px` radius (`rounded`).
- **Background:** `slate-panel` (`#13151b` dark, `#ffffff` light).
- **Shadow Strategy:** Flat (`none`), crisp `1px solid hairline-rule`.
- **Internal Padding:** `16px` mobile / `20px` desktop (`p-4 sm:p-5`).

### Inputs / Fields
- **Style:** `36px` height (`h-9`), `4px` radius, `1px` input border (`charcoal-ground` fill for `<Input>`, `slate-panel` fill for native `<Select>` with explicit `color-scheme`).
- **Focus:** `2px` `route-cobalt` outline ring.
- **Error:** Border switches to `status-tripped` paired with concise inline error message beneath the control.

### Navigation
- **Desktop Sidebar:** `240px` fixed `gunmetal-rail` container with collapsible `64px` icon rail mode, grouped into `CONTROL`, `INFRASTRUCTURE`, `WORKBENCH`, and `SYSTEM` (`8` streamlined routes). Active item fills with `slate-panel`, `1px` border, bold foreground label, and a trailing `6px` square `swiss-signal-red` indicator.
- **Mobile Drawer:** Full-height slide-over triggered cleanly from topbar menu button under `1024px`.

### Timetable KPI Strip
- **Signature Component:** `TimetableStrip` binds 4 `TimetableCell` metrics inside one shared outer `1px` frame divided internally by vertical desktop hairlines (`sm:divide-x`) and horizontal mobile hairlines (`divide-y`), displaying uppercase mono header + tag, large `24px` (`1.5rem`) semibold `JetBrains Mono` figure (`tabular-nums`), and hairline subtext breakdown.

## Do's and Don'ts

### Do:
- **Do** enforce `tabular-nums` (`font-variant-numeric: tabular-nums`) on every latency, RPM, token count, timestamp, and USD estimate so columns stay vertically aligned during live polling.
- **Do** keep dark mode (`html.dark`) as the initial default while calibrating every light-mode counterpart (`--border`, `--rule-strong`, `--accent-route`, `--status-*`) for >=4.5:1 AA contrast.
- **Do** separate sibling sections cleanly using `2px` `rule-strong` borders on page/section anchors and hairline `1px` divides inside data strips and tables.
- **Do** keep native browser `<select>` caret rendering single and platform-consistent via `color-scheme` rather than overlaying duplicate chevron icons.

### Don't:
- **Don't** place kickers or eyebrows above headings (`PageHeader`, cards, dialogs, or login headers).
- **Don't** add gradient text, neon glows, decorative glass blur, hard offset block shadows, `animate-bounce` loaders, or nested cards inside cards unnecessarily.
- **Don't** invent metrics or unbacked configuration inputs (never add client-key TPM limits where the backend stores only RPM and expiration, and never hardcode static gateway readiness).
- **Don't** leave raw markdown backticks in React copy; wrap technical paths and flags in styled `<code>` elements.
