# LocalPro POS - Sample Official Receipt

## BIR Compliance Documentation | Receipt Format & Layout

---

## 1. Receipt Format (80mm Thermal Printer)

```
================================================
            LOCALPRO STORE NAME
         123 Main St, Makati City
          Metro Manila, Philippines
         TIN: 123-456-789-000 VAT

         Tel: (02) 8123-4567
       Email: store@localpro.com
================================================

OFFICIAL RECEIPT

Receipt #:    REC-20260321-00042
Date:         2026-03-21
Time:         14:30:25
Cashier:      Maria Santos
Branch:       Main Branch
------------------------------------------------

ITEM                    QTY    PRICE    AMOUNT
------------------------------------------------
Barista Coffee Blend      2   150.00    300.00
  SKU: BCB-001
Chocolate Croissant       3    85.00    255.00
  SKU: CC-002
Vanilla Latte (Large)     1   180.00    180.00
  SKU: VL-003-LG

------------------------------------------------
SUBTOTAL                              735.00
DISCOUNT (SUMMER10)                   -73.50
                                  ----------
NET AMOUNT                            661.50
VAT (12%)                              71.07
                                  ==========
TOTAL DUE                        PHP  732.57
------------------------------------------------

PAYMENT
Method:       Cash
Received:     PHP 1,000.00
Change:       PHP   267.43

------------------------------------------------

          VAT BREAKDOWN
Vatable Sales:                        661.50
VAT Amount (12%):                      71.07
VAT-Exempt Sales:                       0.00
Zero-Rated Sales:                       0.00
                                  ----------
Total:                           PHP  732.57

================================================

    THIS SERVES AS YOUR OFFICIAL RECEIPT

BIR Permit No: 0000-000-000000-00000
Date Issued:   2026-01-15
Valid Until:    2026-12-31

Machine ID:    POS-MAIN-001
Serial No:     SN-2026-00001

Transaction ID: 65f2a1b3c4d5e6f7a8b9c0d1

================================================

  Thank you for your purchase!
  Visit us again soon.

  Powered by LocalPro POS
  www.localpro.com

================================================
      *** END OF RECEIPT ***
```

---

## 2. Receipt Data Fields

### Header Section

| Field | Source | Required (BIR) |
|-------|--------|----------------|
| Store Name | `Tenant.name` | Yes |
| Address | `Tenant.settings.address` or `Branch.address` | Yes |
| TIN | `Tenant.settings.taxId` | Yes |
| VAT Registration | `Tenant.settings.taxEnabled` | Yes |
| Telephone | `Tenant.settings.phone` | Recommended |
| Email | `Tenant.settings.email` | Optional |

### Transaction Section

| Field | Source | Required (BIR) |
|-------|--------|----------------|
| Receipt Number | `Transaction.receiptNumber` (REC-YYYYMMDD-NNNNN) | Yes |
| Date | `Transaction.createdAt` (date portion) | Yes |
| Time | `Transaction.createdAt` (time portion) | Yes |
| Cashier Name | `User.name` (via `Transaction.userId`) | Yes |
| Branch | `Branch.name` (via `Transaction.branchId`) | Recommended |

### Line Items

| Field | Source | Required (BIR) |
|-------|--------|----------------|
| Item Name | `Transaction.items[].name` | Yes |
| SKU | `Product.sku` | Recommended |
| Quantity | `Transaction.items[].quantity` | Yes |
| Unit Price | `Transaction.items[].price` | Yes |
| Amount | `Transaction.items[].subtotal` (price x qty) | Yes |

### Totals Section

| Field | Source | Required (BIR) |
|-------|--------|----------------|
| Subtotal | `Transaction.subtotal` | Yes |
| Discount Code | `Transaction.discountCode` | If applied |
| Discount Amount | `Transaction.discountAmount` | If applied |
| Net Amount | Subtotal - Discount | Yes |
| VAT Rate | `TaxRule.rate` or `Tenant.settings.taxRate` | Yes |
| VAT Amount | `Transaction.taxAmount` | Yes |
| Total Due | `Transaction.total` | Yes |

### Payment Section

| Field | Source | Required (BIR) |
|-------|--------|----------------|
| Payment Method | `Transaction.paymentMethod` | Yes |
| Cash Received | `Transaction.cashReceived` | If cash |
| Change | `Transaction.change` | If cash |
| Card Last 4 | `Payment.details.cardLast4` | If card |
| Card Brand | `Payment.details.cardBrand` | If card |
| Digital Provider | `Payment.details.provider` | If digital |

### VAT Breakdown Section

| Field | Calculation | Required (BIR) |
|-------|------------|----------------|
| Vatable Sales | `total / (1 + vatRate)` | Yes |
| VAT Amount | `total - vatableSales` | Yes |
| VAT-Exempt Sales | Items with tax exemption | Yes |
| Zero-Rated Sales | Items with 0% rate | Yes |
| Total | Sum of all | Yes |

### Footer Section

