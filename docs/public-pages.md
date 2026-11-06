# Public pages

Pages that sit outside `/[tenant]/[lang]`. Each path must be listed in `proxy.ts`, or the proxy redirects it to a tenant.

| Path | Source | Notes |
| --- | --- | --- |
| `/` | `components/MarketingPageClient.tsx` | Home page |
| `/stores` | `app/stores/page.tsx` | Store directory. `/login` redirects here. |
| `/signup` | `app/signup/page.tsx` | Creates a real tenant. Do not submit it while testing. |
| `/pricing` | `app/pricing/PriceList.tsx` | Reads live plans from `/api/subscription-plans` |
| `/about` | `app/about/AboutReading.tsx` | Counts come from `FEATURE_MODULE_COUNT` and `lib/marketing-constants.ts` |
| `/contact` | `app/contact/ContactSlip.tsx` | `mailto:` links only, with no form or backend |
| `/privacy` | `app/privacy/PrivacyPolicy.tsx` | Privacy policy |

New public paths also belong in `app/sitemap.ts` and `app/robots.ts`. Copy lives in `app/[lang]/dictionaries/`, one section per page.

## Pricing

No price is hardcoded. To change a price or limit, edit the plan in the super-admin panel and the page follows.

- Plans with `availableToNewTenants: false` are hidden.
- A limit of `-1` shows as Unlimited.
- Branches show as 1 unless `enableMultiBranch` is on, because `app/api/branches/route.ts` refuses a second branch without it.
- A `monthly` price of 0 on a custom or enterprise plan shows as "By quote" and links to `/contact`.
- The yearly line is `monthly × 12 × 0.9`. `YEARLY_RATE` in `PriceList.tsx` must match the charge in `app/api/subscriptions/activate/route.ts`.

## Tenant login

`app/[tenant]/[lang]/login/page.tsx` uses the public design but not `PublicShell`, because a marketing header and footer don't belong on a store's staff login. Its copy is in the `login` section of `app/[tenant]/[lang]/dictionaries/`.
