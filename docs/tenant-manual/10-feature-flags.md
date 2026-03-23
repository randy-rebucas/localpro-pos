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
| `enableCustomerManagement` | OFF | Customer database and profiles |
| `enableBookingScheduling` | OFF | Appointment booking and calendar |

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
- Customer database
- Customer profiles with purchase history
- Link customers to transactions
- Customer search in POS
- Customer lifetime value tracking

When OFF:
- Transactions are anonymous
- Customer menu hidden
- No customer linking at POS

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
