# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mixed audience landing on the public marketing homepage: primarily Philippine SMB owners/managers evaluating POS systems and deciding whether to start a free trial, but also multi-branch/multi-location operators specifically assessing whether a POS can run several branches under one account, plus occasional returning tenant staff who arrive here looking for a login link rather than to evaluate.

## Product Purpose

1pos is an enterprise multi-tenant Point-of-Sale system for Philippine businesses. The marketing homepage exists to convert evaluators into a 14-day free trial signup by demonstrating BIR-ready compliance, breadth of capability (23 modules), and multi-branch/multi-tenant operation.

## Positioning

The differentiator versus other POS systems is architectural, not a bolt-on feature: 1pos is built ground-up as multi-tenant, multi-branch software (tenant-slug path routing, subdomain/custom-domain support, per-tenant isolation), rather than a single-store POS retrofitted with a "locations" add-on. This is what makes true multi-branch operation, seven core automated workflows, and centralized oversight across branches possible without per-store silos.

## Operating Context

- Existing tenants log in through tenant-specific paths (`/tenant-slug/lang/...`) or subdomain/custom domain, not through this marketing page's primary flow.
- The homepage is the top-of-funnel entry point; conversion action is starting a 14-day free trial (no credit card required, per existing copy).
- Philippine market context: BIR (Bureau of Internal Revenue) compliance is a named, factual requirement this product satisfies, not generic tax-software boilerplate.

## Capabilities and Constraints

- 23 capability modules (module count sourced from `FEATURE_MODULE_COUNT` in `components/FeaturesGrid.tsx` — copy must stay aligned with that constant, not a hardcoded number).
- Seven core automated workflows (existing copy claim).
- Real-time inventory, multi-branch support, customer management, BIR compliance, reports & analytics, booking & scheduling, offline mode, hardware integration (from existing JSON-LD `featureList`).
- Existing proof-point copy and stats (module count, trial length, pricing) may be reworked/restructured for the redesign, but must remain factually accurate to what the product actually does — no invented testimonials, customer logos, or benchmarks.

## Evidence on Hand

- Existing marketing copy in `components/MarketingPageClient.tsx` and `components/FeaturesGrid.tsx` (current implementation, being redesigned).
- No customer testimonials, logos, or case studies currently present — do not fabricate any during redesign.

## Product Principles

- Compliance and multi-branch architecture are real, verifiable claims — never dilute them into generic SaaS marketing language.
- The homepage must serve two different visitor intents (new evaluator vs. multi-branch operator vs. returning tenant) without forcing a single narrow narrative.
- Conversion (trial signup) is the primary success metric for this surface.

## Accessibility & Inclusion

No product-specific accessibility requirement established beyond standard WCAG AA expectations already used elsewhere in the product (see super-admin DESIGN.md contrast rules).
