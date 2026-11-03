# Database cost & performance

MongoDB Atlas (Flex/Serverless) bills per document and index key read and written. These are the mechanisms that keep the count down. Please keep them in mind when adding routes, models or cron jobs.

## In-process cache (`lib/cache.ts`)

A small TTL map per server instance. Each instance has its own copy, so entries live at most 60s, and writes invalidate them through Mongoose model hooks on the instance that handled the write.

| What | Key | TTL | Invalidated by |
|---|---|---|---|
| User active flag and tenant (`getCurrentUser`) | `user:auth:<id>` | 60s | `models/User.ts` hooks |
| Tenant by slug or host, slug→id, active flag and role overrides | `tenant:*` | 60s | `models/Tenant.ts` hooks (the grand-total counters are ignored) |
| "Tenant has storefront integrations" | `tenant:integrations:<id>` | 60s | `models/TenantEcommerceIntegration.ts` hooks |
| Subscription status (feature and limit checks) | `sub:status:<tenantId>` | 60s | `models/Subscription.ts` / `SubscriptionPlan.ts` hooks (usage-counter updates are ignored) |
| Active tax rules | `tax:rules:<tenantId>` | 60s | `models/TaxRule.ts` hooks |

More cached values:
- **Tenant settings** (`getTenantSettingsById`, `tenant:settings:<id>`): read on every checkout.
- **Legal-discount seeding flag** (`tenant:legaldisc:<id>`): the upserts run at most once an hour.
- **CRM order stats** (`crm:orderstats:<tenantId>`): 5 min. There's no invalidation; segments can be up to 5 minutes stale.
- **Public platform stats:** 10 min.

**Client settings.** The `[lang]` layout passes the cached tenant settings to `TenantSettingsProvider` as `initialSettings`, so pages don't fetch `GET /api/tenants/[slug]/settings` on load. Settings hooks read `useTenantSettings()`. After saving, they update the context with `updateSettings` or `applySettings` instead of refetching.

**Settings PUT** writes only keys whose value changed, skips the write entirely when nothing changed, and its audit entry records only the changed keys.

Token revocation (`lib/token-blacklist.ts`) also caches "not revoked" results for 60s. A logout or password change applies immediately on the instance that handled it, and within 60s on other instances.

`getCurrentUser` is memoized per request, so calling `requireAuth`, then `getTenantIdFromRequest`, then `createAuditLog` in one handler costs one auth lookup.

Cached objects are shared, so treat them as read-only. `__tests__/setup.ts` clears the cache after each test.

## Indexes

Production connections run with `autoIndex: false` (`lib/mongodb.ts`). Index definitions live in the schemas, and you build them at deploy time:

```bash
pnpm db:sync-indexes                 # dry run: lists indexes to create / drop
pnpm db:sync-indexes --apply         # syncs; DROPS indexes not declared in a schema
pnpm db:sync-indexes --apply --only=Transaction,Product
```

Before running `--apply` against production:
- Review the dry run.
- Check `db.<coll>.aggregate([{ $indexStats: {} }])` for any index that would be dropped.

Rules for new indexes:
- Compound indexes start with `tenantId`.
- Don't add a single-field index that an existing compound index already covers.
- Use `partialFilterExpression: { field: { $type: 'string' } }` rather than `sparse` on compound unique indexes. `tenantId` is always present, so `sparse` has no effect.

## Retention

- **AuditLog:** there is no TTL. `lib/automations/audit-log-cleanup.ts` runs daily and moves logs older than 90 days into `ArchivedAuditLog` using `$merge`. `/api/audit-logs/export` reads both collections.
- **TTL indexes:**
  - `PosSession`: 1h idle, on `updatedAt`
  - `OfflineTransaction`: 30 days after sync
  - `SavedCart`: 90 days after soft delete
  - `FeatureFlagOverride`: at `expiresAt`
  - `CustomerOTP`
  - `RevokedToken`

## Hot paths

- **Checkout** (`POST /api/transactions`):
  - Stock is validated from the batch-loaded products (`computeProductStock`).
  - Each line is one conditional `$inc` (`updateStock` with a `product` snapshot).
  - Stock movements are written in one `insertMany` and carry the pre-generated transaction `_id`.
  - The monthly transaction count is a `$inc` counter on the subscription (`SubscriptionService.recordTransaction`).
- **Bulk stock paths** (bulk restock, bulk stock update, refund, prescription dispense, channel order import, Shopify refund webhook): products are read once with `STOCK_SNAPSHOT_FIELDS` and passed to `updateStock` as `product`. Movements are collected through `movements` and written once with `insertStockMovements`.
- **E-commerce catalog sync and inventory push:** one batched query per collection plus `bulkWrite`, not per variant or product.
- **List counts:** `{tenantId, isActive, createdAt}` on Transaction and `{tenantId, isActive, pinned, createdAt}` on Product let list `countDocuments` run on index keys only.
- **Polling:**
  - The stock SSE stream polls every 30s and closes while the tab is hidden.
  - `LowStockAlerts` falls back to every 5 min (SSE triggers refreshes).
  - The customer display polls every 2s.
  - Subscription status refreshes every 30 min.
  - `/api/auth/me` runs on mount, on focus (at most once a minute), and on navigation only while signed out.

## Cron (`vercel.json`)

Only `vercel.json` schedules jobs; `lib/cron.ts` is never initialized. If you self-host with `lib/cron.ts`, its intervals don't match the time windows below. For example, suspicious-activity would need `windowMinutes: 15`.

Cron automations load tenants with `getActiveTenants(fields)` (`lib/tenant-active-query.ts`). It filters on `isActive` and projects only the named fields. Before this change, jobs filtered on a non-existent `status` field and never ran.

**Scheduled:**
- **Hourly:**
  - booking reminders, confirmations and no-shows
  - break detection
  - suspicious activity (60-minute window)
  - cash-drawer auto-close (22:00 in each tenant's timezone)
  - cash-count reminders
- **Every 2h:** auto clock-out (sessions up to 48h old)
- **Every 6h:** discount management
- **Every 12h:** abandoned carts
- **Daily:**
  - transaction receipts (24h window)
  - attendance violations
  - sales report delivery
  - audit-log archiving
  - subscription billing
- **Weekly:** data archiving

**Not scheduled:**
- `backups/create`: Atlas backups cover this; manual backups from super-admin still work.
- `pricing/dynamic` and `sync/multi-branch`.
- `sessions/expire`: read-only, so running it changes nothing.
- The inventory & analytics jobs: low-stock alerts, purchase orders, predictive stock, product performance, sales trends, customer lifetime value, stock transfers.
- `sync/offline` and recurring bookings: they don't run because nothing creates their input data.

Jobs that send notifications send each item once, either through a flag (e.g. `reminderSent`) or a time window that matches the job's schedule. If you change a schedule, change the job's window option to match.
