# Database cost & performance

How Atlas charges depends on the cluster tier, so check the tier before treating read counts as cost: Flex bills in ops/sec bands, and dedicated tiers bill mainly for cluster size. Atlas Serverless, which billed per read, has been retired. These mechanisms keep database load down. Please keep them in mind when adding routes, models or cron jobs.

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

**Client settings.** The `[lang]` layout passes the cached tenant settings to `TenantSettingsProvider` as `initialSettings`, so pages don't fetch `GET /api/tenants/[slug]/settings` on load. Settings hooks read `useTenantSettings()`. After saving, they update the context with `updateSettings` or `applySettings` instead of refetching. The seed and the public GET have secrets stripped (`birEsalesPushUrl`, `multiCurrency.exchangeRateApiKey`; see `lib/tenant-settings-access.ts`). The full copy is returned only to this tenant's `settings.manage` holders. So the main settings page fetches its own fresh copy on load, and saves send only the changed keys.

**Outbound requests to tenant URLs.** Server-side fetches to tenant-supplied URLs (the WooCommerce store, the BIR eSales push endpoint) go through `safeFetch` in `lib/net/outbound-url.ts`. It blocks private, loopback, link-local and metadata addresses, requires https in production, and re-checks every redirect. To test against a WooCommerce running on localhost in development, set `OUTBOUND_ALLOW_PRIVATE=true`. That flag is ignored in production.

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

- **AuditLog:** live logs expire after 90 days through a TTL index. `lib/automations/audit-log-cleanup.ts` runs daily and moves logs older than 89 days into `ArchivedAuditLog` using `$merge`, so the TTL only removes a log the job failed to archive. It must stay daily, and within a day of the TTL. `/api/audit-logs/export` reads both collections.
- **TTL indexes:**
  - `PosSession`: 1h idle, on `updatedAt`
  - `OfflineTransaction`: 30 days after sync
  - `SavedCart`: 90 days after soft delete
  - `FeatureFlagOverride`: at `expiresAt`
  - `CustomerOTP`
  - `RevokedToken`
  - `Attendance`: 5 years after clock-in
  - `Booking`: 5 years after the booking ends
  - `ArchivedAuditLog`: 10 years
  - `SuperAdminAction`: 10 years
- **Counter:** receipt counters must never expire, because that would reuse receipt numbers. Production has an `expiresAt_1` TTL on this collection, but no counter has that field, so it deletes nothing. It isn't declared in the schema and can be dropped.

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

## Query limits

`lib/query-utils.ts` holds the shared helpers:
- `escapeRegex`: use it on any user input that goes into a `$regex`.
- `REPORT_MAX_TIME_MS` (30s): report and dashboard queries. BIR exports get a time limit and a projection but no row cap, because they must be complete.
- `INTERACTIVE_MAX_TIME_MS` (3s): non-critical POS reads such as upsell suggestions.

Super-admin top tenants and platform transaction stats are cached for 10 minutes per instance (`platform:top-tenants`, `platform:tx-stats:<range>`), because they scan all transactions.

Upsell co-occurrence scores are cached for 5 minutes per tenant and cart (`upsell:<tenantId>:<productIds>`). Stock is still checked live.

**Aggregates aren't cast.** Mongoose casts `find` filters but not `aggregate` pipelines, and `requireTenantAccess` returns `tenantId` as a string. An uncast id in `$match` returns no rows and no error, so wrap ids in `new mongoose.Types.ObjectId()`.

Bundle analytics reads `items[].product`, where checkout stores a bundle line's id. `bundleId` isn't in the transaction item schema.

Lists that clients load in full (`/api/bookings`, `/api/bookings/customer/[customerId]`, `/api/expenses`) stop at `LIST_SAFETY_CAP` rows and set `truncated: true`. They keep the newest rows, so upcoming bookings are never dropped.

## Refunds

A sale can be refunded in parts. Refunded quantities live on each line (`items[].refundedQuantity`), and `lib/refund-plan.ts` works out what's left. `refundCount` guards the atomic claim, so concurrent refunds can't both spend the same quantity.

- The sale stays `completed` until everything is refunded, because reports filter on that status.
- The original Payment becomes `partially_refunded`, with a running `refundedAmount`, until it's fully covered.
- Each refund pays the lines' share of the sale total, so discounts, tax and loyalty redemptions come back in proportion. The last refund pays exactly what's left, so a sale's refunds always add up to its total. Lines don't record tax exemption, so in a basket mixing exempt and taxable items the split between partial refunds is approximate, though the overall total is exact.
- A sale with any refund against it can't be voided.
- Refund records store their share of discount, tax, exempt and zero-rated amounts. The sales journal keeps each sale as recorded and shows each refund as a negative line on the refund's date, so totals net out without changing a past period. Voids stay listed at zero. Refunds made before these fields existed show their total with no tax split.
- Refund receipts are `REF-<receipt>`, then `REF-<receipt>-2` and so on. `isRefundRecord` in `lib/refund-plan.ts` is the one rule for telling a refund record from a refunded sale, which share the `refunded` status.
- Cash drawers count a sale even if it's refunded later, and take each refund from the drawer of the user who processed it, in the session it was paid. A cash refund belongs to the tenant's open drawer, whoever processes it; `Payment.processedBy` and the audit log record who did. With no drawer open it comes out of none.
- X and Z readings keep sale figures as sold, so gross sales reconcile with the Grand Total, which never goes down. Refunds paid that day are reported beside them with net sales. Stored Z readings are never recalculated, so ones from before this show no refunds.
- The CAS report shows a refund as a credit on its own date.
- Sales analytics (`lib/analytics.ts`, `/api/transactions/stats`) report what was kept, on the sale's date: a fully refunded sale leaves, a partly refunded one counts net. Accounting reports show the refund on its own date instead, so the two can differ for a period.
- Refunding a bundle line returns its component products. Manual lines are refunded by their line id, as the POS sends it.
- A sale partially refunded before this tracking existed returns 409 instead of risking a double payout, because nothing records which items that refund covered.

## Booking ownership

Emails aren't verified, and `/api/auth/register` is public, so an email can't prove whose booking it is. "My bookings" reads `Booking.bookedByUserId` for accounts, and the verified phone number for customers who log in by OTP. `pnpm db:backfill-booking-accounts` links older bookings, only to accounts that existed when the booking was made.

## User email uniqueness

Emails are unique per tenant through `{ tenantId, email }`. Every tenant login path includes the tenant. Tenant signup and super-admin tenant creation still check globally, so a new business can't reuse an existing account's email.

Changing `email_1` from unique to non-unique takes effect when you run `pnpm db:sync-indexes --apply --only=User`. Until then the old global rule stays in force. Review the dry run first.

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
