---
name: 1pos-public-design
description: The 1pos public website design language (thermal receipts, POS hardware, dot-matrix numerals, torn paper, flat square corners). Use this skill whenever building, restyling or polishing any public-facing 1pos page or section, such as /stores, /signup, /privacy, a pricing, about or contact page, landing pages, the marketing header or footer, or home page sections, even if the user only says "make it match the homepage", "use our design", "make this page look good" or "not AI generated". Also used by the super-admin panel (app/super-admin/, kit in components/super-admin/ui.tsx). Do not use it for the tenant app under app/[tenant]/, which has its own styling.
---

# 1pos public design

The look of the public site, first built on the home page. Use it so every public page feels like one product.

The live code is the source of truth. Read these before writing anything, and reuse them rather than rebuilding:

| What | Where |
| --- | --- |
| Colors and font tokens | `app/globals.css` (`@theme inline`) |
| Tear edges, leaders, scanner and sync animations | `app/marketing.css` |
| Page wrapper: fonts, header, footer | `components/marketing/PublicShell.tsx` |
| `Barcode`, `LineTag`, `ReceiptRow`, `Translate` | `components/marketing/primitives.tsx` |
| Examples of other public pages | `app/stores/page.tsx`, `app/signup/page.tsx`, `app/privacy/PrivacyPolicy.tsx` |
| Carousel (Embla) | `components/marketing/Carousel.tsx` |
| Section examples, including parallax | `components/marketing/HomeSections.tsx`, `Hero.tsx`, `Steps.tsx` |
| Language and copy | `hooks/usePublicLang.ts`, `hooks/usePublicCopy.ts` |
| Photos and their licenses | `public/images/home/`, `CREDITS.md` |

## The idea

The site is a point of sale, so it borrows from the counter: receipts, price lists, LED displays, barcodes, scanners and end-of-day readings. A page should feel printed by a till, not assembled from a SaaS template. Before designing a section, ask what it would be at a real counter. Plans become an itemized bill, a contact page a customer copy slip, a changelog a till roll, FAQs numbered line items.

Use the metaphor for structure, not as decoration. One strong idea per section beats receipts everywhere.

## Visual rules

**Color.** Use the tokens, never new hues.

