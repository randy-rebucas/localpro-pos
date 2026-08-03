# Subscription Billing Lifecycle — Simulation Guide

How to manually simulate every stage of the subscription billing automation
(`lib/automations/subscription-billing.ts`) without waiting for real dates to
pass. Intended for developers/QA verifying the workflow end-to-end.

## The lifecycle being tested

| Offset from `nextBillingDate` (due date) | Action | Where it happens |
|---|---|---|
| `-3 days` | Invoice auto-generated, email sent | Step 1 |
| `0 days` | If unpaid, `paymentOverdue = true`, 7-day grace period starts | Step 2 |
| `+7 to +10 days` | Reminder to pay invoice / contact support | Step 3 |
| `+10 days` | Subscription suspended, `Tenant.isActive = false` (full lockout) | Step 4 |
| `+15 days` | 10% late charge added to `outstandingBalance` | Step 5 |
| `+30 days` | Flat `plan.reactivationFee` added to `outstandingBalance` | Step 6 |

Every step is idempotent (guarded by a timestamp field), so re-running the
automation on the same data is safe and won't double-apply anything.

Steps 2-6 also send an internal ops alert to `admin@localpro.asia` (override
with the `BILLING_ADMIN_EMAIL` env var) each time they fire, separate from
the tenant-facing email — watch for a second "📧 Email notification"
console-mode log addressed to that inbox alongside the tenant one.

---

## 1. Prerequisites

- `CRON_SECRET` set in your `.env.local` (required to call the endpoint outside dev, and recommended even in dev so the auth path is exercised).
- A running dev server: `npm run dev`.
- `psql` (or another Postgres client) connected via `DATABASE_URL` to your dev database.

## 2. Seed a test tenant + subscription

Use an existing dev tenant, or create one via the normal super-admin "Create Tenant" flow so it gets a trial `Subscription` automatically. Then convert it to an active paid subscription so the billing job has something to act on:

```sql
-- psql
\c localpro_pos -- or your dev DB name

SELECT id, tenant_id, plan_id FROM subscriptions s
  JOIN tenants t ON t.id = s.tenant_id
  WHERE t.slug = 'your-test-tenant';
-- note the subscription id as :sub_id below

UPDATE subscriptions
SET status = 'active',
    is_trial = false,
    auto_renew = true,
    payment_overdue = false,
    grace_period_end_date = NULL,
    last_invoice_generated_at = NULL,
    late_fee_applied_at = NULL,
    reactivation_fee_applied_at = NULL,
    deactivated_at = NULL
WHERE id = :'sub_id';
```

## 3. Fast-forward the due date to simulate each stage

The whole lifecycle is anchored on `nextBillingDate` (column `next_billing_date`).
Set it relative to "now" to jump straight to the stage you want to test, then
call the endpoint.

```sql
-- Set next_billing_date N days from now (negative = in the future, positive = past due)
-- e.g. 2 days from now:
UPDATE subscriptions SET next_billing_date = NOW() + INTERVAL '2 days' WHERE id = :'sub_id';
-- e.g. 10 days past due:
UPDATE subscriptions SET next_billing_date = NOW() - INTERVAL '10 days' WHERE id = :'sub_id';
```

Call the automation endpoint after each update:

```bash
# Console-mode email logging works out of the box in dev (no EMAIL_PROVIDER needed) —
# watch your `npm run dev` terminal for "📧 Email notification (console mode)" logs.

curl "http://localhost:3000/api/automations/subscriptions/billing?secret=YOUR_CRON_SECRET&tenantId=<tenantId>"
```

Scope with `tenantId` while testing so you don't touch other dev data. Drop
it to run against every tenant.

### Stage-by-stage script

