# LocalPro POS - Staff Operations Guide

This guide covers day-to-day operations for all staff roles. Refer to your specific role section for tasks relevant to you.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Role Overview](#2-role-overview)
3. [Cashier Guide](#3-cashier-guide)
4. [Manager Guide](#4-manager-guide)
5. [Admin / Owner Guide](#5-admin--owner-guide)
6. [Common Workflows](#6-common-workflows)
7. [Reports Reference](#7-reports-reference)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Getting Started

### Logging In

You can log in using any of these methods:

| Method | How |
|--------|-----|
| **Email & Password** | Enter your email and password on the login page |
| **PIN Login** | Enter your numeric PIN (if configured by admin) |
| **QR Code** | Scan your personal QR code using the QR login option |

After login you will land on the **Dashboard**, which shows a summary of today's sales, recent transactions, and quick-action buttons.

### Navigation

- **Top bar** - Company logo, user menu (profile, settings, logout)
- **Side menu** - Main sections: Dashboard, POS, Products, Transactions, Reports
- **Admin menu** - Visible only to Manager, Admin, and Owner roles

### Changing Your Password

1. Click your name in the top-right corner
2. Select **Profile**
3. Click **Change Password**
4. Enter your current password and new password
5. Click **Save**

---

## 2. Role Overview

### What Each Role Can Do

| Feature | Viewer | Cashier | Manager | Admin | Owner |
|---------|--------|---------|---------|-------|-------|
| View dashboard | Yes | Yes | Yes | Yes | Yes |
| View products | Yes | Yes | Yes | Yes | Yes |
| Process sales (POS) | - | Yes | Yes | Yes | Yes |
| Apply discounts | - | Yes | Yes | Yes | Yes |
| Process refunds | - | Yes | Yes | Yes | Yes |
| Save/load carts | - | Yes | Yes | Yes | Yes |
| Open/close cash drawer | - | Yes | Yes | Yes | Yes |
| View transactions | Yes | Yes | Yes | Yes | Yes |
| View reports | - | - | Yes | Yes | Yes |
| Export sales journal | - | - | Yes | Yes | Yes |
| Manage products | - | - | Yes | Yes | Yes |
| Manage inventory/stock | - | - | Yes | Yes | Yes |
| Manage categories | - | - | Yes | Yes | Yes |
| Manage discounts | - | - | Yes | Yes | Yes |
| Manage bookings | - | Yes | Yes | Yes | Yes |
| View attendance | Own only | Own only | All staff | All staff | All staff |
| Manage expenses | - | - | Yes | Yes | Yes |
| Manage users | - | - | Yes | Yes | Yes |
| View audit logs | - | - | - | Yes | Yes |
| Manage settings | - | - | - | Yes | Yes |
| Manage tax rules | - | - | - | Yes | Yes |
| Manage branches | - | - | - | Yes | Yes |
| Manage subscriptions | - | - | - | Yes | Yes |
| Manage tenants | - | - | - | - | Yes |

---

## 3. Cashier Guide

### 3.1 Processing a Sale

1. Go to **POS** from the side menu
2. **Find products** using:
   - Search bar (type product name or SKU)
   - Category filters (tap a category to filter)
   - Barcode scanner (scan item barcode)
3. **Tap a product** to add it to the cart (quantity starts at 1)
4. **Adjust quantity** using the +/- buttons in the cart, or tap the quantity to type a number
5. **Apply a discount** (if applicable):
   - Tap **Apply Discount** in the cart area
   - Enter the promo code
   - The system calculates the discount automatically
   - For **Senior/PWD discounts**: select the category and verify the customer's ID
6. **Select payment method**:
   - **Cash** - Enter amount received; the system calculates change
   - **Card** - Process via card terminal
   - **Digital** - Process via digital payment (GCash, PayMaya, etc.)
7. **Complete the sale** - Tap **Pay** / **Complete**
8. **Receipt** prints automatically (if printer is configured) or can be emailed

### 3.2 Processing a Refund

1. From the **POS** screen, tap **Refund** or go to **Transactions**
2. Find the original transaction by receipt number or date
3. Select items to refund (full or partial)
4. Enter refund reason
5. Confirm the refund
6. Stock is automatically restored to inventory

> **Important**: Completed transactions cannot be edited - only voided or refunded. This is required for BIR compliance.

### 3.3 Saving a Cart for Later

If a customer needs to step away:

1. Tap **Save Cart** in the POS screen
2. Give the cart a name (e.g., "Maria - Table 3")
3. To retrieve it later, tap **Load Cart** and select the saved cart

### 3.4 Cash Drawer Operations

#### Opening the Cash Drawer

1. Go to **Admin > Cash Drawer** (or it may open automatically at shift start)
2. Enter the **opening amount** (count the cash in the drawer)
3. Tap **Open Drawer**

#### Closing the Cash Drawer

1. Go to **Admin > Cash Drawer**
2. Count all cash in the drawer
3. Enter the **closing amount**
4. The system shows:
   - **Expected amount** = Opening + Cash Sales - Cash Expenses
   - **Shortage** = Expected - Actual (if you have less)
   - **Overage** = Actual - Expected (if you have more)
5. Add notes if there's a discrepancy
6. Tap **Close Drawer**

### 3.5 Applying Senior / PWD Discounts

1. During checkout, tap **Apply Discount**
2. Select category: **Senior** or **PWD**
3. Verify the customer's valid ID
4. The system applies:
   - **20% discount** on the subtotal
   - **VAT exemption** (tax is removed)
5. The receipt will show the discount category and BIR-compliant breakdown

### 3.6 Clock In / Clock Out

1. Go to **Admin > Attendance** (or use the attendance button if on dashboard)
2. Tap **Clock In** at the start of your shift
3. For breaks: tap **Start Break** / **End Break**
4. Tap **Clock Out** at the end of your shift
5. Total hours are calculated automatically (break time is subtracted)

---

## 4. Manager Guide

Managers have all Cashier capabilities plus the following:

### 4.1 Managing Products

#### Adding a New Product

1. Go to **Admin > Products**
2. Tap **Add Product**
3. Fill in:
   - **Name** (required)
   - **Price** (required)
   - **SKU** (optional, must be unique)
   - **Barcode** (optional, for scanner)
   - **Category** (select from list)
   - **Stock** (initial quantity)
   - **Image** (upload product photo)
4. Configure options:
   - **Track Inventory** - Enable to track stock levels
   - **Tax Exempt** - Enable for VAT-exempt items
   - **Allow Out of Stock Sales** - Enable to sell even when stock is 0
   - **Low Stock Threshold** - Override the default alert level
5. Tap **Save**

#### Product Variations

For products with sizes/colors:

1. Edit the product and enable **Has Variations**
2. Add variations (e.g., Small/Medium/Large)
3. Each variation can have its own price and stock level

#### Product Bundles

1. Go to **Admin > Bundles**
2. Tap **Create Bundle**
3. Select products to include
4. Set bundle price (usually discounted vs. individual prices)
5. Save the bundle

### 4.2 Inventory Management

#### Checking Stock Levels

1. Go to **Inventory**
2. View stock levels for all products
3. Filter by branch/location if multi-branch
4. Items highlighted in red are below the low-stock threshold

#### Adjusting Stock

1. From **Inventory** or **Admin > Stock Movements**
2. Select a product
3. Choose movement type:
   - **Purchase** - New stock received from supplier
   - **Adjustment** - Manual correction (e.g., after physical count)
   - **Damage** - Stock lost due to damage/spoilage
   - **Transfer** - Move stock between branches
4. Enter quantity and reason
5. Save - the stock movement is recorded in the audit trail

### 4.3 Managing Discounts

1. Go to **Admin > Discounts**
2. Tap **Create Discount**
3. Configure:
   - **Code** - The promo code customers will use
   - **Type** - Percentage or Fixed Amount
   - **Value** - Discount amount (e.g., 20 for 20% or 100 for PHP 100 off)
   - **Category** - General, Senior, PWD, Employee, or Promo
   - **Valid From/To** - Date range
   - **Usage Limit** - Max number of times the code can be used
   - **Minimum Purchase** - Minimum cart amount to qualify
   - **Requires ID Verification** - For senior/PWD discounts
4. Save the discount

### 4.4 Managing Bookings

1. Go to **Admin > Bookings**
2. **Create Booking**: Enter customer details, service, date/time, and optionally assign staff
3. **Update Status**: Pending > Confirmed > Completed (or Cancelled / No-Show)
4. The system sends:
   - Confirmation email when booking is created
   - Reminder 24 hours before the appointment
   - Cancellation notification if cancelled

### 4.5 Managing Expenses

1. Go to **Admin > Expenses**
2. Tap **Add Expense**
3. Fill in: Name, Description, Amount, Date, Payment Method
4. Add receipt photo if available
5. Save - the expense appears in Profit & Loss reports

### 4.6 Viewing Reports

Go to **Reports** and select a tab:

| Report | What It Shows |
|--------|--------------|
| **Sales** | Total sales, transaction count, average transaction, payment method breakdown, daily trends |
| **Products** | Top-selling products, quantity sold, revenue per product |
| **VAT** | VAT sales vs. non-VAT, VAT amount collected, VAT rate |
| **Profit & Loss** | Revenue by payment method, expenses by category, gross/net profit, profit margin |
| **Cash Drawer** | Opening/closing amounts, expected vs. actual, shortages/overages |
| **Sales Journal** | Transaction-level detail with receipt numbers, items, discounts, tax, totals - exportable to CSV/Excel/PDF |

All reports support date range filtering.

### 4.7 Staff Attendance

1. Go to **Admin > Attendance**
2. View attendance records for all staff (managers can see all users)
3. Filter by date range or specific employee
4. Export attendance data for payroll

---

## 5. Admin / Owner Guide

Admins and Owners have all Manager capabilities plus system configuration.

### 5.1 User Management

#### Creating a New User

1. Go to **Admin > Users**
2. Tap **Add User**
3. Fill in:
   - **Name**
   - **Email** (used for login)
   - **Password** (min 8 characters)
   - **Role** (viewer, cashier, manager, admin, owner)
4. Save

#### Deactivating a User

1. Go to **Admin > Users**
2. Find the user
3. Toggle **Active** to off
4. The user can no longer log in but their data (transactions, attendance) is preserved

#### Generating QR Login

1. Go to **Admin > Users**
2. Find the user
3. Tap **Generate QR Code**
4. Print or share the QR code with the employee for quick login

### 5.2 Tax Configuration

#### Setting Up VAT

1. Go to **Settings > Tax** or **Admin > Tax Rules**
2. Enable tax
3. Set tax rate to **12** (for Philippine VAT)
4. Set tax label to **VAT**
5. Save

#### Creating Custom Tax Rules

1. Go to **Admin > Tax Rules**
2. Tap **Add Tax Rule**
3. Set:
   - **Label** (e.g., "VAT", "Zero-Rated")
   - **Rate** (0-100%)
   - **Priority** (higher priority rules are checked first)
   - **Applies To** - All products or specific categories
4. Save

### 5.3 Branch Management

1. Go to **Admin > Branches**
2. Tap **Add Branch**
3. Enter branch name, code, address, and contact info
4. Enable/disable the branch
5. Stock can be tracked separately per branch

### 5.4 Business Settings

Go to **Settings** to configure:

| Section | What You Can Set |
|---------|-----------------|
| **General** | Currency (PHP), date/time format, timezone, language |
| **Branding** | Company name, logo, colors, themes |
| **Contact** | Business email, phone, website, address |
| **Receipt** | Header/footer text, what info to show on receipts |
| **Business** | Business type (Retail, Restaurant, Laundry, Service), Tax ID |
| **Tax** | Enable tax, rate, label |
| **Notifications** | Low stock alerts, email/SMS settings |
| **Hardware** | Printer type, barcode scanner, cash drawer |
| **Features** | Enable/disable: Inventory, Categories, Discounts, Loyalty, Bookings |

### 5.5 Audit Logs

1. Go to **Admin > Audit Logs**
2. View all system activity:
   - Who did what, when, and from where (IP address)
   - Filters: action type, entity type, user, date range
3. Actions tracked include:
   - Login/logout
   - Create, update, delete operations
   - Transaction processing, cancellation, refunds
   - Stock adjustments and purchases
   - Discount creation and usage
   - Attendance clock in/out
   - Invoice creation, updates, payments

### 5.6 Data Backup

1. Go to **Admin > Backup & Reset**
2. **Create Backup**: Generates a JSON backup of all data
   - Local backup stored in `/backups` directory
   - Cloud backup to S3 (if configured with `BACKUP_S3_*` environment variables)
   - Automatic rotation keeps the last 7 backups
3. **Restore**: Upload a backup file to restore data

### 5.7 Subscription Management

1. Go to **Admin > Subscriptions**
2. View current plan, billing cycle, and usage
3. Available plans control feature access:
   - Number of users, branches, products
   - Feature flags (reports, inventory, bookings, etc.)
   - BIR compliance features
4. Trial subscriptions have full access for a limited time

---

## 6. Common Workflows

### 6.1 Daily Opening Procedure

1. **Log in** to the system
2. **Clock in** via Attendance
3. **Open cash drawer** - Count and enter opening amount
4. **Check inventory** - Review low stock alerts
5. **Review pending bookings** for the day (if applicable)
6. Begin processing sales

### 6.2 Daily Closing Procedure

1. **Close cash drawer**:
   - Count all cash
   - Enter closing amount
   - Review shortage/overage
   - Add notes for any discrepancies
2. **Review daily sales** in Reports > Sales (Daily)
3. **Check VAT report** if needed for BIR records
4. **Export sales journal** if required (CSV/Excel/PDF)
5. **Clock out** via Attendance
6. **Log out** of the system

### 6.3 Handling a Customer Return

1. Go to **POS > Refund** or **Transactions**
2. Find the original transaction (by receipt number or date)
3. Select items being returned
4. Enter the reason for return
5. Process the refund
6. Stock is automatically restored
7. Refund receipt is generated

### 6.4 Handling a Voided Transaction

1. Go to **Transactions**
2. Find the transaction
3. Change status to **Cancelled**
4. Enter reason for cancellation
5. The transaction is marked as cancelled (not deleted) for BIR compliance

### 6.5 End-of-Month BIR Reporting

1. Go to **Reports > VAT**
2. Set date range to the full month
3. Note the following for BIR Form 2550M:
   - **VAT Sales** - Total taxable sales
   - **Non-VAT Sales** - Total exempt sales
   - **VAT Amount** - Total VAT collected
4. Go to **Reports > Sales Journal**
5. Export the full month's data to Excel for record-keeping
6. Keep records for **10 years** as required by BIR

---

## 7. Reports Reference

### How to Export Reports

The **Sales Journal** tab provides full export capability:

1. Go to **Reports > Sales Journal**
2. Set your date range
3. Click one of:
   - **Export CSV** - Opens in Excel, Google Sheets
   - **Export Excel** - Native .xlsx format with formatting
   - **Export PDF** - For printing or email attachment

### Report Descriptions

| Report | Best For | Key Metrics |
|--------|----------|-------------|
| **Sales** | Daily/weekly performance tracking | Total sales, transaction count, avg transaction, payment breakdown |
| **Products** | Identifying best sellers | Top 20 products by revenue, quantity sold |
| **VAT** | BIR tax filing (Form 2550M/Q) | VAT sales, non-VAT sales, VAT collected |
| **Profit & Loss** | Business health overview | Revenue, expenses, gross profit, net profit, margin % |
| **Cash Drawer** | Cash accountability | Opening/closing amounts, shortages, overages |
| **Sales Journal** | Detailed transaction audit | Every transaction with receipt #, items, discounts, tax, total |

---

## 8. Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Can't log in** | Check email/password. If locked out, ask admin to reset your password. |
| **Product not showing in POS** | Check if the product is active. Check category filters. Check if stock is 0 and "Allow Out of Stock Sales" is off. |
| **Discount code not working** | Check: Is the code valid (dates)? Has it reached usage limit? Does the cart meet minimum purchase? |
| **Receipt not printing** | Check printer connection in Settings > Hardware. Try Browser print as fallback. |
| **Cash drawer won't open** | Check hardware settings. Ensure cash drawer is connected to the receipt printer. |
| **Stock count doesn't match** | Go to Admin > Stock Movements to review history. Use Adjustment to correct after physical count. |
| **Can't access a feature** | Your role may not have permission. Contact your admin. Also check if the feature is enabled in Settings. |
| **Transaction not found** | Check date range filter. Try searching by receipt number. Note: soft-deleted transactions are hidden from listings. |

### Getting Help

- Contact your system administrator for access or permission issues
- For technical issues, check the audit logs for error details
- BIR compliance questions: refer to the `/docs/bir/` folder for detailed documentation

---

*This guide is for LocalPro POS. For technical/developer documentation, see `/docs/README.md`.*
