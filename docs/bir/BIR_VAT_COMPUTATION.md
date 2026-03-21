# LocalPro POS - VAT Computation Logic

## BIR Compliance Documentation | Tax Calculation & Reporting

---

## 1. VAT Configuration

### Tenant-Level Settings
**Source**: `models/Tenant.ts` → `settings`

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `taxEnabled` | boolean | false | Enable/disable tax calculation |
| `taxRate` | number | 0 | Default tax rate (0-100%) |
| `taxLabel` | string | "VAT" | Display label on receipts |

### Tax Rules (Advanced)
**Source**: `models/TaxRule.ts`

Tax rules allow granular, priority-based tax configuration:

```
TaxRule Schema:
{
  tenantId:    ObjectId       → Business owner
  name:        string         → Rule name (e.g., "Standard VAT")
  rate:        number (0-100) → Tax percentage
  label:       string         → Display label ("VAT", "GST")
  appliesTo:   enum           → 'all' | 'products' | 'services' | 'categories'
  categoryIds: ObjectId[]     → Specific categories (if appliesTo = 'categories')
  productIds:  ObjectId[]     → Specific product overrides
  region: {
    country:   string         → Country filter
    state:     string         → State/province filter
    city:      string         → City filter
    zipCodes:  string[]       → ZIP code filter
  }
  priority:    number         → Higher = checked first
  isActive:    boolean        → Enable/disable rule
}
```

---

## 2. Tax Calculation Algorithm

**Source**: `lib/tax-calculation.ts` → `calculateTax()`

### Function Signature
```typescript
calculateTax(
  tenantId: string,
  subtotalAfterDiscount: number,
  items: TransactionItem[],
  tenantSettings: TenantSettings
): Promise<{ taxAmount: number; taxRate: number; taxLabel: string }>
```

### Step-by-Step Logic

```
INPUT:
  - tenantId: Business identifier
  - subtotalAfterDiscount: Amount after discount applied
  - items: Array of transaction items
  - tenantSettings: Fallback tax configuration

PROCESS:

Step 1: Query Tax Rules
  ─────────────────────
  Query: TaxRule.find({ tenantId, isActive: true })
  Sort:  { priority: -1 } (highest priority first)

Step 2: Match Rules (first-match wins)
  ─────────────────────────────────────
  FOR EACH rule (highest priority first):

    IF rule.appliesTo === 'all'
      → MATCH (applies to everything)

    IF rule.appliesTo === 'products'
      → MATCH if any item is a regular product or bundle

    IF rule.appliesTo === 'services'
      → MATCH if any item is a service type

    IF rule.appliesTo === 'categories'
      → MATCH if any item belongs to rule.categoryIds

    Check product-specific overrides:
      → MATCH if any item.productId is in rule.productIds

    ON FIRST MATCH:
      taxRate  = rule.rate
      taxLabel = rule.label
      BREAK (stop checking remaining rules)

Step 3: Fallback (if no rule matched)
  ────────────────────────────────────
  taxRate  = tenantSettings.taxRate  (default: 0)
  taxLabel = tenantSettings.taxLabel (default: "VAT")

Step 4: Calculate Tax Amount
  ──────────────────────────
  taxAmount = (subtotalAfterDiscount × taxRate) / 100
  taxAmount = Math.round(taxAmount * 100) / 100  (round to 2 decimals)

OUTPUT:
  {
    taxAmount: number,  → e.g., 71.07
    taxRate:   number,  → e.g., 12
    taxLabel:  string   → e.g., "VAT"
  }
```

---

## 3. VAT Computation Examples

### Example 1: Standard 12% VAT (Philippines)

```
Configuration:
  taxEnabled = true
  taxRate    = 12
  taxLabel   = "VAT"

Transaction:
  Item 1: Coffee Blend     2 × ₱150.00 = ₱300.00
  Item 2: Croissant        3 ×  ₱85.00 = ₱255.00
  Item 3: Vanilla Latte    1 × ₱180.00 = ₱180.00

  Subtotal:                              ₱735.00
  Discount (SUMMER10, 10%):              - ₱73.50
  Subtotal After Discount:               ₱661.50

VAT Calculation:
  taxAmount = (661.50 × 12) / 100
  taxAmount = 79.38 / 1                 → ₱79.38

Total:
  ₱661.50 + ₱79.38 = ₱740.88
```

### Example 2: Category-Specific Tax Rule

```
Tax Rules:
  Rule 1 (priority: 10): "Food VAT"
    rate: 0, appliesTo: 'categories', categoryIds: [foodCategoryId]

  Rule 2 (priority: 5): "Standard VAT"
    rate: 12, appliesTo: 'all'

Transaction with food items:
  → Rule 1 matches first (higher priority)
  → taxRate = 0% (food is VAT-exempt)
  → taxAmount = ₱0.00

Transaction with non-food items:
  → Rule 1 does NOT match
  → Rule 2 matches (applies to 'all')
  → taxRate = 12%
```

### Example 3: No Tax Rules Configured

```
Tenant Settings:
  taxEnabled = true
  taxRate    = 12
  taxLabel   = "VAT"

No TaxRule documents exist for this tenant.

Fallback Applied:
  → Uses tenant default: 12% VAT
  → taxLabel: "VAT"
```

