# 16. BIR Tax Compliance

**Available to:** Admin, Owner

## Overview

1POS is designed to comply with the Bureau of Internal Revenue (BIR) requirements for computerized Point of Sale systems in the Philippines.

## Key BIR Requirements Covered

| Requirement | How 1POS Implements It |
|------------|----------------------|
| **Official Receipt** | Auto-generated with serial control |
| **TIN on receipts** | Auto-filled from store settings |
| **VAT breakdown** | Shown on every receipt |
| **Sequential serial numbers** | Atomic counter prevents gaps or duplicates |
| **Transaction immutability** | Completed transactions cannot be edited, only voided/refunded |
| **12% VAT computation** | Automatic on all taxable items |
| **VAT-exempt handling** | Toggle per product or per transaction |
| **Senior/PWD discounts** | RA 9994 and RA 10754 compliant |
| **Daily sales summary** | Z-reading equivalent report |
| **Sales journal** | Exportable detailed transaction log |
| **Audit trail** | All actions logged with timestamp and user |
| **10-year data retention** | Automated archiving with configurable retention |

## Setting Up BIR Information

1. Navigate to **Settings**
2. Ensure the following are filled in:
   - **Business Name** — Registered business name
   - **TIN** — Tax Identification Number
   - **Address** — Registered business address
   - **VAT Registration** — VAT-registered or Non-VAT

This information appears on all receipts automatically.

## VAT Computation

### Standard Computation

For a VATable sale:
- **VATable Sales** = Total / 1.12
- **VAT Amount** = VATable Sales x 0.12
- **Total** = VATable Sales + VAT Amount

### Example

| Item | Amount |
|------|--------|
| Product Price | PHP 1,120.00 |
| VATable Sales | PHP 1,000.00 |
| VAT (12%) | PHP 120.00 |
| **Total** | **PHP 1,120.00** |

### VAT-Exempt Sales

For VAT-exempt items (e.g., basic commodities, Senior/PWD):
- No VAT is added
- Receipt clearly shows "VAT-EXEMPT SALE"

## Senior Citizen / PWD Discounts

### Applying the Discount

1. During a POS transaction, click **SC/PWD Discount**
2. Enter the customer's ID number
3. The system applies:
   - **20% discount** on the VAT-exclusive price
   - **VAT exemption** on the discounted items
4. The receipt shows:
   - SC/PWD ID number
   - Discount amount
   - VAT-exempt status

### Computation (RA 9994 / RA 10754)

| Step | Calculation |
|------|------------|
| Selling price (VAT inclusive) | PHP 1,120.00 |
| VAT-exclusive price | PHP 1,000.00 (1,120 / 1.12) |
| 20% SC/PWD discount | PHP 200.00 (1,000 x 0.20) |
| **Amount due** | **PHP 800.00** |

## Receipt Serial Numbers

- Every receipt has a unique, sequential serial number
- Numbers are generated atomically (no gaps or duplicates)
- The format is configurable (e.g., `OR-2026-000001`)
- Serial numbers are never reused, even after void/refund
- Voided/refunded transactions get their own separate serial

## Required Reports for BIR

### Daily Sales Summary (Z-Reading)

1. Navigate to **Reports > Sales Report**
2. Filter by **Today**
3. The report includes:
   - Beginning receipt number
   - Ending receipt number
   - Grand total sales
   - VATable sales
   - VAT amount
   - VAT-exempt sales
   - Zero-rated sales
   - Discount total
   - Refund total
   - Net sales
4. Export as PDF for your records

### Sales Journal

1. Navigate to **Reports > Sales Journal**
2. Select date range
3. Every transaction is listed line by line
4. Export as CSV or Excel for BIR submission

### VAT Report

1. Navigate to **Reports > VAT Report**
2. Select period (monthly or quarterly)
3. Provides data for BIR Form 2550M/2550Q:
   - Total VATable sales
   - Output VAT
   - VAT-exempt sales
   - Zero-rated sales

## Audit Trail

BIR requires a complete record of system activity:

1. Navigate to **Admin > Audit Logs**
2. The log records:
   - **14+ action types** — Login, logout, create, update, delete, void, refund, etc.
   - **Timestamp** — Exact date and time
   - **User** — Who performed the action
   - **IP Address** — Source of the action
   - **Details** — What was changed (before/after values)

### No Hard Delete

1POS uses **soft delete** for all records. Data is deactivated, never permanently removed. This ensures:
- Complete audit trail preservation
- Historical transaction accuracy
- BIR compliance for 10-year record retention

## Data Retention

- All transaction data is retained for **10 years** (configurable)
- Automated archiving moves old records to archive storage
- Archived data remains accessible for audit purposes
- Configure retention in **Settings > Automations > Data Archiving**

## BIR Inspection Readiness

In case of a BIR audit, you can provide:

1. **Sales journals** — Export for any date range
2. **VAT reports** — Monthly and quarterly summaries
3. **Audit logs** — Complete system activity history
4. **Receipt records** — Sequential, numbered, with full tax breakdown
5. **User access logs** — Who had access and what they did
