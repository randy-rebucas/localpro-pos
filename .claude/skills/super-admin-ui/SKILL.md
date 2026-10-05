---
name: super-admin-ui
description: Apply the super-admin panel's Windows 8 / Metro flat UI/UX system (app/super-admin) to any other page or component — tables, toolbars, filter bars, drawers, modals, badges, KPI cards, section cards, loading/empty/error states. Use when the user says "make this look like super-admin", "apply the super-admin UI", "Win8/Metro styling", "flat design treatment", or asks to restyle/lay out a page under app/[tenant]/[lang]/admin or app/super-admin.
---

# super-admin-ui

Restyle a page so it looks and behaves like the super-admin panel (`app/super-admin/**`). That panel is the reference implementation of the project's **Windows 8 / Metro flat design system**: square corners, solid flat color, thin gray borders, a navy/teal brand pair, and a small fixed set of UX behaviors.

Copy-paste class strings for every component live in [references/patterns.md](references/patterns.md). Read it before writing markup. Don't guess class names.

## When invoked

The argument is a target page or component (e.g. `app/[tenant]/[lang]/admin/categories/page.tsx`). If none is given, use the file open in the IDE, or ask.

## Process

1. **Read the target fully.** Also read its hooks and child components. Don't grep for `rounded-`/`shadow-` and stop there: classes get built conditionally and live in child components ([[feedback_always_full_audit]]).
2. **Identify the page type** and pick the matching reference page to mirror:
   | Page type | Mirror | Key pieces |
   |---|---|---|
   | CRUD list | `app/super-admin/tenants/page.tsx` | toolbar → table → pagination → Win8Drawer form |
   | Filtered log/report | `app/super-admin/logs/page.tsx`, `billing/page.tsx` | filter bar with labels + presets → table → expandable row |
   | Settings / tools | `app/super-admin/settings/page.tsx`, `backups/page.tsx` | stacked section cards with header strip + action button |
   | Dashboard / analytics | `app/super-admin/dashboard/page.tsx`, `analytics/page.tsx` | KPI grid, bar rows, quick-link tiles |
   | Reference cards | `app/super-admin/business-types/page.tsx` | card grid with expand toggle, info note |
3. **Map every element** of the target to a pattern in `references/patterns.md`: containers, buttons, inputs, badges, tables, overlays, and states. If an element has no pattern, build it from the tokens and rules below. Don't invent a new visual idiom.
4. **Rewrite the markup only.** Keep the logic, data fetching, permissions, and i18n as they are. On tenant pages (`app/[tenant]/[lang]/**`), all text comes from the dictionaries (`dictionaries/en.json` + `es.json`). Never replace a dictionary lookup with the hardcoded English from the super-admin reference. Add any new keys to **both** files.
5. **Apply the UX behaviors** (below), not just the look.
6. **Verify** (see the end of this file).

## Non-negotiable visual rules

- **No** `rounded-*` (including `rounded-full` on dots, avatars, and spinners), **no** `shadow-*`, **no** `bg-gradient-*`, **no** `ring-*` focus styles, **no** `scale`/`translate` hover animations. The `.card-hover` class in globals.css adds a shadow, so don't use it.
- **Solid fills, white text** for anything colored: badges, icon buttons, status tiles, table headers. Never use pastel `bg-*-50/100` with colored text. That includes alerts: `bg-red-50 text-red-800` is wrong.
- **Use design tokens, not raw Tailwind palette colors.** `text-win8-danger`, not `text-red-600`; `bg-win8-success`, not `bg-green-500`. The only grays are `gray-*` utilities for neutrals.
- **Borders:** `border border-gray-300` on panels, inputs, and tables; `divide-gray-200` between rows; `border-gray-200` for inner rules.
- **Hover:** solid-color controls use `hover:brightness-110 transition-[filter]`; brand buttons use `hover:bg-brand-hover`; outline buttons and rows use `hover:bg-gray-100` (older pages use `gray-50`; prefer `gray-100`); links use `hover:underline`.
- **Loading:** use the five-span `win8-spinner`, never a `rounded-full animate-spin` border circle. Use `animate-pulse` gray blocks for skeletons of KPI grids.

## Tokens (from `app/globals.css` `@theme`)

| Token | Hex | Use |
|---|---|---|
| `brand` | #35979c | primary buttons, active nav, links, icon chips, default action |
| `brand-hover` | #2d868a | hover of `bg-brand` |
| `brand-soft` | #e8f5f5 | selected row, info-note background |
| `brand-navy` | #1e3a4c | table header, drawer header, "safe" secondary solid button, enterprise tier |
| `win8-success` | #0b7a44 | active, paid, on, positive delta |
| `win8-danger` | #c0392b | inactive, failed, delete, deactivate, errors |
| `win8-warning` | #8a6206 | trial, in-progress, flags |
| `win8-info` | #1e70bf | informational, sent, selected-for-action |
| `win8-accent` | #7a3fc9 | impersonate, plan change, "special" |
| `win8-suspended` | #b35900 | suspended, refunded |
| `gray-500` | — | neutral/unknown/not-started badge |

All `win8-*` colors pass 4.5:1 contrast with white text. Always put white text on them.

Map status values through a `Record<string, string>` constant at module top (e.g. `STATUS_BADGE`, `TIER_BADGE`, `TYPE_BADGE`), with `'bg-gray-500 text-white'` as the fallback. Don't use inline ternary chains for more than two states.