- `paper` (#f4efe4) and `paper-white` (#fdfbf6): light surfaces. Receipts are `paper-white`, and they need a colored or dark surface behind them to stand out.
- `ink` (#10202b): text, primary buttons, footer.
- `brand-navy-deep`, `brand-navy`: dark sections.
- `brand` (#35979c): full-width bands. Put `ink` text on it, because white on teal fails contrast at body sizes.
- `brand-hover`: accent text and icons on light surfaces. `#8fe3d0` and `#7df0d6`: accents and LED glow on dark surfaces.
- `stamp` (#c8402c): rubber stamps only, used rarely.

Alternate surfaces down the page (dark, teal, paper, white) so sections separate by color instead of cards and shadows.

**Type.** Each font has one job:

- `font-display` (Big Shoulders): headings, uppercase, heavy, tight. `h1` and `h2` inside `.mk-root` get this automatically.
- Body (Hanken Grotesk): paragraphs and `h3`.
- `font-receipt` (IBM Plex Mono): labels, specs, prices and anything printed.
- `font-led` (Doto): big numerals only, such as totals, times and stats. It has no ₱ glyph, so set peso amounts in `font-receipt`.

Keep headings short and punchy so the condensed type can run large (`text-5xl sm:text-6xl lg:text-7xl`).

**Shape.** Square corners and flat color. Separate with rules, dashed lines and dotted leaders rather than rounded cards.

**Layout.** Container is `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`, sections are `py-20 lg:py-28`. Prefer left-aligned, asymmetric layouts on the 12-column grid. Open sections with `LineTag` and a number, then the `h2`.

**Icons.** Lucide only, `strokeWidth={1.75}`, `aria-hidden`. No emoji anywhere on public pages.

## What makes it look generic

Avoid these, since they are what the design exists to escape: a centered badge, heading and three cards on repeat; gradient text; glass panels; blurred color orbs; dot-grid backgrounds; purple; rounded cards with soft shadows; hover lift on everything; star ratings; a browser-frame dashboard mockup.

## Motion

Motion should show the POS doing something: paper feeding, a scanner beam, data flowing to the cloud, a stamp landing. Use `motion/react` for scroll-linked effects and the `.mk-*` CSS animations for loops. Keep it to a few moments per page.

Respect reduced motion on every effect: `useReducedMotion()` in React and the existing media query in `marketing.css`, which new keyframes must join. Content must never depend on animation to become visible, so avoid fade-in-on-scroll reveals.

## Photos

Real photos of stores and checkouts sit beside custom illustration. When sourcing new ones:

- Use CC0 or public domain only, so the page needs no credit line. Wikimedia Commons has an API built for scripts, and USDA photos there are strong for checkout scenes. Do not scrape sites that block bots.
- Avoid recognizable faces, since there is no model release. Hands and over-the-shoulder shots work well.
- Check the full-size image, not just the thumbnail. Look for competitor hardware or POS software on screens, store names, logos and agency branding, and crop them out or reject the photo.
- Crop to the subject, then save to `public/images/<page>/` and add it to a `CREDITS.md`. Render with `next/image`, and write meaningful `alt` text in both languages.
- Do not imply endorsement by a government agency when using its photos.

## Copy

Short, plain and said from behind the counter: "Take the money however it comes", not "Unlock seamless payment solutions".

- Only claim what ships. Check `components/FeaturesGrid.tsx` or the code before stating a feature, and do not invent statistics, customers, ratings or awards. Prefer "BIR-ready" to stronger compliance wording.
- Testimonials are real or absent. They live in `lib/marketing-testimonials.ts`, need the customer's permission, and are never written or reworded for them.
- Only Retail and General are offered as business types. Do not mention restaurants, laundry, services or pharmacy.
- Sample data should look clearly fictional: "YOUR STORE NAME", TIN `000-000-000-000`, unbranded goods, a note that it is a sample. Prices are VAT-inclusive, so VAT is total ÷ 1.12 × 0.12, and the figures should add up.
- All text is translated. Use `t('key', 'English')`, add the key to that page's section in `app/[lang]/dictionaries/en.json` and `es.json`, then run the check below. Spanish words run longer, so test headings in both languages.

## Implementation notes

These caused real bugs on the home page:

- Wrap every public page in `PublicShell` and get its copy from `usePublicCopy('section')`. That brings the fonts, `.mk-root`, header and footer, so do not load them again.
- `globals.css` gives every `a` and `button` a 44px minimum height, which pushes text to the top of the box. Add `flex items-center` to text links.
- `.mk-tear-b` and `.mk-tear-t` use a mask, which clips `box-shadow`. Put `drop-shadow` on a parent element.
- Light panels inside dark sections inherit light text. Set `text-ink` on the panel.
- Use `overflow-x: clip`, not `hidden`, on page wrappers, or `sticky` stops working.
- Fixed-width illustrations collide at small sizes, so do the width math. The counter scene only shows from `xl`, with a compact version below it.
- Hide figures that fail to load rather than showing placeholders.
- Never submit `/signup` while testing: the dev server may point at a real database.
- Do not link to `#` or pages that do not exist.

## Before calling it done

1. Run `node .claude/skills/1pos-public-design/scripts/check-copy.mjs <sourceDir> <section>` from the repo root, for example `app/stores stores`. It lists translation keys missing from either dictionary. With no arguments it checks the home page.
2. Run type checks and ESLint on the changed files.
3. Look at the page in a real browser at about 390px, 1024px and 1440px, in English and Spanish, scrolling the whole way. Check for sideways scrolling and console errors, and fix what you see.
4. Reread the copy for any claim you cannot back up.
