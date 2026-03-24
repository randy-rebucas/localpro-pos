# 1POS - Process Flow

## BIR Compliance Documentation | Sales → Receipt → Reporting

---

## 1. Complete Sales Transaction Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     SALES PROCESS FLOW                        │
└──────────────────────────────────────────────────────────────┘

  ┌─────────────┐
  │  CASHIER     │
  │  logs in     │
  │  (JWT auth)  │
  └──────┬───────┘
         │
         ▼
  ┌─────────────────┐
  │  OPEN CASH       │
  │  DRAWER SESSION  │──── Records: opening amount, user, timestamp
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐     ┌──────────────────┐
  │  SCAN / SEARCH   │────▶│  Product Lookup   │
  │  PRODUCTS        │     │  (barcode / name) │
  └──────┬───────────┘     └──────────────────┘
         │
         ▼
  ┌─────────────────┐
  │  BUILD CART       │──── Add items, adjust quantities
  │                   │──── Apply discount codes (validated)
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │  CALCULATE        │
  │  TOTALS           │
  │                   │
  │  Subtotal         │──── Sum of (price × quantity) per item
  │  - Discount       │──── Percentage or fixed, with cap
  │  + Tax/VAT        │──── Per TaxRule or tenant default rate
  │  ─────────────    │
  │  = TOTAL DUE      │
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │  ACCEPT PAYMENT   │
  │                   │
  │  Cash ───────────▶│  Calculate change
  │  Card ───────────▶│  Record card last 4, provider
  │  Digital ────────▶│  Record provider, transaction ID
  │  Split ──────────▶│  Multiple payment records
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │  PROCESS          │
  │  TRANSACTION      │
  │                   │
  │  1. Verify stock  │──── Check inventory per item
  │  2. Deduct stock  │──── Create StockMovement records
  │  3. Save txn      │──── Generate receipt: REC-YYYYMMDD-NNNNN
  │  4. Save payments │──── Link Payment records to transaction
  │  5. Audit log     │──── Record action + metadata
  │  6. Update usage  │──── Increment discount usage counter
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │  GENERATE         │
  │  RECEIPT          │──── Unique serial number
  │                   │──── Store name, address, TIN
  │                   │──── Itemized list with prices
  │                   │──── VAT breakdown
  │                   │──── Payment method + change
  │                   │──── Date & time
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │  PRINT / EMAIL    │──── Thermal printer (80mm)
  │  RECEIPT          │──── Email delivery (optional)
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────────────────────────────────┐
  │  TRANSACTION LOCKED (IMMUTABLE)              │
  │  Status: 'completed'                         │
  │  Only void/refund allowed (with audit trail) │
  └──────────────────────────────────────────────┘
```

---

## 2. Transaction Creation Detail

### API Endpoint: `POST /api/transactions`
### Source: `app/api/transactions/route.ts`

| Step | Action | Validation | Failure Response |
|------|--------|-----------|-----------------|
| 1 | Authenticate user | JWT token valid, user active | 401 Unauthorized |
| 2 | Validate tenant access | User belongs to tenant | 403 Forbidden |
| 3 | Parse request body | Items array, payment method | 400 Bad Request |
| 4 | Validate products | Products exist, are active | 404 Not Found |
| 5 | Check stock levels | Sufficient quantity (if tracked) | 400 Insufficient Stock |
| 6 | Expand bundles | Bundle items validated | 400 Invalid Bundle |
| 7 | Calculate subtotal | price x quantity per item | — |
| 8 | Apply discount | Code valid, within dates, usage limit | 400 Invalid Discount |
| 9 | Calculate tax | TaxRule lookup → fallback to tenant rate | — |
| 10 | Process payment | Cash change / card details / digital | 400 Invalid Payment |
| 11 | Deduct stock | StockMovement per item (type: 'sale') | 500 Stock Error |
| 12 | Save transaction | Generate receipt number, persist | 500 Server Error |
| 13 | Save payment records | Link to transaction | 500 Server Error |
| 14 | Create audit log | action: 'transaction.create' | Silent (non-blocking) |
| 15 | Return response | Transaction + payment data | 200 Success |

---

## 3. Void / Cancellation Flow

```
  ┌─────────────────┐
  │  MANAGER/ADMIN    │
  │  selects txn      │
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │  VERIFY           │
  │  AUTHORIZATION    │──── Requires 'admin' or 'manager' role
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐     ┌──────────────────────────────┐
  │  CHECK STATUS     │────▶│  Already cancelled/refunded? │
  │                   │     │  → REJECT (400)              │
  └──────┬───────────┘     └──────────────────────────────┘
         │ (status = 'completed')
         ▼
  ┌─────────────────┐
  │  UPDATE STATUS    │──── 'completed' → 'cancelled'
  │  TO 'cancelled'   │
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │  AUDIT LOG        │──── Action: 'transaction.cancel'
  │                   │──── Records: old status, new status
  │                   │──── User ID, IP address, timestamp
  └──────────────────┘

  Note: Stock is NOT restored on cancellation.
  Use refund flow for stock restoration.