## Page anatomy

- **In `app/super-admin/`**: `components/super-admin/Shell.tsx` already renders the sidebar and the page `<h1>`, taken from its `PAGE_TITLES` map. The page root is `<div className="space-y-4">` (or `space-y-6` for stacked section cards) with **no** extra padding (the shell's `<main>` has `p-6`) and **no** page `<h1>`. For a new page, add it to both `NAV_ITEMS` and `PAGE_TITLES`.
- **In tenant admin (`app/[tenant]/[lang]/admin/`)**: there is no shell title, so start the page with `components/admin/AdminPageHeader.tsx` (title + description + actions slot), then the same `space-y-4` body.
- Vertical order: **toolbar/filter bar → content panel(s) → pagination inside the table panel**. Overlays (drawer/modal) sit as siblings after the body inside a fragment `<>…</>`.

## UX behaviors

- **Create/edit forms open in `Win8Drawer`** (`components/admin/Win8Drawer.tsx`), a right-side slide-over with a navy header, scrollable body, and pinned footer (Cancel left of primary). Use centered modals only for short confirm-or-choose actions (see the users page action modal).
- **Feedback:**
  - List-level success or failure goes to `showToast.success/error` (`@/lib/toast`).
  - Form validation or save errors go inline at the bottom of the drawer body.
  - Section-level errors use the inline error box inside that section.
- **Async buttons:** disable with `disabled:opacity-50` and swap the label to a progress verb with an ellipsis (`Saving…`, `Checking…`, `Exporting…`). Use `…` (U+2026) consistently.
- **Destructive actions** must confirm first:
  - Use `confirm()` with the entity name in quotes, e.g. `Delete plan "Pro"? This cannot be undone.`
  - For anything irreversible and large, add a visible danger box explaining the consequence before the button (see `backups/page.tsx`).
- **Primary CTA** is `+ New <Thing>`, on the right of the toolbar. Search and filters go on the left.
- **Row actions** are right-aligned square icon buttons with both `title` and `aria-label`. The action color matches its meaning: edit=brand, delete/deactivate=danger, activate=success, special=accent, flags=warning.
- **Every data region has three states:** loading (spinner + "Loading <things>…"), empty (distinguish *"No X match your filters."* from *"No X yet."*), and error (message + Retry button). Never render an empty table.
- **Data formatting:**
  - `—` for missing values.
  - `font-mono text-xs` for slugs, IDs, IPs, and filenames.
  - `tabular-nums` and `toLocaleString()` for counts and money.
  - A secondary line under a primary cell value uses `text-xs text-gray-400/500`, e.g. name over slug.
- **Tables:** wrap long lists in `max-h-[70vh] overflow-y-auto` with a `sticky top-0 z-10` header. Pagination text reads `Showing 1–20 of 134` with `← Prev` / `Next →`.
- **Accessibility:**
  - Icon-only buttons need `aria-label`.
  - Selects without a visible label need `aria-label`.
  - Decorative SVGs get `aria-hidden="true"`.
  - Focus outlines come from globals.css (`2px solid #35979c`). Don't fight them with `focus:ring-*`.
  - `button, a` have a global 44px minimum touch target, which is why icon buttons use `p-2.5` with a `w-4 h-4` icon.

## Known drift in the reference (do NOT copy)

These are existing inconsistencies in `app/super-admin`. If you touch these files, fix them. Never propagate them.

- `components/super-admin/Shell.tsx`: nav items use `rounded`, and the auth-loading state uses a `rounded-full animate-spin` circle. Use square items and `win8-spinner` instead.
- `app/super-admin/dashboard/page.tsx`: root has `p-6` (double padding inside the shell's `main`) and its own `<h1>`. Stat colors use `text-green-600`/`text-red-600`/`text-purple-600` instead of `win8-*` tokens.
- `app/super-admin/login/page.tsx`: inputs use `focus:ring-2 focus:ring-brand`, and the error uses pastel `bg-red-50 text-red-800`.
- `app/super-admin/users/page.tsx`: the confirm button uses `hover:brightness-90`. It should be `110`. The modal also lacks `role="dialog"`, `aria-modal`, and Escape-to-close.
- `Win8Drawer` now provides Escape-to-close, `role="dialog"` + `aria-modal`, a Tab focus trap, focus restore, and auto-labels itself from the first `<h2>` (or pass `ariaLabel`). Don't re-implement any of these per page.
- Inputs across pages carry a redundant `focus:outline-none`. The unlayered global `input:focus-visible` rule wins anyway. Omit it in new code.

## Verify

1. Run a regex over the edited files. Every hit must be justified or removed:
   `rounded-|shadow-|gradient|ring-|bg-(red|green|yellow|blue|amber)-(50|100)|text-(red|green|yellow|blue|purple)-[0-9]|animate-spin`
2. Re-read each edited file top to bottom. Check that every overlay, button, badge, and state matches a pattern from `references/patterns.md`.
3. On tenant pages, confirm that no dictionary lookups were replaced by literals, and that new keys exist in both `en.json` and `es.json`.
4. Run `pnpm lint` and `npx tsc --noEmit`. If the page has tests (`__tests__/**`), run them with `npx vitest run <file>`, because markup changes often break `getByRole`/`getByText` queries.
5. If `docs/` describes the page's UI, update it (project convention).
