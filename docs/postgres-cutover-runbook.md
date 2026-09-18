# PostgreSQL Cutover Runbook

Status as of 2026-09-18: schema deployed, full ETL run complete (8 tenants, 2,402 products,
4,671 transactions, 9,236 transaction items, 4,662 payments, 9,359 stock movements, 6,865+
audit logs — see migration chat log for the full reconciliation and the handful of
pre-existing data-quality issues found/resolved). Mongo is untouched and still the live
source of truth; production has not been switched over yet.

**Hosting**: the app runs on **Vercel**; **Render** hosts Postgres only (no app service
there). All env-var and deploy actions below happen in the Vercel dashboard.

## Before the window

- [x] `package.json`'s `build` script now runs `prisma migrate deploy && next build`,
      so Vercel applies pending migrations automatically on every deploy (Vercel has no
      separate pre-deploy-command concept like Render, so this is the standard pattern).
      This requires `DATABASE_URL` to be set for the **Build** environment in Vercel
      (Project Settings → Environment Variables — make sure it's not scoped to
      "Runtime only"), and requires Vercel's build servers to be able to reach the Render
      Postgres instance over the public internet (should be fine unless Render's DB has
      an IP allowlist configured).
- [ ] Have the new `DATABASE_URL` ready, with a conservative pool size appended, e.g.:
      `postgresql://.../one_pos?connection_limit=5&pool_timeout=20`
      (tune `connection_limit` to your Render Postgres plan's `max_connections`)
- [ ] Confirm how you'll pause traffic — Vercel doesn't have a built-in maintenance-mode
      toggle; options: a maintenance-mode middleware/page you deploy temporarily, or
      accept a short window of failed writes while you swap env vars + redeploy.

## During the window

1. **Freeze Mongo writes** — put the app in maintenance mode (or accept a brief window)
   so nothing writes to MongoDB for the rest of this process.
2. **Final incremental sync** — tell Claude to run:
   `npx tsx scripts/migrate-to-postgres.ts` (with `MONGODB_URI` + `DATABASE_URL` set)
   This is safe to re-run (idempotent via `skipDuplicates`) and will pick up any new
   records created since the last sync. Note: it only catches *new* documents, not edits
   to already-migrated ones — this is exactly why writes must be frozen first.
3. **Switch the Vercel env var**: in the Vercel dashboard, set `DATABASE_URL` to the
   production Postgres connection string (with the pool params above), for both
   Production and Preview/Build environments as needed. `MONGODB_URI` can stay configured
   for now (nothing in the live app reads it anymore — confirmed zero `app/api/**` routes
   and no shared `lib/` business logic still depend on Mongoose) but isn't required after
   cutover.
4. **Redeploy** on Vercel so the build picks up the new `DATABASE_URL` and runs
   `prisma migrate deploy` as part of the build step.
5. **Verify**:
   - `GET /api/health` returns `{"status":"healthy","database":"connected"}`
   - Log in as a real user
   - Create a test sale (POS transaction) and confirm stock decrements
   - Check a booking, an invoice, and the super-admin dashboard load correctly
6. **Un-freeze** — resume normal traffic.

## Rollback

If something's wrong post-cutover: revert Render's `DATABASE_URL` back to unset /
point the app's DB layer back at Mongo is NOT a quick toggle anymore (the app code now
runs on Prisma, not Mongoose) — the real rollback is **redeploy the previous release**
(pre-migration commit) with the original `MONGODB_URI`-only config. Keep that previous
deploy/commit identified and ready before starting the window.

## After cutover is confirmed stable

- [ ] Remove `models/`, `lib/mongodb.ts`, `lib/mongo-session.ts`, `lib/transaction-indexes.ts`
- [ ] Remove `mongoose` from `package.json`
- [ ] Replace remaining `@/models/*` type-only imports (`ITenantSettings`, `IProduct`, etc.)
      with Prisma-generated types
- [ ] Update `CLAUDE.md`'s Database/Architecture section to describe Postgres/Prisma
- [ ] Decommission the MongoDB instance once you're confident no rollback will be needed