| Field | Source | Required (BIR) |
|-------|--------|----------------|
| BIR Permit Number | Tenant configuration | Yes |
| Date Issued | Tenant configuration | Yes |
| Valid Until | Tenant configuration | Yes |
| Machine ID | Terminal/branch identifier | Yes |
| Serial Number | System-generated | Yes |
| Transaction ID | `Transaction._id` | Recommended |

---

## 3. Receipt Number Format

```
Format: REC-YYYYMMDD-NNNNN

Components:
  REC      → Fixed prefix (Receipt)
  YYYYMMDD → Date (e.g., 20260321)
  NNNNN    → Daily sequence, zero-padded (00001 - 99999)

Examples:
  REC-20260321-00001  → First receipt of March 21, 2026
  REC-20260321-00042  → 42nd receipt of March 21, 2026
  REC-20260322-00001  → Resets to 00001 on new day

Uniqueness:
  - Enforced at database level (unique index)
  - Per-tenant isolation
  - Sequential within each day

Source: lib/receipt.ts → generateReceiptNumber()
```

---

## 4. Refund Receipt Format

```
================================================
            LOCALPRO STORE NAME
         123 Main St, Makati City
================================================

*** REFUND RECEIPT ***

Refund Receipt #: REF-REC-20260321-00042
Original Receipt: REC-20260321-00042
Date:             2026-03-21
Time:             15:45:10
Processed By:     Juan Cruz (Manager)
------------------------------------------------

REFUNDED ITEMS         QTY    PRICE    AMOUNT
------------------------------------------------
Chocolate Croissant      2    85.00    170.00

------------------------------------------------
REFUND SUBTOTAL                       170.00
DISCOUNT ADJUSTMENT                   -17.00
                                  ----------
REFUND AMOUNT                    PHP  153.00

REFUND METHOD:    Cash

Reason: Customer returned items

Transaction ID: 65f2a1b3c4d5e6f7a8b9c0d2
Original TXN:   65f2a1b3c4d5e6f7a8b9c0d1

================================================
```

---

## 5. Voided Transaction Marker

When a transaction is voided (cancelled), the original receipt is marked:

```
================================================

*** VOID ***

Receipt #:       REC-20260321-00042
Void Date:       2026-03-21 16:00:00
Voided By:       Juan Cruz (Manager)
Original Total:  PHP 732.57

Status:          CANCELLED

Audit Trail ID:  65f2a1b3c4d5e6f7a8b9c0d3

*** THIS TRANSACTION HAS BEEN VOIDED ***

================================================
```

---

## 6. Receipt Template System

### Template Engine
- **Source**: `lib/receipt-templates.ts`
- **Syntax**: Handlebars-like (`{{variable}}`, `{{#if}}`, `{{#each}}`)
- **Output**: HTML formatted for 80mm thermal printers

### Available Template Variables

```
{{storeName}}          → Business name
{{storeAddress}}       → Full address
{{storeTIN}}           → Tax Identification Number
{{storePhone}}         → Contact phone
{{storeEmail}}         → Contact email

{{receiptNumber}}      → REC-YYYYMMDD-NNNNN
{{date}}               → Formatted date
{{time}}               → Formatted time
{{cashierName}}        → Staff name
{{branchName}}         → Location name

{{#each items}}
  {{name}}             → Product name
  {{sku}}              → Product SKU
  {{quantity}}         → Quantity purchased
  {{price}}            → Unit price
  {{subtotal}}         → Line total
{{/each}}

{{subtotal}}           → Pre-discount total
{{discountCode}}       → Applied discount code
{{discountAmount}}     → Discount value
{{taxLabel}}           → "VAT", "GST", etc.
{{taxRate}}            → Tax percentage
{{taxAmount}}          → Calculated tax
{{total}}              → Final amount

{{paymentMethod}}      → Cash / Card / Digital
{{cashReceived}}       → Amount tendered
{{change}}             → Change given
{{cardLast4}}          → Card last 4 digits
{{cardBrand}}          → Visa / MC / etc.

{{footerText}}         → Custom footer message
{{transactionId}}      → MongoDB document ID
```

---

## 7. BIR Receipt Compliance Checklist

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| Registered business name | Supported | `Tenant.name` |
| Business address | Supported | `Tenant.settings` / `Branch.address` |
| TIN (Tax Identification Number) | Supported | `Tenant.settings.taxId` |
| VAT/Non-VAT registration | Supported | `Tenant.settings.taxEnabled` |
| BIR Permit to Use | Configurable | Tenant settings (footer) |
| Date & time of transaction | Auto-generated | `Transaction.createdAt` |
| Sequential receipt number | Auto-generated | `REC-YYYYMMDD-NNNNN` |
| Description of items | Captured | `Transaction.items[].name` |
| Quantity per item | Captured | `Transaction.items[].quantity` |
| Unit price per item | Captured | `Transaction.items[].price` |
| Total amount | Calculated | `Transaction.total` |
| VAT breakdown | Calculated | Via `lib/tax-calculation.ts` |
| Vatable / VAT-exempt / zero-rated | Calculated | VAT report logic |
| Machine serial number | Configurable | Terminal ID in settings |

---

*Document Version: 1.0*
*Generated: 2026-03-21*
*System: LocalPro POS*
