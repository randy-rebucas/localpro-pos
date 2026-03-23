# 5. Tax & BIR Configuration

## Quick Setup for Philippine VAT

1. Navigate to **Settings**
2. Set:
   - **Tax Enabled:** Yes
   - **Tax Rate:** 12
   - **Tax Label:** VAT
   - **TIN:** Your Tax Identification Number
3. Click **Save**

This applies 12% VAT to all taxable products by default.

## Tax Rules

For more complex tax scenarios, use **Settings > Tax Rules** or **Admin > Tax Rules**.

### Default Rule

| Field | Value |
|-------|-------|
| Name | Standard VAT |
| Rate | 12% |
| Label | VAT |
| Applies To | All products |
| Priority | 0 (lowest) |
| Active | Yes |

### Creating a Custom Tax Rule

1. Navigate to **Admin > Tax Rules**
2. Click **Add Tax Rule**
3. Configure:

| Field | Description |
|-------|-------------|
| **Name** | Rule display name (e.g., "Zero-Rated Export") |
| **Rate** | Tax percentage (0-100) |
| **Label** | Label shown on receipts |
| **Applies To** | `all`, `products`, `services`, or `categories` |
| **Category IDs** | Specific categories (if "categories" selected) |
| **Product IDs** | Specific products (if needed) |
| **Region** | Regional applicability (country, state, city, ZIP) |
| **Priority** | Higher priority rules override lower ones |
| **Active** | Enable/disable the rule |

4. Click **Save**

### Rule Priority

When multiple rules apply to a product:
- The rule with the **highest priority number** wins
- Rules with priority 0 are the default fallback
- Example: A "VAT-Exempt" rule with priority 10 overrides "Standard VAT" with priority 0

### Common Tax Rule Configurations

**VAT-Exempt Products:**
```
Name: VAT-Exempt
Rate: 0
Label: VAT-EXEMPT
Applies To: categories
Category IDs: [exempt-category-id]
Priority: 10
```

**Zero-Rated Exports:**
```
Name: Zero-Rated
Rate: 0
Label: ZERO-RATED
Applies To: categories
Category IDs: [export-category-id]
Priority: 10
```

**Service Tax (different rate):**
```
Name: Service VAT
Rate: 12
Label: VAT
Applies To: services
Priority: 5
```

## VAT Computation Method

1POS uses the **VAT-inclusive** pricing method standard in the Philippines:

### Formula

```
VATable Sales = Selling Price / 1.12
VAT Amount   = VATable Sales × 0.12
Total        = VATable Sales + VAT Amount (= Selling Price)
```

### Example

| | Amount |
|---|--------|
| Selling Price (VAT-inclusive) | ₱1,120.00 |
| VATable Sales | ₱1,000.00 |
| VAT (12%) | ₱120.00 |

### Senior/PWD Discount

Per RA 9994 (Senior) and RA 10754 (PWD):

```
VAT-Exclusive Price = Selling Price / 1.12
20% Discount       = VAT-Exclusive Price × 0.20
Amount Due         = VAT-Exclusive Price - Discount
(VAT-Exempt)
```

Example for ₱1,120.00 item:
- VAT-Exclusive: ₱1,000.00
- 20% Discount: ₱200.00
- **Amount Due: ₱800.00** (VAT-Exempt)

## BIR Configuration

### Required Settings

| Setting | Where | Value |
|---------|-------|-------|
| Business Name | Settings > General | Your BIR-registered name |
| TIN | Settings > General | Tax ID Number |
| Address | Settings > General | Registered address |
| Tax Enabled | Settings > General | `true` |
| Tax Rate | Settings > General | `12` |
| Tax Label | Settings > General | `VAT` |

### Receipt Serial Numbers

1POS generates sequential, non-reusable receipt serial numbers:
- Format is configurable
- Atomic counter prevents gaps or duplicates
- Numbers are never reused (even after void/refund)
- Required by BIR for Official Receipts

### Audit Trail

BIR requires complete action logging:
- Automatically enabled for all tenants
- Tracks 14+ action types
- Includes timestamp, user, IP address, and details
- Cannot be disabled or tampered with
- Retained for 10 years (configurable)

### BIR Reports Available

| Report | BIR Form | Access |
|--------|----------|--------|
| Daily Sales Summary | Z-Reading equivalent | Reports > Sales |
| Sales Journal | Transaction register | Reports > Sales Journal |
| Monthly VAT | BIR Form 2550M | Reports > VAT |
| Quarterly VAT | BIR Form 2550Q | Reports > VAT |

## Testing Tax Configuration

After setup:

1. Create a test product with a known price (e.g., ₱112.00)
2. Process a test sale
3. Verify receipt shows:
   - VATable Sales: ₱100.00
   - VAT (12%): ₱12.00
   - Total: ₱112.00
4. Void the test transaction