```

---

## 4. Refund Flow

```
  ┌─────────────────┐
  │  MANAGER/ADMIN    │
  │  initiates refund │
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │  VALIDATE          │
  │                    │──── Transaction exists
  │                    │──── Status = 'completed'
  │                    │──── Not already refunded
  │                    │──── Items exist in original
  │                    │──── Refund qty ≤ original qty
  └──────┬────────────┘
         │
         ▼
  ┌─────────────────┐
  │  CALCULATE         │
  │  REFUND AMOUNT     │
  │                    │
  │  Item totals       │──── quantity × original price
  │  - Pro-rata disc.  │──── (refund / subtotal) × discount
  │  = Refund amount   │
  └──────┬────────────┘
         │
         ▼
  ┌─────────────────┐
  │  RESTORE STOCK     │──── StockMovement (type: 'return')
  │  (if tracked)      │──── Per item, per branch
  └──────┬────────────┘
         │
         ▼
  ┌─────────────────┐
  │  CREATE RECORDS    │
  │                    │
  │  1. Refund txn     │──── Receipt: REF-<original receipt>
  │  2. Refund payment │──── Linked to refund transaction
  │  3. Mark original  │──── Payment status → 'refunded'
  │     payment        │──── refundedAt timestamp
  └──────┬────────────┘
         │
         ▼
  ┌─────────────────┐
  │  AUDIT LOG         │──── Action: 'transaction.refund'
  │                    │──── refundAmount, itemsRefunded
  │                    │──── isFullRefund flag
  └──────────────────┘
