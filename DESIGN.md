---
name: 1POS Super-Admin (Win8/Metro)
description: Flat, sharp-cornered Windows 8/Metro design system for the super-admin panel — distinct from the tenant-facing app's styling
colors:
  brand-teal: "#35979c"
  brand-teal-hover: "#2d868a"
  brand-teal-muted: "#5fb3b7"
  brand-teal-soft: "#e8f5f5"
  brand-navy: "#1e3a4c"
  brand-navy-deep: "#152a38"
  win8-success: "#0b7a44"
  win8-danger: "#c0392b"
  win8-warning: "#8a6206"
  win8-accent: "#7a3fc9"
  win8-info: "#1e70bf"
  win8-suspended: "#b35900"
  neutral-white: "#ffffff"
  neutral-border: "#d1d5db"
  neutral-row-hover: "#f3f4f6"
  neutral-text-primary: "#111827"
  neutral-text-secondary: "#374151"
  neutral-text-muted: "#6b7280"
typography:
  title:
    fontFamily: "Geist Sans, system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  drawer-heading:
    fontFamily: "Geist Sans, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
  table-header:
    fontFamily: "Geist Sans, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.05em"
  body:
    fontFamily: "Geist Sans, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "Geist Sans, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brand-teal}"
    textColor: "{colors.neutral-white}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.brand-teal-hover}"
  badge-flat:
    backgroundColor: "{colors.win8-success}"
    textColor: "{colors.neutral-white}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  action-icon-button:
    backgroundColor: "{colors.brand-teal}"
    textColor: "{colors.neutral-white}"
    rounded: "{rounded.none}"
    padding: "10px"
  table-header-row:
    backgroundColor: "{colors.brand-navy}"
    textColor: "{colors.neutral-white}"
  drawer-header:
    backgroundColor: "{colors.brand-navy}"
    textColor: "{colors.neutral-white}"
    padding: "16px 24px"
---

# Design System: 1POS Super-Admin (Win8/Metro)

## Overview

**Creative North Star: "The Control Room Tile Board"**

The super-admin panel is an operator's control surface, not a storefront — every screen is built for a small number of trusted staff scanning dense tenant/billing data and firing off state-changing actions all day. The system borrows directly from Windows 8/Metro: flat saturated color fills stand in for icons and status, everything meets at a hard 90° corner, and there is no ambient depth (no shadows, no gradients, no blur) to distract from the data. Chrome is deliberately quiet — navy headers and borders — so the only color that draws the eye is a status fill or an action button, and it always means something specific (a tenant is active, a subscription is suspended, this button will suspend it).

This is a **separate visual world from the tenant-facing app** (`app/[tenant]/[lang]/...`), which uses its own rounded, softer styling. Never bleed tenant-facing classes (`rounded-*`, pastel `bg-*-100`/`border-*-200` badges, `shadow-*`) into `app/super-admin/**`, and never bleed this flat Metro language back into tenant-facing pages.

**Key Characteristics:**
- Flat solid-color fills for every status, tag, and action — never pastel background + colored border/text
- Zero border-radius anywhere; zero box-shadow anywhere
- Navy (`#1e3a4c`) chrome for table headers and drawer headers; white content areas with `1px` gray-300 borders
- Right-side sliding drawers (not centered modals) for create/edit/detail workflows
- A custom five-dot orbiting "win8-spinner" in place of a generic spinning-ring loader

## Colors

The palette is entirely flat, saturated fills used as functional signal, plus a quiet navy/gray chrome. There is no pastel or tinted-background variant of any color in this system — a status is either a full-saturation fill with white text, or plain gray/dark text on white.

### Primary
- **Brand Teal** (`#35979c`): the one color that means "primary action" — the main call-to-action button (e.g. "+ New Tenant"), primary links, focus outlines, and the loading spinner's color. Hover state darkens to **Brand Teal Hover** (`#2d868a`).

