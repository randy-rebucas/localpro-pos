# 10. Feature Flags

## Overview

Feature flags control which modules are available in your tenant. They work in conjunction with your subscription plan — a feature must be both **enabled in your plan** and **toggled on in settings** to be accessible.

## Available Flags

| Flag | Default | Controls |
|------|---------|----------|
| `enableInventory` | ON | Inventory tracking, stock movements, low stock alerts |
| `enableCategories` | ON | Product category management |
| `enableDiscounts` | OFF | Discount/promo codes module |
| `enableLoyaltyProgram` | OFF | Customer loyalty points |
| `enableCustomerManagement` | OFF | Customer database, **Admin > Customers**, POS customer search/attach, purchase history linkage |
| `enableBookingScheduling` | OFF | Appointment booking and calendar |
| `enableTableManagement` | OFF | Floor/table management for restaurant-style operations (where enabled in UI) |
| `enableOnAccountSales` | OFF | **On account** payment method on POS (requires customer on the sale), **balance due** column, **Record payment** in customer admin |

## How Flags Work

### Two-Layer Check

```
User tries to access Bookings
  ↓
1. Is enableBookingScheduling ON in tenant settings? → No → Hidden
  ↓ Yes
2. Does the subscription plan include enableBookingScheduling? → No → Blocked
  ↓ Yes
3. Access granted
```

Both conditions must be true.

### What Happens When OFF

| State | Effect |
|-------|--------|
| **Flag OFF** | Menu item is hidden, routes return 404 |
| **Plan doesn't include** | Menu shows but access is blocked with upgrade prompt |
| **Both OFF** | Menu hidden |
| **Both ON** | Full access |

## Managing Feature Flags

### Via Settings UI

1. Navigate to **Admin > Feature Flags** or **Settings**
2. Toggle each feature on/off
3. Click **Save**
4. Changes take effect immediately (on next page load)

### Via API

```
PUT /api/tenants/{tenantId}
{
  "settings": {
    "enableDiscounts": true,
    "enableBookingScheduling": true
  }
}
```

## Flag Details

### Inventory (`enableInventory`)

When ON:
- Stock tracking on products
- Stock movement history
- Low stock alerts
- Restock and adjustment features
- Stock transfer between branches

When OFF:
- Products have no stock tracking
- Inventory menu hidden
- Sales don't deduct stock

### Categories (`enableCategories`)

When ON:
- Product categories module available
- Category filter on POS and product pages
- Category-based reports

When OFF:
- All products are uncategorized
- Category management hidden

### Discounts (`enableDiscounts`)

When ON:
- Discount/promo code management
- Apply discount codes at POS
- Discount reports
- Automated discount management

When OFF:
- No discount code support
- Discount button hidden from POS
- Manual discounts still available (Manager+)

### Loyalty Program (`enableLoyaltyProgram`)

When ON:
- Customer points tracking
- Points earning rules
- Points redemption at POS

When OFF:
- No loyalty features

### Customer Management (`enableCustomerManagement`)

When ON:
- Customer database (**Admin > Customers**)
- Create/edit customers (name, contact, tags, notes); list with search, status filter, pagination
- Link customers to transactions from the POS customer panel
- Loyalty and analytics that depend on a customer record (when loyalty is also enabled)

When OFF:
- Customer admin and POS customer attach flows are unavailable (subject to plan checks)
- Transactions proceed without an attached customer

**Pairing with On-account:** `enableOnAccountSales` only makes sense when staff can attach customers (`enableCustomerManagement` ON and plan includes customers). On-account charges post to the customer’s **balance due**; payments are recorded from the customer list. See [Customer Credit](../customer-credit.md), [Tenant Settings Reference](./02-tenant-settings.md), and [User Manual: Customers](../user-manual/08-customers.md).

### On-account sales (`enableOnAccountSales`)

When ON (and customer is on the sale):
- **On account** appears as a payment method on the POS
- Customer **balance due** increases until settled

When OFF:
- No on-account payment method; balances are not increased via checkout

Requires subscription/plan rules that allow the feature, in addition to this tenant toggle.

### Booking & Scheduling (`enableBookingScheduling`)

When ON:
- Booking calendar
- Appointment management
- Staff assignment to bookings
- Booking notifications (confirmation, reminder)
- No-show tracking

When OFF:
- Bookings menu hidden
- No appointment features
- Booking automations disabled

### Table management (`enableTableManagement`)

When ON:
- Floor map / table selection flows used by restaurant POS (where deployed for the tenant)

When OFF:
- Table-centric UI paths are hidden or simplified

Exact UI depends on business type and plan; treat this flag as the master switch for table features.

## Plan-Based Feature Availability

| Feature | Starter | Pro | Business | Enterprise |
|---------|---------|-----|----------|------------|
| Inventory | Yes | Yes | Yes | Yes |
| Categories | Yes | Yes | Yes | Yes |
| Discounts | No | Yes | Yes | Yes |
| Loyalty | No | No | Yes | Yes |
| Customers | No | Yes | Yes | Yes |
| Bookings | No | No | Yes | Yes |
| Reports | Basic | Yes | Yes | Yes |
| Multi-Branch | No | No | Yes | Yes |
| Hardware | No | Yes | Yes | Yes |

If you toggle a flag ON but your plan doesn't include it, users see an upgrade prompt instead of the feature.

## Best Practices

1. **Start minimal** — Enable only what you need to reduce UI complexity
2. **Train before enabling** — Train staff on a feature before turning it on
3. **Test after enabling** — Verify the feature works as expected
4. **Disable unused features** — Keeps the interface clean for staff