---

## 4. VAT Report Generation

### API Endpoint
```
GET /api/reports/vat?startDate=2026-03-01&endDate=2026-03-31
```

**Source**: `lib/analytics.ts` → `getVATReport()`

### Report Calculation Logic

```
INPUT:
  - startDate: Period start (ISO date)
  - endDate: Period end (ISO date)
  - tenantId: Business identifier

PROCESS:

Step 1: Query Completed Transactions
  ───────────────────────────────────
  Transaction.find({
    tenantId,
    status: 'completed',
    createdAt: { $gte: startDate, $lte: endDate }
  })

Step 2: Sum Total Sales
  ─────────────────────
  totalSales = SUM(transaction.total) for all transactions

Step 3: Get Tenant VAT Settings
  ─────────────────────────────
  taxEnabled = tenant.settings.taxEnabled
  vatRate    = tenant.settings.taxRate / 100  (e.g., 0.12)

Step 4: Calculate VAT Breakdown
  ─────────────────────────────
  IF taxEnabled AND vatRate > 0:

    // Reverse-calculate from VAT-inclusive total
    vatableSales = totalSales / (1 + vatRate)
    vatAmount    = totalSales - vatableSales

    // Round to 2 decimal places
    vatableSales = Math.round(vatableSales * 100) / 100
    vatAmount    = Math.round(vatAmount * 100) / 100

  ELSE:
    vatableSales = 0
    vatAmount    = 0

OUTPUT:
  VATReport {
    vatSales:    number  → Base amount (VAT-exclusive)
    nonVatSales: number  → Non-VATable sales
    vatAmount:   number  → Total VAT collected
    totalSales:  number  → Grand total (VAT-inclusive)
    vatRate:     number  → Applied rate (0-100)
  }
```

### VAT Report Example

```
Period: March 1-31, 2026
Total Completed Transactions: 1,247
Total Sales (VAT-inclusive): ₱1,500,000.00

VAT Rate: 12%

Calculation:
  Vatable Sales = ₱1,500,000.00 / 1.12 = ₱1,339,285.71
  VAT Amount    = ₱1,500,000.00 - ₱1,339,285.71 = ₱160,714.29

VAT SUMMARY REPORT
═══════════════════════════════════
Period:           March 2026
Vatable Sales:    ₱ 1,339,285.71
VAT Amount (12%): ₱   160,714.29
Non-VAT Sales:    ₱         0.00
Zero-Rated Sales: ₱         0.00
───────────────────────────────────
TOTAL SALES:      ₱ 1,500,000.00
═══════════════════════════════════
```

---

## 5. Tax in Transaction Lifecycle

```
  ┌─────────────┐
  │ Cart Items   │
  │ (pre-tax)    │
  └──────┬───────┘
         │
         ▼
  ┌─────────────────┐
  │ Apply Discount   │──── Subtotal - Discount = Net Amount
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │ Calculate Tax    │──── Net Amount × Tax Rate = Tax Amount
  │ (lib/tax-calc)   │──── Check TaxRules first, fallback to tenant
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │ Final Total      │──── Net Amount + Tax Amount = Total Due
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │ Store in DB      │──── Transaction.taxAmount (persisted)
  │                  │──── Transaction.total (tax-inclusive)
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │ Receipt          │──── Shows: Subtotal, Discount, VAT %, VAT Amount, Total
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │ VAT Report       │──── Aggregates all transactions
  │ (end of period)  │──── Reverse-calculates base from inclusive total
  └──────────────────┘
```

---

## 6. Tax-Related Database Fields

### Transaction Model
| Field | Type | Description |
|-------|------|-------------|
| `subtotal` | Number | Pre-tax, pre-discount total |
| `discountAmount` | Number | Discount applied |
| `taxAmount` | Number | Calculated tax (default: 0) |
| `total` | Number | Final amount (subtotal - discount + tax) |

### TaxRule Model
| Field | Type | Description |
|-------|------|-------------|
| `rate` | Number | Tax percentage (0-100) |
| `label` | String | Display name ("VAT", "GST") |
| `appliesTo` | Enum | Scope: all/products/services/categories |
| `priority` | Number | Rule evaluation order (high first) |
| `isActive` | Boolean | Enable/disable rule |

### Tenant Settings
| Field | Type | Description |
|-------|------|-------------|
| `taxEnabled` | Boolean | Master tax toggle |
| `taxRate` | Number | Default rate (fallback) |
| `taxLabel` | String | Default label (fallback) |

---

## 7. BIR VAT Compliance Notes

| BIR Requirement | System Support |
|----------------|---------------|
| 12% VAT on taxable goods/services | Configurable per tenant |
| VAT-inclusive pricing | Supported via reverse calculation in reports |
| VAT-exempt items | Via TaxRule with rate: 0 for specific categories |
| Zero-rated sales | Via TaxRule with rate: 0 |
| Monthly VAT returns (BIR Form 2550M) | VAT Report provides data |
| Quarterly VAT returns (BIR Form 2550Q) | VAT Report with date range |
| VAT breakdown on receipts | Included in receipt template |
| Separate tracking of vatable/exempt/zero-rated | Report output fields |

---

*Document Version: 1.0*
*Generated: 2026-03-21*
*System: LocalPro POS*
