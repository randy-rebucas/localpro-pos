---
name: pos-gloss-design
description: Apply the 1pos "glossy, compressed, POS-aligned" design language (dark navy/teal glass, keycap buttons, LCD readouts, register mockups, scroll-driven motion, stock-photo parallax) to a public or tenant-facing page. Use when redesigning or building any page outside app/super-admin/ to match the public homepage — e.g. /login, /signup, /stores, /privacy, tenant storefronts, or tenant app screens.
---

# 1pos glossy POS design system

The reference implementation is the public homepage: `app/page.tsx` → `components/marketing/*`.
Read the closest existing component before building something new and reuse it rather than re-inventing.

**Never apply this to `app/super-admin/`** — that area uses the flat Windows 8 / Metro system (see CLAUDE.md).

## The idea in one paragraph

The page should feel like the till itself: glossy keycaps you want to press, green LCD readouts for numbers,
dark navy glass panels with a teal glow, dense layouts with tight spacing, and real counter details
(OR numbers, VAT-inclusive totals, drawer counts, Manila time). Motion shows the product working, not decoration.
Copy talks like someone behind the counter, not like a SaaS template.

## Building blocks (already in `app/globals.css`, all prefixed `mk-`)

| Class | Use for |
| --- | --- |
| `mk-root` | **Wrap every page that uses this system.** Hands `min-height`/`min-width`/`border-radius` of `a`/`button` back to Tailwind (the global CSS forces 44px and square corners). |
| `mk-dark` | Dark section background: navy gradient + teal radial glow. Use instead of flat `bg-gray-900`. |
| `mk-glass` | Dark glossy panel (top highlight, soft shadow). Add `backdrop-blur-md` when it sits on a photo. |
| `mk-panel` | Light glossy panel for light sections (`bg-white` / `bg-[#eef3f5]`). |
| `mk-key` / `mk-key-brand` / `mk-key-light` | Keycap surfaces — buttons, icon tiles, chips. Split gradient = the gloss. Primary CTA is `mk-key-brand`, secondary `mk-key`, on-dark light CTA `mk-key-light`. |
| `mk-lcd` | Green register display for numbers/stats (mono font, glow). Pair with `mk-lcd-on` to flicker on when a value changes (`key={value}`). |
| `mk-sheen` | Light sweep on hover — CTAs and feature cards only. |
| `mk-reveal` | Scroll-driven entrance (pure CSS). Stagger with `style={{ ['--i' as string]: index }}`. |
| `mk-print` | Receipt "printing" (clip-path) as it scrolls into view. |
| `mk-parallax` / `mk-parallax-hero` | Photo background drift (scroll timeline). `-hero` is for the first screen. |
| `mk-hero-in` | One-shot entrance on load (blur + rise). Also good for content swapped by `key`. |
| `mk-line-in`, `mk-tap-flash`, `mk-cursor`, `mk-slip`, `mk-progress` | Register-demo micro-animations (see `TerminalMockup.tsx`, `CounterCarousel.tsx`). |

React primitives in `components/marketing/ui.tsx`:
- `SectionHeader` — F-key chip + eyebrow + h2 + desc + optional right-side `aside`. Every section starts with one.
- `FKey` — keycap label ("F1", "↵ ENTER", "APP"). Sections are numbered F1, F2… in page order.
- `ArrowIcon` — lucide `ArrowRight` for CTAs.

Data hooks in `components/marketing/useMarketing.ts`: `useHomeDict()` (en/es dictionary, follows `preferred_lang`), `usePlatformStats()`.

## Rules

**Tokens**
- Brand teal `brand` `#35979c`, `brand-muted` `#5fb3b7`, `brand-soft`; navy base `#0a1620` / `#10222f`; light section bg `#eef3f5`.
- Rounded corners are small: `rounded` / `rounded-md` for keys, `rounded-lg` panels, `rounded-xl` for big frames. No pills except status badges.
- Numbers, times, OR numbers, prices → `font-mono` + `tabular-nums`, ideally inside `mk-lcd`.