| Stage | next_billing_date offset | Then hit the endpoint | Expect |
|---|---|---|---|
| Invoice generation | `+2 days` (due in 2 days, inside the 3-day window) | yes | `details.invoicesGenerated: 1`; new `Invoice` row with `status: "sent"`; `BillingEvent` type `invoice_generated`; `subscription.lastInvoiceGeneratedAt` set; console email logged |
| Due date passes, unpaid | `0 days` (now) | yes | `details.overdueFlagged: 1`; `subscription.paymentOverdue: true`; `gracePeriodEndDate` = now + 7 days; `BillingEvent` type `payment_overdue`; reminder email logged |
| Reminder window (+7 to +10d) | `-8 days` (8 days past due — inside `gracePeriodEndDate` window since grace already ran) | yes | `details.remindersSent: 1`; final-notice email logged; **no status change yet** |
| Deactivation (+10d) | `-10 days` | yes | `details.accountsDeactivated: 1`; `subscription.status: "suspended"`, `deactivatedAt` set; **`tenant.isActive: false`**; `BillingEvent` type `account_deactivated`; deactivation email logged |
| Late fee (+15d) | `-15 days` | yes | `details.lateFeesApplied: 1`; `subscription.outstandingBalance` increases by `10% of plan.priceMonthly`; `lateFeeAppliedAt` set; `BillingEvent` type `late_fee_applied` |
| Reactivation fee (+30d) | `-30 days` | yes | `details.reactivationFeesApplied: 1`; `subscription.outstandingBalance` increases by `plan.reactivationFee`; `reactivationFeeAppliedAt` set; `BillingEvent` type `reactivation_fee_applied` |

> Because each stage checks its own timestamp guard independently of the
> others, you can jump straight to `-30` days and run the endpoint **once**
> to see steps 2, 4, 5, and 6 all fire in a single response (invoice
> generation from step 1 won't fire since the due date is in the past, not
> within the upcoming 3-day window).

### Verify each stage

```sql
SELECT * FROM subscriptions WHERE id = :'sub_id';
SELECT * FROM billing_events WHERE subscription_id = :'sub_id' ORDER BY created_at ASC;
SELECT is_active FROM tenants WHERE id = :'tenant_id';
SELECT * FROM invoices WHERE tenant_id = :'tenant_id' ORDER BY created_at DESC LIMIT 1;
```

## 4. Confirm the lockout actually blocks access

1. Log in as a user belonging to the deactivated tenant **before** running
   the +10-day step, so you have a valid `auth-token` cookie/JWT.
2. Run the deactivation step above.
3. Retry any authenticated API call (e.g. `GET /api/products`) with that
   same token — it should now fail with `401 Unauthorized` (enforced in
   `lib/auth.ts`'s `getCurrentUser`, which checks `Tenant.isActive` on every
   request, not just at login).
4. Attempting a fresh login (`POST /api/auth/login`) should return
   `404 Tenant not found or inactive` (existing check in
   `app/api/auth/login/route.ts`).

## 5. Simulate paying off the balance and reactivating

Recording a payment that fully clears `outstandingBalance` now reactivates
automatically in the same call — no separate `activate` step needed.

```bash
# Record payment covering the outstanding balance (super-admin only, needs a super_admin auth token)
curl -X PUT "http://localhost:3000/api/super-admin/subscriptions/your-test-tenant" \
  -H "Authorization: Bearer <super-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"record-payment","amount": 1050, "notes":"Test payoff"}'
```

Expect in the same response: `subscription.outstandingBalance: 0`,
`status: "active"`, `nextBillingDate` advanced by one billing cycle
(+1 month or +1 year, from `billingCycle`), `paymentOverdue: false`,
`gracePeriodEndDate`/`deactivatedAt`/fee timestamps cleared,
`tenant.isActive: true`, and a `BillingEvent` of type `account_reactivated`
(only created if the account had actually been deactivated/suspended —
a payoff on a merely-overdue-but-not-yet-deactivated subscription just
clears the overdue state and advances the date, with no extra event).

**Partial payment:** if `amount` is less than the outstanding balance, none
of the above reactivation/date-advance logic runs — only the payment itself
is recorded and the balance is reduced. Repeat calls with additional amounts
until the balance reaches 0 to trigger reactivation.

The `activate` action is still available as a manual fallback/override
(e.g. to reactivate without going through `record-payment`, such as a
courtesy waiver) — it still rejects with `400` if `outstandingBalance > 0`.

## 6. Reset between test runs

```sql
UPDATE subscriptions
SET status = 'active',
    payment_overdue = false,
    outstanding_balance = 0,
    next_billing_date = NOW() + INTERVAL '30 days',
    grace_period_end_date = NULL,
    last_invoice_generated_at = NULL,
    late_fee_applied_at = NULL,
    reactivation_fee_applied_at = NULL,
    deactivated_at = NULL
WHERE id = :'sub_id';

UPDATE tenants SET is_active = true WHERE id = :'tenant_id';
DELETE FROM billing_events WHERE subscription_id = :'sub_id';
```

## Production cron

In production this all runs automatically once a day at 2 AM UTC via the
`vercel.json` cron entry (or `lib/cron.ts` for self-hosted deployments) — no
manual endpoint calls needed. This guide is only for pre-deploy verification.
