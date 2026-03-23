# 3. Subscription Plans & Billing

## Plan Tiers

1POS offers four subscription tiers:

| Feature | Starter | Pro | Business | Enterprise |
|---------|---------|-----|----------|------------|
| **Monthly Price** | Lowest | Mid | Higher | Custom |
| **Setup Fee** | None | None | None | Custom |
| **Max Users** | Limited | More | Even more | Unlimited (-1) |
| **Max Branches** | 1 | Limited | More | Unlimited (-1) |
| **Max Products** | Limited | More | Even more | Unlimited (-1) |
| **Max Transactions** | Limited | More | Even more | Unlimited (-1) |
| **Inventory** | Yes | Yes | Yes | Yes |
| **Categories** | Yes | Yes | Yes | Yes |
| **Discounts** | No | Yes | Yes | Yes |
| **Loyalty Program** | No | No | Yes | Yes |
| **Customer Management** | No | Yes | Yes | Yes |
| **Booking/Scheduling** | No | No | Yes | Yes |
| **Reports** | Basic | Yes | Yes | Yes |
| **Multi-Branch** | No | No | Yes | Yes |
| **Hardware Integration** | No | Yes | Yes | Yes |
| **Priority Support** | No | No | No | Yes |
| **Custom Integrations** | No | No | No | Yes |
| **Dedicated Account Mgr** | No | No | No | Yes |

> `-1` means unlimited in the system.

## BIR Compliance by Plan

| BIR Feature | Starter | Pro | Business | Enterprise |
|-------------|---------|-----|----------|------------|
| PTU Assistance | No | No | Yes | Yes |
| Receipt Formatting | No | Yes | Yes | Yes |
| BIR Documentation | No | No | Yes | Yes |
| CAS Reporting | No | No | Yes | Yes |
| Audit Trail System | No | Yes | Yes | Yes |
| Monthly Support | No | No | No | Yes |

## Plan Data Structure

Each plan is stored with these fields:

```typescript
{
  name: "Pro",
  tier: "pro",           // starter | pro | business | enterprise
  description: "Best for growing businesses",
  price: {
    monthly: 1499,       // PHP
    setupFee: 0,
    currency: "PHP"
  },
  features: {
    maxUsers: 10,
    maxBranches: 1,
    maxProducts: 500,
    maxTransactions: 2000,
    enableInventory: true,
    enableCategories: true,
    enableDiscounts: true,
    enableLoyaltyProgram: false,
    enableCustomerManagement: true,
    enableBookingScheduling: false,
    enableReports: true,
    enableMultiBranch: false,
    enableHardwareIntegration: true,
    prioritySupport: false,
    customIntegrations: false,
    dedicatedAccountManager: false
  },
  birCompliance: {
    ptuAssistance: false,
    receiptFormatting: true,
    birDocumentation: false,
    casReporting: false,
    auditTrailSystem: true,
    monthlySupport: false
  },
  isActive: true,
  isCustom: false
}
```

## Subscription Lifecycle

### States

| Status | Description | Access |
|--------|-------------|--------|
| `trial` | Free trial period | Full access |
| `active` | Paid and current | Full access per plan |
| `suspended` | Payment failed | Read-only |
| `cancelled` | User cancelled | Read-only until end date |
| `inactive` | Admin deactivated | No access |

### Billing Cycle

- **Monthly** — Billed on the same day each month
- **Yearly** — Billed annually (discount typically applied)

### Key Dates

| Date | Purpose |
|------|---------|
| `startDate` | When the subscription began |
| `endDate` | When the subscription expires |
| `trialEndDate` | When the trial period ends |
| `nextBillingDate` | Next payment due date |
| `lastBillingDate` | Most recent payment date |

## Usage Tracking

The system tracks usage against plan limits:

| Metric | Tracked Via | Reset |
|--------|-------------|-------|
| `currentUsers` | User creation/deactivation | Never (cumulative) |
| `currentBranches` | Branch creation/deactivation | Never (cumulative) |
| `currentProducts` | Product creation/deactivation | Never (cumulative) |
| `currentTransactions` | Transaction creation | Monthly (on `lastResetDate`) |

### What Happens at Limits

When a limit is reached:
1. **Warning** — Dashboard and status bar show a warning when approaching 80%
2. **Soft Block** — At 100%, the specific action is blocked with an error message
3. **Other Features Continue** — Only the exceeded limit is blocked

Example error: `"Subscription limit exceeded for maxTransactions. Current: 500, Limit: 500. Please upgrade your plan."`

### Transaction Counter Reset

Transaction counts reset monthly:
- Reset occurs on the `lastResetDate` anniversary
- After reset, the counter starts from 0
- Previous month's transactions remain in the database

## Payment Processing

### PayPal Integration

1POS uses PayPal for subscription payments:

1. User clicks **Upgrade** on the Subscription page
2. Redirected to PayPal to authorize payment
3. On success: redirected to `/subscription/payment-success`
4. On failure: redirected to `/subscription/payment-failed`
5. On cancel: redirected to `/subscription/payment-cancel`

### Billing History

Each payment is recorded:

```typescript
{
  date: "2026-03-01",
  amount: 1499,
  currency: "PHP",
  status: "paid",        // paid | failed | pending | refunded
  transactionId: "PAY-xxx",
  invoiceUrl: "https://..."
}
```

### Payment Methods

| Type | Description |
|------|-------------|
| `paypal` | PayPal balance or linked card |
| `card` | Direct card payment (via PayPal) |
| `bank` | Bank transfer |
| `manual` | Manual/offline payment (admin-applied) |

## Managing Plans (Platform Admin)

### Creating a Plan

```
POST /api/subscriptions/plans
```

### Updating a Plan

```
PUT /api/subscriptions/plans/{planId}
```

> **Warning:** Cannot delete a plan that has active subscribers. Migrate them first.

### Custom Enterprise Plans

Enterprise plans can have custom pricing and limits:
- Set `isCustom: true`
- Configure limits per customer agreement
- Set custom pricing
- Assign manually via admin panel

## Upgrading / Downgrading

### Upgrade

- Takes effect immediately
- New features become available instantly
- Usage limits increase to new plan's levels
- Pro-rated billing for the remainder of the current period

### Downgrade

- Takes effect at the end of the current billing period
- Features beyond the new plan's scope become unavailable
- If current usage exceeds new limits, the user must reduce usage before downgrade completes
- Warning shown listing what will be lost