**Compression**
- Sections: `px-4 sm:px-6 py-12 md:py-16`, container `max-w-7xl mx-auto`.
- h1 `text-4xl sm:text-5xl lg:text-[3.25rem] font-black`; h2 `text-2xl md:text-3xl font-bold`; body `text-sm`–`text-[15px]`; card text `text-xs`.
- Grids use `gap-1.5`/`gap-2`, not `gap-8`. Tiles over cards; dense 4-column grids on `lg`.
- Alternate dark (`mk-dark`) and light (`#eef3f5` / white) sections so the page has rhythm.

**Icons**
- `lucide-react` only. **No emoji anywhere.** Icons sit inside a keycap (`mk-key-brand w-9 h-9 rounded-md`) or tinted tile (`style={{ background: accent + '1a', color: accent }}`), `strokeWidth={2.25}`, `aria-hidden`.

**Motion**
- Prefer CSS scroll timelines (`mk-reveal`, `mk-parallax`) over JS. They no-op in unsupporting browsers (Firefox) — content must still look right static.
- Every animation lives under `@media (prefers-reduced-motion: no-preference)`. JS-driven loops must read reduced motion via `useSyncExternalStore` (see `TerminalMockup`) and show the finished state instead.
- Show the product doing its job (keys tapped → ticket lines → total counts up → "APPROVED" → OR slip prints). Avoid generic floating blobs, bouncing icons, gradient text.
- Carousels: autoplay driven by a CSS progress bar's `onAnimationEnd`; pause on hover/focus; arrows, swipe, keyboard arrows; `aria-roledescription="carousel"`/`"slide"`.

**Photos**
- Stock photos live in `public/images/marketing/` as WebP (≤ ~200 KB, width 1000–2000). Record every one in `public/images/marketing/CREDITS.md` (photographer + source URL).
- Only free-license sources (Unsplash License — **not** Unsplash+). unsplash.com blocks curl; get the `images.unsplash.com/photo-…` URL via WebFetch of the photo page, then download from the CDN.
- Prefer Philippine / real-counter imagery (sari-sari, Manila streets, cafés, convenience stores) over generic office stock.
- Backgrounds: `<img>` absolutely positioned, `object-cover`, `opacity-25`–`45`, with a navy gradient overlay on top so text stays readable. Use plain `<img>` (repo avoids `next/image` hydration issues) with an `eslint-disable-next-line @next/next/no-img-element` comment.

**Copy (avoid the "obviously AI" look)**
- No "Transform your business", "Streamline your operations", "Everything you need", "Ready to…?", unearned stats ("~70% less busywork"), or star ratings.
- Be specific and true to the product: name the real feature, the real schedule (automation times come from `vercel.json`, shown in Manila time), the real receipt fields. Check `components/marketing/FeaturesGrid.tsx` and `lib/` before claiming a capability.
- Every user-facing string goes through the dictionary (`app/[lang]/dictionaries/{en,es}.json`, `home` namespace for marketing) with an English fallback: `d?.key || 'English text'`. Add both en and es.
- Vary layouts: a featured item + supporting items beats three identical cards.

## Workflow for a new page

1. Read `components/marketing/MarketingPage.tsx` and the 1–2 sections closest to what you need.
2. Wrap the page in `mk-root`; pick section order and alternate dark/light.
3. Build sections from `SectionHeader` + `mk-*` surfaces; extract anything reusable into `components/marketing/` (or a shared `components/ui-gloss/` if it is used outside marketing).
4. Add copy to both dictionaries.
5. Run `npx eslint <files>` and `npx tsc --noEmit -p .` (filter output to your files).
6. Look at it: screenshot desktop (1440) and mobile (≥500 — headless Chrome/Edge won't go narrower) with headless Edge, and for animations capture real-time frames over CDP (`--remote-debugging-port`); `--virtual-time-budget` screenshots mis-render CSS animations.

## Gotchas

- `globals.css` button rule (`min-height: 44px; border-radius: 0`) is unlayered, so Tailwind utilities can't override it — that's what `mk-root` fixes. Outside `mk-root`, rounded/small buttons silently won't apply.
- The dev server sometimes misses edits to `app/globals.css` made by scripts; if new `mk-*` rules don't show up, make a manual edit to the file or restart `pnpm dev`. Verify by grepping the served CSS chunk.
- `public/sw.js` caches images cache-first — hard-reload when swapping a photo with the same filename (or rename it).
- Don't name Python helper scripts after stdlib modules (`copy.py`, `json.py`) in the scratchpad — PIL imports break.