### Secondary
- **Brand Navy** (`#1e3a4c`): reserved for structural chrome only — table header rows and drawer headers. It never appears as a status or action color, which is what keeps it reading as "frame" rather than "signal."

### Status Palette (functional, not decorative)
- **Win8 Success** (`#0b7a44`): active/complete/on states. Deliberately darker than a typical "success green" — the obvious brighter green (`#0f9d58`) only reaches 3.51:1 contrast against white text and fails WCAG AA; this shade clears 5.4:1.
- **Win8 Danger** (`#c0392b`): inactive/cancelled/off/destructive actions.
- **Win8 Warning** (`#8a6206`): in-progress/trial states. Also deliberately darkened from a brighter amber (`#e3a008`, which only reaches 2.26:1) to clear 5.48:1.
- **Win8 Info** (`#1e70bf`): paused states and neutral "resume" actions.
- **Win8 Suspended** (`#b35900`): the one status distinct enough from both danger-red and warning-amber to read as its own state — used only for "suspended" subscriptions and the suspend action.
- **Win8 Accent** (`#7a3fc9`): the one color with no status meaning — reserved for a single sensitive action (impersonation) so it stands out as categorically different from ordinary CRUD.

### Neutral
- **Neutral White** (`#ffffff`): all content surfaces — table bodies, drawer panels, toolbars.
- **Neutral Border** (`#d1d5db`, Tailwind `gray-300`): every hairline border — table wrapper, toolbar, drawer footer divider. Never a lighter `gray-100`/`gray-200` border; those read as "soft" and belong to the tenant-facing app.
- **Neutral Row Hover** (`#f3f4f6`, Tailwind `gray-100`): the only hover feedback a table row gets — a flat fill swap, no shadow, no scale.
- **Neutral Text Primary** (`#111827`, Tailwind `gray-900`): primary cell values (tenant name, feature key).
- **Neutral Text Secondary** (`#374151`, Tailwind `gray-700`): secondary cell values (slug, date, billing cycle) — always at `text-xs`, never the table's inherited `text-sm`.
- **Neutral Text Muted** (`#6b7280`, Tailwind `gray-500`): captions, empty-state placeholders, "no value" text. `gray-400` is banned here — it measures 2.54:1 against white and fails WCAG AA; `gray-500` clears 4.83:1.

### Named Rules
**The No Pastel Rule.** A status, tag, or tier is always a solid saturated fill with white text — never a `bg-*-100` / `text-*-800` / `border-*-200` combination. If a color needs a badge, it needs to be one of the tokens above.

**The 4.5:1 Floor Rule.** Any color paired with white text must be verified at ≥4.5:1 contrast before it enters the palette. This is why Win8 Success and Win8 Warning are darker than the "obvious" green/amber — the brighter versions were tried first and failed contrast in production.

## Typography

**Body Font:** Geist Sans (with `system-ui, -apple-system, sans-serif` fallback) — inherited from the app-wide font stack; the super-admin panel does not use a distinct typeface.

**Character:** Utilitarian and dense. There is no display/hero type anywhere in this system, and no page-level `<h1>` title/count block above the toolbar either — the page's own nav/breadcrumb already names it, so a repeated in-page title is dead weight. The toolbar is the first thing on the page. The largest text on any screen is a drawer heading at `1rem/600`, and most content lives at `0.75rem`–`0.875rem`.

### Hierarchy
- **Drawer Heading** (600, `1rem`): the title bar inside a right-side drawer or its "success" confirmation state (`text-lg font-bold` for the one-off "Tenant Created!" success screen).
- **Table Header** (500, `0.75rem`, `0.05em` tracking, uppercase, white-on-navy): column headers, sticky at the top of a scrolling table body.
- **Body** (400, `0.875rem`): primary cell values, drawer form labels' input text, toolbar inputs.
- **Caption** (400, `0.75rem`): secondary cell values, muted captions, badge text (badges use `0.75rem` + `600` weight, i.e. Caption size with Label weight).

