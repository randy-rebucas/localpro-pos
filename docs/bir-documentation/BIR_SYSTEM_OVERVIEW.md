# 1POS - System Overview

## BIR Compliance Documentation | System Architecture & Modules

---

## 1. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.0.10 |
| Frontend | React | 19.2.0 |
| Language | TypeScript | 5.x |
| Database | MongoDB (Mongoose ODM) | 8.20.0 |
| Authentication | JWT (jsonwebtoken) | 9.0.2 |
| Password Hashing | bcryptjs (10-round salt) | 3.0.3 |
| PDF Generation | jsPDF | 2.5.2 |
| Excel Export | xlsx | 0.18.5 |
| Charts/Analytics | Recharts | 3.4.1 |
| QR Code | qrcode.react / jsqr | 4.2.0 / 1.4.0 |
| Scheduled Jobs | node-cron | 4.2.1 |
| Payment Gateway | PayPal Server SDK | 2.1.0 |
| Email | Resend / SendGrid / SMTP (nodemailer) | 7.0.12 |
| SMS | Twilio / AWS SNS | 5.11.1 |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   CLIENT BROWSER                     │
│         (React 19 / Next.js App Router)              │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │   POS    │  │  Admin   │  │  Reports/Analytics│   │
│  │ Terminal │  │  Panel   │  │     Dashboard     │   │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │              │                 │              │
├───────┴──────────────┴─────────────────┴─────────────┤
│                  API LAYER (Next.js)                  │
│               /api/* Route Handlers                   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────┐  ┌────────────┐  ┌───────────────┐   │
│  │    Auth    │  │  Business  │  │  Automations  │   │
│  │ Middleware │  │   Logic    │  │  (node-cron)  │   │
│  └─────┬──────┘  └─────┬──────┘  └───────┬───────┘   │
│        │               │                 │            │
├────────┴───────────────┴─────────────────┴───────────┤
│                  DATA LAYER                           │
│          MongoDB (Mongoose Models)                    │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │Transact. │ │ Products │ │ AuditLog │ │  Users │  │
│  │ Payment  │ │  Stock   │ │          │ │ Tenant │  │
│  │ Invoice  │ │ Movement │ │          │ │ Branch │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## 3. Multi-Tenant Architecture

The system operates as a **multi-tenant SaaS platform**. Each tenant (business) is isolated by `tenantId` at the database level.

| Concept | Implementation |
|---------|---------------|
| Tenant Isolation | All queries filtered by `tenantId` |
| URL Routing | `/[tenant]/[lang]/...` (slug + language) |
| Branch Support | Optional `branchId` for multi-location |
| Settings | Per-tenant configuration (currency, tax, branding) |
| User Scoping | Users belong to a single tenant |

---

## 4. Core Modules

### 4.1 Point of Sale (POS)
- Real-time product search and barcode scanning
- Cart management with quantity adjustments
- Multiple payment methods (cash, card, digital)
- Split payment support
- Discount code application
- Automatic tax/VAT calculation
- Receipt generation with unique serial numbers
- Cash drawer integration

### 4.2 Transaction Management
- **Model**: `models/Transaction.ts`
- **API**: `app/api/transactions/`
- Unique receipt number per transaction: `REC-YYYYMMDD-NNNNN`
- Immutable after completion (BIR compliant)
- Status tracking: `completed` | `cancelled` | `refunded`
- No hard deletion — void/refund only with audit trail

### 4.3 Inventory Management
- **Models**: `models/Product.ts`, `models/StockMovement.ts`
- **API**: `app/api/products/`, `app/api/stock/`
- Product catalog with SKU, variations (size/color/type)
- Real-time stock tracking per branch
- Stock movement audit trail (sale, purchase, adjustment, return, damage, transfer)
- Low-stock alerts via automated notifications
- Bundle product support

### 4.4 Payment Processing
- **Model**: `models/Payment.ts`
- **API**: `app/api/payments/`
- Cash (with change calculation), Card, Digital wallets
- Payment records linked to transactions
- Refund tracking with reason codes
- PayPal gateway integration

### 4.5 Invoice & Billing
- **Model**: `models/Invoice.ts`
- **API**: `app/api/invoices/`
- Unique invoice numbers: `INV-YYYYMMDD-NNNNN`
- Status lifecycle: `draft` → `sent` → `paid` | `overdue` | `cancelled`
- Customer billing with address management
- Email delivery of invoices

### 4.6 Customer Management
- **Model**: `models/Customer.ts`
- **API**: `app/api/customers/`
- Contact information with multiple addresses
- Purchase history and total spend tracking
- Customer tagging (VIP, Wholesale, etc.)
- Transaction linkage for loyalty tracking

### 4.7 Discount System
- **Model**: `models/Discount.ts`
- **API**: `app/api/discounts/`
- Percentage and fixed-amount discounts
- Validity period enforcement (validFrom/validUntil)
- Usage limits and tracking
- Minimum purchase requirements
- Maximum discount caps

### 4.8 Reporting & Analytics
- **Library**: `lib/analytics.ts`
- **API**: `app/api/reports/`
- Sales reports (daily, weekly, monthly)
- VAT/Tax reports
- Profit & Loss summaries
- Product performance rankings
- Cash drawer reconciliation (Z-reading equivalent)
- Export to CSV, Excel (XLSX), PDF

### 4.9 User & Access Control
- **Model**: `models/User.ts`
- 5-tier role hierarchy: `owner` > `admin` > `manager` > `cashier` > `viewer`
- Role-based API access enforcement
- QR code login for quick staff access
- Session management with token blacklisting

### 4.10 Audit Logging
- **Model**: `models/AuditLog.ts`
- **Library**: `lib/audit.ts`
- Tracks all system actions with user, timestamp, IP address
- Entity-level change tracking (old value → new value)
- Indexed for efficient querying by tenant, user, date, entity

### 4.11 Bookings & Appointments
- **Model**: `models/Booking.ts`
- **API**: `app/api/bookings/`
- Service scheduling with time slots
- Booking confirmations and reminders
- No-show tracking

### 4.12 Employee Attendance
- **Model**: `models/Attendance.ts`
- **API**: `app/api/attendance/`
- Clock-in / clock-out tracking
- Auto clock-out automation
- Exportable attendance reports

### 4.13 Expense Tracking
- **Model**: `models/Expense.ts`
- **API**: `app/api/expenses/`
- Categorized expense recording
- Integration with Profit & Loss reports

### 4.14 Cash Drawer Management
- **Model**: `models/CashDrawerSession.ts`
- **API**: `app/api/cash-drawer/`
- Opening/closing balance tracking
- Expected vs. actual amount reconciliation
- Shortage/overage detection
- Auto-close automation

### 4.15 Automated Tasks
- **API**: `app/api/automations/`
- Database backups (scheduled)
- Low-stock alerts
- Booking reminders
- Session expiration
- Cash drawer auto-close
- Transaction receipt delivery
- Sales report generation

---

## 5. Database Models Summary

| Model | Collection | Key Fields | BIR Relevance |
|-------|-----------|------------|---------------|
| Transaction | transactions | receiptNumber, items, total, status, taxAmount | Sales records |
| Payment | payments | method, amount, status, refundedAt | Payment tracking |
| Invoice | invoices | invoiceNumber, items, total, taxAmount, status | Official billing |
| Product | products | name, sku, price, trackInventory | Item registry |
| StockMovement | stockmovements | type, quantity, previousStock, newStock | Inventory audit |
| AuditLog | auditlogs | action, userId, changes, ipAddress | Audit trail |
| User | users | email, role, tenantId, lastLogin | Access control |
| Tenant | tenants | slug, settings (tax, currency) | Business config |
| Branch | branches | name, tenantId, address | Location tracking |
| Customer | customers | name, email, totalSpent | Customer records |
| Discount | discounts | code, type, value, usageCount | Discount tracking |
| CashDrawerSession | cashdrawersessions | openingAmount, closingAmount, shortage | Z-reading |
| TaxRule | taxrules | rate, label, appliesTo, priority | VAT configuration |
| Expense | expenses | category, amount, date | Cost tracking |

---

## 6. Security Architecture

| Control | Implementation |
|---------|---------------|
| Authentication | JWT tokens (httpOnly cookies) |
| Password Storage | bcrypt with 10-round salt |
| Token Revocation | In-memory blacklist with auto-cleanup |
| Role-Based Access | 5-tier hierarchy enforced at API level |
| Input Validation | Server-side sanitization on all endpoints |
| CORS | Explicit origin allowlist (no wildcards) |
| Security Headers | X-Frame-Options, CSP, HSTS, nosniff |
| Data Isolation | Tenant-scoped queries on every request |
| Backup | Automated database backup via cron |

---

*Document Version: 1.0*
*Generated: 2026-03-21*
*System: 1POS*