```

### API Endpoint: `POST /api/transactions/{id}/refund`
### Source: `app/api/transactions/[id]/refund/route.ts`

---

## 5. Receipt Generation Flow

```
  Transaction Saved
         │
         ▼
  ┌─────────────────┐
  │  GENERATE          │
  │  RECEIPT NUMBER    │
  │                    │
  │  1. Get today's    │──── Format: YYYYMMDD
  │     date           │
  │  2. Query last     │──── Find highest sequence for today
  │     receipt today  │
  │  3. Increment      │──── Sequence + 1 (5-digit, zero-padded)
  │  4. Format         │──── REC-YYYYMMDD-NNNNN
  └──────┬────────────┘
         │
         ▼
  ┌─────────────────┐
  │  BUILD RECEIPT     │
  │  DATA              │
  │                    │
  │  Header:           │──── Store name, logo, address
  │  Receipt #:        │──── REC-20260321-00042
  │  Date/Time:        │──── 2026-03-21 14:30:00
  │  Items:            │──── Name, qty, price, subtotal
  │  Totals:           │──── Subtotal, discount, VAT, total
  │  Payment:          │──── Method, cash received, change
  │  Footer:           │──── Custom text, thank you message
  └──────┬────────────┘
         │
         ▼
  ┌─────────────────┐
  │  RENDER TEMPLATE   │──── HTML template with {{variables}}
  │                    │──── Conditional blocks {{#if}}
  │                    │──── Item loops {{#each}}
  └──────┬────────────┘
         │
         ├──── PRINT (thermal 80mm)
         │
         └──── EMAIL (optional, automated)
```

### Source: `lib/receipt.ts`, `lib/receipt-templates.ts`

---

## 6. Reporting Flow

```
  ┌─────────────────────────────────────────────────────────┐
  │                    REPORTING PIPELINE                     │
  └─────────────────────────────────────────────────────────┘

  ┌─────────────────┐     ┌──────────────────────────────┐
  │  TRANSACTIONS    │────▶│  Sales Report                 │
  │  (completed)     │     │  GET /api/reports/sales        │
  │                  │     │                                │
  │                  │     │  • Total sales & count          │
  │                  │     │  • Average transaction           │
  │                  │     │  • Breakdown by payment method   │
  │                  │     │  • Daily/weekly/monthly periods  │
  └──────────────────┘     └──────────────────────────────┘

  ┌─────────────────┐     ┌──────────────────────────────┐
  │  TRANSACTIONS    │────▶│  VAT Report                   │
  │  + TAX RULES     │     │  GET /api/reports/vat          │
  │                  │     │                                │
  │                  │     │  • VAT-able sales (base)         │
  │                  │     │  • VAT amount collected           │
  │                  │     │  • VAT rate applied               │
  │                  │     │  • Total sales (inclusive)        │
  └──────────────────┘     └──────────────────────────────┘

  ┌─────────────────┐     ┌──────────────────────────────┐
  │  TRANSACTIONS    │────▶│  Profit & Loss                │
  │  + EXPENSES      │     │  GET /api/reports/profit-loss  │
  │                  │     │                                │
  │                  │     │  • Revenue by payment method     │
  │                  │     │  • Expenses by category          │
  │                  │     │  • Gross & net profit            │
  │                  │     │  • Profit margin %               │
  └──────────────────┘     └──────────────────────────────┘

  ┌─────────────────┐     ┌──────────────────────────────┐
  │  CASH DRAWER     │────▶│  Cash Drawer / Z-Reading      │
  │  SESSIONS        │     │  GET /api/reports/cash-drawer  │
  │                  │     │                                │
  │                  │     │  • Opening / closing amounts     │
  │                  │     │  • Expected vs actual            │
  │                  │     │  • Shortage / overage            │
  │                  │     │  • Cash sales & expenses         │
  └──────────────────┘     └──────────────────────────────┘

  ┌─────────────────┐     ┌──────────────────────────────┐
  │  TRANSACTIONS    │────▶│  Product Performance          │
  │  + PRODUCTS      │     │  GET /api/reports/products     │
  │                  │     │                                │
  │                  │     │  • Top selling products          │
  │                  │     │  • Revenue per product           │
  │                  │     │  • Quantity sold                  │
  └──────────────────┘     └──────────────────────────────┘

         ALL REPORTS
              │
              ▼
  ┌──────────────────────┐
  │  EXPORT OPTIONS       │
  │                       │
  │  📄 CSV              │──── lib/export.ts → arrayToCSV()
  │  📊 Excel (XLSX)     │──── lib/export.ts → downloadExcel()
  │  📋 PDF              │──── lib/export.ts → downloadPDF()
  └──────────────────────┘
```

---

## 7. End-of-Day (Z-Reading) Flow

```
  ┌─────────────────┐
  │  CLOSE CASH       │
  │  DRAWER SESSION   │
  └──────┬───────────┘
         │
         ▼
  ┌─────────────────┐
  │  ENTER CLOSING     │──── Cashier counts physical cash
  │  AMOUNT            │
  └──────┬────────────┘
         │
         ▼
  ┌─────────────────┐
  │  SYSTEM            │
  │  CALCULATES        │
  │                    │
  │  Expected =        │
  │    Opening amount  │
  │  + Cash sales      │──── Sum of cash transactions in session
  │  - Cash expenses   │──── Sum of cash expenses in session
  │  ─────────────     │
  │  = Expected amount │
  │                    │
  │  Shortage =        │──── Expected - Closing (if positive)
  │  Overage =         │──── Closing - Expected (if positive)
  └──────┬────────────┘
         │
         ▼
  ┌─────────────────┐
  │  SAVE SESSION      │──── closingTime, closingAmount
  │  RECORD            │──── expectedAmount, shortage/overage
  │                    │──── Status: 'closed'
  └──────┬────────────┘
         │
         ▼
  ┌─────────────────┐
  │  GENERATE          │
  │  Z-READING REPORT  │──── Via /api/reports/cash-drawer
  │                    │──── Exportable as CSV/Excel/PDF
  └──────────────────┘
```

---

## 8. Stock Movement Trail

Every inventory change creates a `StockMovement` record:

| Trigger | Movement Type | Quantity | Source |
|---------|--------------|----------|--------|
| Sale completed | `sale` | Negative | Transaction ID |
| Refund processed | `return` | Positive | Transaction ID |
| Manual adjustment | `adjustment` | +/- | User + reason |
| Purchase order | `purchase` | Positive | User + notes |
| Damaged goods | `damage` | Negative | User + reason |
| Branch transfer | `transfer` | +/- | User + branch |

Each record captures: `previousStock`, `newStock`, `userId`, `timestamp`, `branchId`

---

## 9. Transaction Immutability Rules

| Transaction Status | Allowed Actions | Blocked Actions |
|-------------------|----------------|----------------|
| `completed` | Void (→ cancelled), Refund (→ refunded) | Edit items, edit totals, edit notes, delete |
| `cancelled` | None | All modifications |
| `refunded` | None | All modifications |

**Enforcement**: `app/api/transactions/[id]/route.ts` — PUT handler checks status before any modification.

---

*Document Version: 1.0*
*Generated: 2026-03-21*
*System: 1POS*