### Named Rules
**The Uniform Caption Rule.** Every secondary/tertiary piece of text in a table cell — slug, date, billing cycle, empty-state dash — is `text-xs text-gray-700` (or `text-gray-500` if it's explicitly muted/empty). A secondary column rendered at the table's inherited `text-sm` is a bug, not a stylistic choice (caught and fixed once already on the Subscriptions "Billing" column).

## Layout

Both reference pages (`app/super-admin/tenants/page.tsx`, `app/super-admin/subscriptions/page.tsx`) share one shell: a `space-y-4` vertical stack of (optional title) → toolbar → table, with the table itself capped at `max-h-[70vh]` with internal scroll and a `sticky top-0` navy header row so column context survives scrolling a long list.

The toolbar is a single flat white bar (`border border-gray-300 p-3`) holding a search input (icon inset at `left-2.5`, `pl-8` on the input) and any filter `<select>`s, with the primary create action right-aligned via `justify-between`.

Table row actions live in the rightmost column, right-aligned (`flex justify-end`) — this is a hard rule, not a preference, since a left- or center-aligned action cluster breaks the scan pattern of a data table read top-to-bottom, right-edge-for-actions.

There is no dedicated mobile layout; the table scrolls horizontally (`overflow-x-auto`) below its natural width. Row actions are always visible (not hover-gated) specifically because hover-only reveal was tried and rejected — it made actions unreachable on touch devices with no hover state.

## Elevation & Depth

**Flat, with zero exceptions.** No `box-shadow` appears anywhere in this system — not on cards, not on hover, not on the drawer panel. Depth is conveyed only by:
1. Flat color contrast (a navy header sits "above" a white body purely because of hue, not shadow).
2. A single `1px` gray-300 border delineating a surface's edge.
3. Motion — the drawer's slide-in is the only cue that a panel has entered "front" of the stack; a `bg-black/50` scrim behind it does the rest.

### Named Rules
**The Flat-By-Default, Always Rule.** Unlike systems where "flat at rest, lifted on interaction" is the doctrine, this system never lifts. `hover:brightness-110` (a filter, not a shadow) is the only hover feedback an action button gets.

## Shapes

**Every corner is 90°.** `border-radius: 0` is enforced globally in `app/globals.css` for `button`, text inputs, `select`, and `textarea`, and no component in this system overrides it with a Tailwind `rounded-*` utility — including loading spinners and status dots, which are square dots orbiting in a ring rather than circles (see win8-spinner below). Borders are always `1px solid` gray-300; there is no double-border, inset, or outset styling.

## Components

### Buttons
- **Shape:** hard corner (`0px` radius, global).
- **Primary:** `bg-brand` / white text / `px-4 py-2 text-sm font-semibold`, e.g. "+ New Tenant", drawer "Save"/"Confirm".
- **Secondary/Cancel:** `border border-gray-300` outline button, `hover:bg-gray-100` — never a filled color for a cancel/dismiss action.
- **Action Icon Button** (table row actions): `inline-flex items-center justify-center p-2.5`, a single solid status/action color fill (e.g. `bg-win8-accent` for impersonate), white icon, `hover:brightness-110 transition-[filter]`. Always carries both `title` and `aria-label` since the label is icon-only.
- **Flat Label Button** (used instead of icons when the action set varies per row and a shared icon vocabulary would hurt scanability — e.g. Subscriptions' Plan/Extend/Payment/Activate/Pause/Suspend/Cancel row): `px-2.5 py-2 text-xs font-semibold text-white`, same solid-fill-per-action convention, `hover:brightness-110`.

### Badges / Status Tags
- **Style:** solid fill from the status palette, white text, `px-2 py-0.5 text-xs font-semibold`, no border, no radius. Used identically for onboarding status, active/inactive, subscription status, plan tier, and feature-flag on/off.
- **Interactive variant:** the onboarding-status badge is a native `<select>` styled identically to a static badge; its `<option>` elements are explicitly given `bg-white text-gray-900` since a `<select>` with white text otherwise leaks into the browser's native dropdown list and renders illegibly (white-on-white) — a real bug caught once and now a standing rule for any colored `<select>`.

### Tables
- **Header:** `bg-brand-navy text-white text-xs uppercase tracking-wide`, `sticky top-0 z-10`.
- **Body:** `divide-y divide-gray-200`, row `hover:bg-gray-100 transition-colors`.
- **Wrapper:** `border border-gray-300 bg-white`, `max-h-[70vh] overflow-y-auto` for internal scroll.
- **Empty/Loading state:** centered `py-12` block inside the same bordered white wrapper as the populated table (never a bare unstyled message) — loading uses the `win8-spinner`, empty uses plain `text-gray-500` copy.

### Drawers (signature component)
Right-side sliding panels (`components/admin/Win8Drawer.tsx`) replace centered modals system-wide for create/edit/detail/action workflows.
- **Shape:** `w-full max-w-lg h-full`, hard corners, no shadow.
- **Motion:** slides `translateX(100%) → 0` on open and reverses fully on close (mount stays alive through the closing transition — closing to nothing instantly was tried and rejected as feeling broken). `duration-[250ms] ease-out` for the panel, `duration-200` for the scrim opacity. A `bg-black/50` scrim sits behind it; clicking the scrim closes the drawer, clicking the panel does not.
- **Structure:** `flex flex-col h-full` — a `shrink-0` navy header (`bg-brand-navy text-white`, title + close `X`), a `flex-1 overflow-y-auto` body, and a `shrink-0` bordered-top footer with right-aligned Cancel/Confirm buttons. Long forms scroll internally; the header and footer never move.
- **Content-during-close:** because the panel stays mounted while closing, any state the drawer's title/body depends on (e.g. "Feature Flags — {tenant.name}") must be captured in a `display*` state that only updates when the drawer opens, so the content doesn't go blank mid-slide-out.

### Loading Indicator (signature component)
`.win8-spinner` — five square dots orbiting and throbbing in sequence (staggered `animation-delay`), rather than a single spinning ring. A `.win8-spinner-sm` variant exists for inline use inside a small icon button (e.g. the impersonate button's in-flight state).

## Do's and Don'ts

### Do:
- **Do** use a solid, contrast-verified fill (≥4.5:1 against white text) for every status/tag/badge — check new colors against the same math used for Win8 Success/Warning before adding them.
- **Do** keep row actions right-aligned and, if icon-only, always visible (never hover-gated) so touch users can reach them.
- **Do** reuse `components/admin/Win8Drawer.tsx` for any new create/edit/detail panel in this area rather than a centered modal.
- **Do** give every icon-only button both `title` and `aria-label`.
- **Do** keep secondary table-cell text at `text-xs text-gray-700` (or `text-gray-500` when explicitly muted) — never let a column inherit the table's base `text-sm`.
- **Do** keep form labels and plain body copy dark (`text-gray-600`/`700`/`900`) — white text is reserved for content sitting on a solid, contrast-verified fill (badges, filled buttons, navy chrome), never for a label or paragraph on a plain white surface.

### Don't:
- **Don't** use `rounded-*` or `shadow-*` anywhere in `app/super-admin/**` — this is enforced by convention, not a lint rule, so it has to be caught by eye.
- **Don't** use a pastel `bg-*-100 / text-*-800 / border-*-200` badge combination — every status is a solid fill, no exceptions.
- **Don't** put white text on a `<select>` without also forcing `bg-white text-gray-900` on its `<option>` children.
- **Don't** use `text-gray-400` for real copy — it fails contrast (2.54:1); use `gray-500` or darker.
- **Don't** bleed this Metro language into the tenant-facing app (`app/[tenant]/[lang]/...`), or bleed the tenant-facing app's rounded/pastel styling into `app/super-admin/**`.
- **Don't** add a page-level title/count block (`<h1>` + item count) above the toolbar — the toolbar is always the first element on the page.
