# 1POS brand

## Logo

The mark is the **"1" key on a till**: a teal keycap with a split gloss, a raised lip, and a green status light.
In the lockup the key stands in for the "1", so the logo reads **[1]pos**.

| File | Use |
| --- | --- |
| `public/brand/1pos-mark.svg` | Mark, full colour. Favicon (SVG), app chrome, avatars. |
| `public/brand/1pos-mark-mono.svg` | One-colour mark (navy, with the 1 and status light knocked out). Thermal receipts, stamps, embroidery. Recolour the `fill` as needed. |
| `public/brand/1pos-logo.svg` | Lockup with navy wordmark, for light backgrounds. Wordmark is outlined Geist Black, so no font is needed. |
| `public/brand/1pos-logo-white.svg` | Lockup with white wordmark, for navy/photo backgrounds. |
| `public/brand/og-image.png` | 1200×630 social card (Open Graph / Twitter). |
| `public/icon-192x192.png`, `public/icon-512x512.png` | PWA icons (transparent). |
| `public/icon-maskable-512x512.png` | PWA maskable icon: key on a full-bleed navy tile, inside the 80% safe zone. |
| `public/apple-touch-icon.png` | 180×180 iOS home-screen icon (same tile). |
| `app/favicon.ico` | 16/32/48 fallback favicon. |

In React, use `components/BrandLogo.tsx`, not an `<img>`:

- `<BrandLogo />` — mark + "pos". Text inherits `color`, so set `text-white` on dark surfaces. Size the mark with `markClassName` (default `h-8 w-8`).
- `<BrandMark className="h-4 w-4" />` — mark only. Pass `title` when it stands alone and needs an accessible name.

**Rules**
- Minimum size 16 px for the mark. Below 24 px, drop the wordmark and use the mark alone.
- Clear space around the lockup: at least the width of the status light × 2 (about 10% of the mark height).
- Don't recolour the full-colour mark, rotate it, add effects, or put the wordmark before the key. On busy photos, put the lockup on a navy panel.
- Writing the name in text: **1POS** (metadata, legal, emails, prose). The lowercase "pos" exists only in the logo lockup.
- Tenant (store) logos replace the 1POS mark inside a tenant's own storefront and receipts; "Powered by 1POS" uses the mono mark.

## Colour

| Token | Hex | Role |
| --- | --- | --- |
| Teal (brand) | `#35979c` | Primary, `--primary`, `theme_color`, CTA keycaps |
| Teal light / dark | `#4cb0b5` / `#2c8489` | Keycap gradient top / bottom |
| Teal lip | `#1b5a5e` | Keycap edge, pressed states |
| LCD green | `#8dffb8` | Status light, register readouts (`mk-lcd`) |
| Navy | `#0a1620` / `#10222f` | Dark sections, PWA background |
| Light section | `#eef3f5` | Light section background |

## Type

- **Geist Black (900)**, tracking −0.04em: wordmark and big headlines.
- **Geist** 400–700: UI and body.
- **Geist Mono**: numbers, OR numbers, totals, times (always `tabular-nums`).

## Regenerating assets

The SVG files and React component share one set of paths. If you change the mark, update `BrandLogo.tsx` and every
`public/brand/*.svg` together, re-render the PNGs from `1pos-mark.svg` (512 px master, downscaled), and bump
`CACHE_VERSION` in `public/sw.js` so cached icons refresh.
