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
- `mongosh` (or Compass / Studio 3T) connected to your dev database.

## 2. Seed a test tenant + subscription

Use an existing dev tenant, or create one via the normal super-admin "Create Tenant" flow so it gets a trial `Subscription` automatically. Then convert it to an active paid subscription so the billing job has something to act on:

```js
// mongosh
use localpro_pos // or your dev DB name

const tenant = db.tenants.findOne({ slug: "your-test-tenant" });
const sub = db.subscriptions.findOne({ tenantId: tenant._id });
const plan = db.subscriptionplans.findOne({ _id: sub.planId });

db.subscriptions.updateOne(
  { _id: sub._id },
  {
    $set: {
      status: "active",
      isTrial: false,
      autoRenew: true,
      paymentOverdue: false,
    },
    $unset: {
      gracePeriodEndDate: "",
      lastInvoiceGeneratedAt: "",
      lateFeeAppliedAt: "",
      reactivationFeeAppliedAt: "",
      deactivatedAt: "",
    },
  }
);
```

## 3. Fast-forward the due date to simulate each stage

The whole lifecycle is anchored on `nextBillingDate`. Set it relative to "now"
to jump straight to the stage you want to test, then call the endpoint.

```js
// Helper: set nextBillingDate N days from now (negative = in the future, positive = past due)
function setDueOffset(subscriptionId, daysFromNow) {
  const due = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  db.subscriptions.updateOne({ _id: subscriptionId }, { $set: { nextBillingDate: due } });
}
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

| Stage | mongosh command | Then hit the endpoint | Expect |
|---|---|---|---|
| Invoice generation | `setDueOffset(sub._id, 2)` (due in 2 days, inside the 3-day window) | yes | `details.invoicesGenerated: 1`; new `Invoice` doc with `status: "sent"`; `BillingEvent` type `invoice_generated`; `subscription.lastInvoiceGeneratedAt` set; console email logged |
| Due date passes, unpaid | `setDueOffset(sub._id, 0)` | yes | `details.overdueFlagged: 1`; `subscription.paymentOverdue: true`; `gracePeriodEndDate` = now + 7 days; `BillingEvent` type `payment_overdue`; reminder email logged |
| Reminder window (+7 to +10d) | `setDueOffset(sub._id, -8)` (8 days past due — inside `gracePeriodEndDate` window since grace already ran) | yes | `details.remindersSent: 1`; final-notice email logged; **no status change yet** |
| Deactivation (+10d) | `setDueOffset(sub._id, -10)` | yes | `details.accountsDeactivated: 1`; `subscription.status: "suspended"`, `deactivatedAt` set; **`tenant.isActive: false`**; `BillingEvent` type `account_deactivated`; deactivation email logged |
| Late fee (+15d) | `setDueOffset(sub._id, -15)` | yes | `details.lateFeesApplied: 1`; `subscription.outstandingBalance` increases by `10% of plan.price.monthly`; `lateFeeAppliedAt` set; `BillingEvent` type `late_fee_applied` |
| Reactivation fee (+30d) | `setDueOffset(sub._id, -30)` | yes | `details.reactivationFeesApplied: 1`; `subscription.outstandingBalance` increases by `plan.reactivationFee`; `reactivationFeeAppliedAt` set; `BillingEvent` type `reactivation_fee_applied` |

> Because each stage checks its own timestamp guard independently of the
> others, you can jump straight to `-30` days and run the endpoint **once**
> to see steps 2, 4, 5, and 6 all fire in a single response (invoice
> generation from step 1 won't fire since the due date is in the past, not
> within the upcoming 3-day window).

### Verify each stage

```js
db.subscriptions.findOne({ _id: sub._id });
db.billingevents.find({ subscriptionId: sub._id }).sort({ createdAt: 1 });
db.tenants.findOne({ _id: tenant._id }, { isActive: 1 });
db.invoices.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(1);
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

```js
db.subscriptions.updateOne(
  { _id: sub._id },
  {
    $set: {
      status: "active",
      paymentOverdue: false,
      outstandingBalance: 0,
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    $unset: {
      gracePeriodEndDate: "",
      lastInvoiceGeneratedAt: "",
      lateFeeAppliedAt: "",
      reactivationFeeAppliedAt: "",
      deactivatedAt: "",
    },
  }
);
db.tenants.updateOne({ _id: tenant._id }, { $set: { isActive: true } });
db.billingevents.deleteMany({ subscriptionId: sub._id });
```

## Production cron

In production this all runs automatically once a day at 2 AM UTC via the
`vercel.json` cron entry (or `lib/cron.ts` for self-hosted deployments) — no
manual endpoint calls needed. This guide is only for pre-deploy verification.
