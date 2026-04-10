# LocalPro POS — Full Feature Documentation & Test Checklist

> **Version:** Current (April 2026)  
> **Stack:** Next.js 16, React 19, MongoDB/Mongoose, Tailwind CSS 4  
> **Architecture:** Multi-tenant, role-based, multi-language (en/es), PWA-capable

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication & Security](#2-authentication--security)
3. [Point of Sale (POS)](#3-point-of-sale-pos)
4. [Product & Inventory Management](#4-product--inventory-management)
5. [Customer Management (CRM)](#5-customer-management-crm)
6. [Bookings & Appointments](#6-bookings--appointments)
7. [Transactions & Payments](#7-transactions--payments)
8. [Cash Drawer Management](#8-cash-drawer-management)
9. [Loyalty Program](#9-loyalty-program)
10. [Discounts & Promotions](#10-discounts--promotions)
11. [Workforce Management](#11-workforce-management)
12. [Reporting & Analytics](#12-reporting--analytics)
13. [Settings & Configuration](#13-settings--configuration)
14. [Multi-Branch Management](#14-multi-branch-management)
15. [Restaurant Features](#15-restaurant-features)
16. [Expense Tracking](#16-expense-tracking)
17. [Webhooks & API Keys](#17-webhooks--api-keys)
18. [Automation System](#18-automation-system)
19. [Super Admin Panel](#19-super-admin-panel)
20. [Offline Mode](#20-offline-mode)
21. [Subscription & Feature Flags](#21-subscription--feature-flags)
22. [Audit Logs](#22-audit-logs)

---

## 1. Architecture Overview

### Multi-Tenant Routing

Every tenant gets an isolated workspace accessed via:

```
/{tenant-slug}/{language}/{page}
```

Example: `/acme-store/en/admin/products`

- All database queries are scoped by `tenantId`
- Each tenant has its own settings, branding, users, and data
- Subdomain and custom domain routing is supported

### Role Hierarchy

| Role | Access Level |
|------|-------------|
| `super_admin` | Platform-wide, all tenants |
| `owner` | Full access within their tenant |
| `admin` | Most tenant features, no billing/danger zones |
| `manager` | POS, inventory, reports, staff oversight |
| `cashier` | POS, basic reports, own attendance |
| `viewer` | Read-only dashboards |

### URL Patterns

| Area | Pattern |
|------|---------|
| Tenant dashboard | `/[tenant]/[lang]/` |
| Tenant login | `/[tenant]/[lang]/login` |
| Admin area | `/[tenant]/[lang]/admin/[page]` |
| Super admin | `/super-admin/[page]` |
| Public landing | `/` |

---

## 2. Authentication & Security

### Features

- **Email + Password login** — bcrypt-hashed passwords, JWT issued on success
- **PIN login** — Short numeric PIN for fast staff login at POS
- **QR Code login** — Scan a staff QR code to authenticate instantly
- **Multi-Factor Authentication (MFA)** — TOTP-based setup, verify, and disable
- **Customer OTP login** — SMS/email OTP for customer-facing authentication
- **HTTP-only JWT cookies** — Prevents XSS token theft
- **Session expiration** — Automated session cleanup via automation
- **Password reset** — Token-based reset flow via email
- **Profile management** — Update name, email, PIN, QR code

### Flow

```
1. User visits /{tenant}/{lang}/login
2. Enters email + password OR PIN OR scans QR code
3. Server validates credentials → issues JWT in HTTP-only cookie
4. (Optional) MFA verification prompt if MFA is enabled
5. Redirect to dashboard based on role
6. Protected routes check JWT on every request via middleware
7. Tenant access guard ensures user belongs to that tenant
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Email/password login |
| POST | `/api/auth/logout` | Logout, clear cookie |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/profile` | Update profile |
| POST | `/api/auth/change-password` | Change password |
| POST | `/api/auth/reset-password` | Reset password via email |
| POST | `/api/auth/qr-code` | Generate staff QR code |
| POST | `/api/auth/login-qr` | QR code login |
| POST | `/api/auth/mfa/setup` | Setup MFA |
| POST | `/api/auth/mfa/verify` | Verify MFA token |
| POST | `/api/auth/mfa/login` | MFA-gated login |
| POST | `/api/auth/mfa/disable` | Disable MFA |
| POST | `/api/auth/pin` | Set staff PIN |
| POST | `/api/auth/pin/verify` | Login with PIN |
| POST | `/api/auth/register` | Register new tenant account |
| POST | `/api/auth/customer/send-otp` | Send customer OTP |
| POST | `/api/auth/customer/verify-otp` | Verify customer OTP |

### Test Checklist

- [ ] Email login with valid credentials → JWT cookie set, redirect to dashboard
- [ ] Email login with wrong password → error message shown, no cookie
- [ ] PIN login with correct PIN → authenticated
- [ ] PIN login with wrong PIN → rejected
- [ ] QR code generation → unique token QR displayed
- [ ] QR code login → scan authenticates user
- [ ] MFA setup → QR code shown, TOTP app enrollment works
- [ ] MFA verification with correct code → access granted
- [ ] MFA verification with wrong code → access denied
- [ ] MFA disable → MFA removed, normal login works again
- [ ] Customer OTP send → OTP delivered via configured channel
- [ ] Customer OTP verify with correct code → authenticated
- [ ] Customer OTP verify with expired code → rejected
- [ ] `/api/auth/me` with valid cookie → returns user data
- [ ] `/api/auth/me` with no cookie → 401 response
- [ ] Logout → cookie cleared, redirect to login
- [ ] Password reset email sent → token link received
- [ ] Password reset with valid token → password updated
- [ ] Password reset with expired token → rejected
- [ ] Role-based redirect: owner goes to admin dashboard, cashier to POS
- [ ] Cross-tenant access: user cannot access another tenant's data
- [ ] MFA is enforced on next login after setup

---

## 3. Point of Sale (POS)

### Features

- **Product search** — Search by name, SKU, barcode
- **Barcode/QR scanner** — Hardware and camera-based scanning
- **Cart management** — Add, remove, update quantities
- **Product variations** — Select size/color/type at add-to-cart
- **Bundle products** — Add bundle, deducts composite stock
- **Discount application** — Code-based or manual discount
- **Customer attachment** — Link a customer to the transaction
- **Loyalty redemption** — Redeem loyalty points at checkout
- **Real-time stock validation** — Prevents overselling
- **Saved carts** — Save and resume carts
- **Multiple payment methods** — Cash, card, digital wallet, BNPL, QR, tap-to-pay
- **Split payment** — Pay with multiple methods
- **Receipt printing** — Print or email receipt after sale
- **Customer display screen** — Secondary display for customer view
- **Offline mode** — Queue transactions when network is unavailable

### Flow

```
1. Cashier opens POS screen
2. Search/scan product → added to cart
3. (Optional) Select variation
4. (Optional) Apply discount code
5. (Optional) Attach customer → loyalty points shown
6. Proceed to checkout
7. Select payment method(s) → enter amounts
8. Confirm payment → transaction created, stock deducted
9. Print/email receipt
10. (Optional) Loyalty points awarded
```

### API Endpoints (POS-specific)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/saved-carts` | List saved carts |
| POST | `/api/saved-carts` | Save current cart |
| GET | `/api/saved-carts/[id]` | Get saved cart |
| DELETE | `/api/saved-carts/[id]` | Delete saved cart |
| GET | `/api/pos/session/[sessionId]` | Get POS session state |
| GET | `/api/discounts/validate` | Validate promo code at checkout |
| GET | `/api/payments` | List payment records |
| POST | `/api/payments` | Create payment entry |
| POST | `/api/payments/[id]/refund` | Refund payment |
| POST | `/api/paypal/create-payment` | Create PayPal payment order |
| POST | `/api/paypal/success` | Capture PayPal payment on success |
| POST | `/api/paypal/cancel` | Handle PayPal payment cancellation |
| GET | `/api/invoices` | List invoices |
| POST | `/api/invoices` | Create invoice |
| GET | `/api/invoices/[id]` | Get invoice |
| POST | `/api/invoices/from-transaction` | Create invoice from transaction |
| GET | `/api/health` | API health check |

### Test Checklist

- [ ] Product search by name returns matching results
- [ ] Product search by SKU returns exact match
- [ ] Barcode scan adds correct product to cart
- [ ] QR code scan adds correct product to cart
- [ ] Adding product with variations → variation selector appears
- [ ] Adding bundle product → all bundle components deducted from stock
- [ ] Increasing quantity in cart → stock validated in real-time
- [ ] Adding quantity beyond stock → error or warning shown
- [ ] Removing item from cart → cart total updates
- [ ] Applying valid discount code → discount reflected in total
- [ ] Applying invalid discount code → error message shown
- [ ] Attaching customer → customer name shown in cart
- [ ] Loyalty points balance shown when customer attached
- [ ] Redeeming loyalty points → amount deducted from total
- [ ] Cash payment → correct change calculated
- [ ] Card payment → transaction recorded
- [ ] Split payment → two payment methods recorded on same transaction
- [ ] BNPL payment → transaction marked correctly
- [ ] Receipt modal shown after sale
- [ ] Email receipt → customer receives email
- [ ] Print receipt → print dialog triggered
- [ ] Save cart → appears in saved carts list
- [ ] Resume saved cart → items restored
- [ ] Offline transaction → queued, synced when online
- [ ] Customer display screen updates in real-time with cart
- [ ] Completed transaction → stock levels updated immediately

---

## 4. Product & Inventory Management

### Features

- **Product CRUD** — Create, read, update, delete products
- **Categories** — Organize products by category
- **SKU & barcode** — Unique identifiers, barcode generation
- **Product images** — Upload and display via S3
- **Product variations** — Size, color, type with per-variation stock and price
- **Product bundles** — Group products, composite stock management
- **Stock tracking** — Per-branch stock levels
- **Stock movements** — Full audit trail (sale, purchase, adjustment, return, transfer, damage)
- **Low stock alerts** — Configurable threshold, real-time indicators
- **Real-time stock sync** — SSE-based multi-device sync
- **Product batches** — Batch/lot tracking
- **Pricing** — Base price, cost price, sale price
- **BIR compliance fields** — Required for Philippine tax compliance

### Flow

```
Products:
  Admin creates product → set name, price, stock, category
  Optional: add variations → each gets own stock/price
  Optional: set low stock threshold
  Stock tracked automatically on every sale/refund/adjustment

Stock Movements:
  Every stock change creates a StockMovement record
  Types: sale, purchase, adjustment, return, damage, transfer
  Viewable in /admin/stock-movements with filters
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List/search products |
| POST | `/api/products` | Create product |
| GET | `/api/products/[id]` | Get product |
| PUT | `/api/products/[id]` | Update product |
| DELETE | `/api/products/[id]` | Delete product |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |
| GET | `/api/bundles` | List bundles |
| POST | `/api/bundles` | Create bundle |
| GET | `/api/bundles/[id]` | Bundle details |
| GET | `/api/bundles/analytics` | Bundle performance |
| GET | `/api/inventory/low-stock` | Low stock items |
| GET | `/api/inventory/realtime` | SSE real-time updates |
| GET | `/api/stock-movements` | Stock movement history |
| POST | `/api/stock-movements` | Manual stock adjustment |
| GET | `/api/products/[id]/pin` | Pin/unpin product for quick POS access |
| POST | `/api/products/[id]/refill` | Refill stock for product |
| POST | `/api/products/suggest-image` | AI-suggested product image |
| GET | `/api/product-batches` | List batches |
| POST | `/api/product-batches` | Create batch |
| GET | `/api/product-batches/expiring` | List expiring batches |
| GET | `/api/stock-movements` | Stock movement history |
| POST | `/api/stock-movements` | Manual stock adjustment |
| GET | `/api/suppliers` | List suppliers |
| POST | `/api/suppliers` | Create supplier |

### Test Checklist

- [ ] Create product with all required fields → appears in product list
- [ ] Create product without required fields → validation error
- [ ] Edit product name/price → changes saved and reflected in POS
- [ ] Delete product → removed from list, cannot be added to POS
- [ ] Upload product image → image displayed in product card
- [ ] Create category → appears in category filter
- [ ] Assign product to category → filterable in POS
- [ ] Create product variation (size/color) → selectable at POS
- [ ] Each variation has independent stock level
- [ ] Create bundle → bundle appears in POS
- [ ] Selling bundle → all component stocks deducted correctly
- [ ] Set low stock threshold → alert appears when stock drops below
- [ ] Real-time stock update → other device sees stock change without refresh
- [ ] Stock movement created on every sale (type: sale)
- [ ] Stock movement created on manual adjustment
- [ ] Stock movement created on refund (type: return)
- [ ] View stock movements filtered by date, type, product
- [ ] Low stock page lists all products below threshold
- [ ] Generate barcode for product → barcode image displayed
- [ ] Generate QR code for product → QR image displayed
- [ ] Scan barcode in POS → product added to cart
- [ ] Product batch creation → batch linked to product
- [ ] SKU uniqueness enforced within tenant

---

## 5. Customer Management (CRM)

### Features

- **Customer profiles** — Name, contact info, address, notes
- **Purchase history** — All transactions linked to customer
- **Customer segmentation** — Group customers by behavior/value
- **Engagement scoring** — Automated scoring based on activity
- **Lifetime value (LTV)** — Calculated and stored
- **Churn detection** — Identify at-risk customers
- **Customer OTP auth** — Secure customer login
- **Campaign management** — Marketing campaigns and targeting
- **Customer-level discounts** — Apply discounts to specific customers

### Flow

```
1. Create customer at POS or in admin
2. Attach customer to transactions
3. Engagement score updated automatically by automation
4. LTV calculated based on transaction history
5. Segments updated based on behavior triggers
6. Campaigns target segments
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/customers` | List customers |
| POST | `/api/customers` | Create customer |
| GET | `/api/customers/[id]` | Get customer |
| PUT | `/api/customers/[id]` | Update customer |
| GET | `/api/customers/[id]/profile` | Full customer profile with LTV, history |
| PUT | `/api/customers/[id]` | Update customer |
| DELETE | `/api/customers/[id]` | Delete customer |
| GET | `/api/transactions/customer/[customerId]` | Customer transaction history |
| GET | `/api/crm/segments` | List customer segments |
| POST | `/api/crm/segments` | Create customer segment |
| GET | `/api/crm/campaigns` | List marketing campaigns |
| POST | `/api/crm/campaigns` | Create campaign |
| POST | `/api/crm/campaigns/[id]/send` | Send campaign to segment |
| GET | `/api/loyalty/customers/[customerId]` | Customer loyalty details |
| POST | `/api/loyalty/adjust` | Manual loyalty points adjustment |
| GET | `/api/client/profile` | Client-facing own profile |
| PUT | `/api/client/profile` | Update own client profile |
| GET | `/api/client/address` | Client saved addresses |
| POST | `/api/client/address` | Add client address |
| PUT | `/api/client/address/[addressId]` | Update client address |
| DELETE | `/api/client/address/[addressId]` | Delete client address |

### Test Checklist

- [ ] Create customer with name and phone → appears in customer list
- [ ] Search customer by name in POS → correct result
- [ ] Search customer by phone → correct result
- [ ] View customer profile → purchase history shown
- [ ] Attach customer to transaction → linked in transaction record
- [ ] Customer LTV updated after transaction
- [ ] Engagement score changes after activity
- [ ] Inactive customer flagged for churn risk
- [ ] Customer notes saved and visible on profile
- [ ] Customer OTP send → OTP received
- [ ] Customer OTP verify → customer authenticated
- [ ] Edit customer info → changes saved
- [ ] Delete customer → removed from list (check linked transactions remain)
- [ ] Customer segmentation grouping works
- [ ] Campaign created and linked to customer segment

---

## 6. Bookings & Appointments

### Features

- **Booking creation** — Date, time, service, staff, customer
- **Calendar view** — Visual booking calendar
- **Time slot availability** — Real-time slot checking
- **Booking statuses** — Pending, confirmed, completed, cancelled, no-show
- **Reminders** — Automated email/SMS reminders
- **Recurring bookings** — Template-based recurring appointments
- **Booking confirmations** — Auto-send on create/confirm
- **Booking notes** — Internal and customer-facing notes
- **Walk-in support** — Instant booking without advance scheduling

### Flow

```
1. Admin/staff creates booking for customer
2. Select service, staff member, date/time
3. System checks availability → slot confirmed
4. Confirmation sent to customer (email/SMS)
5. Reminder sent N hours before appointment
6. Staff marks booking complete after service
7. Transaction created on completion (if applicable)
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bookings` | List bookings |
| POST | `/api/bookings` | Create booking |
| GET | `/api/bookings/[id]` | Get booking |
| PUT | `/api/bookings/[id]` | Update booking |
| GET | `/api/bookings/[id]` | Get booking details |
| PUT | `/api/bookings/[id]` | Update booking (status, time, notes) |
| DELETE | `/api/bookings/[id]` | Cancel booking |
| POST | `/api/bookings/[id]/reminder` | Send manual reminder |
| GET | `/api/bookings/customer/[customerId]` | Bookings by customer |
| GET | `/api/bookings/time-slots` | Available time slots |
| GET | `/api/booking/availability` | Availability check |
| POST | `/api/bookings/reminders/send` | Bulk send booking reminders |

### Test Checklist

- [ ] Create booking with all required fields → appears in calendar
- [ ] Create booking for already-taken slot → conflict error shown
- [ ] View calendar → bookings shown on correct dates
- [ ] Confirmation email/SMS sent on booking creation
- [ ] Reminder sent N hours before appointment time
- [ ] Update booking time → confirmation re-sent
- [ ] Cancel booking → status updated, slot freed
- [ ] Mark booking as no-show → status updated
- [ ] Complete booking → transaction can be created
- [ ] Recurring booking template created
- [ ] Recurring booking generates correct future bookings
- [ ] Walk-in booking created instantly
- [ ] Time slot availability respects business hours
- [ ] Time slot availability respects existing bookings
- [ ] Filter bookings by date range
- [ ] Filter bookings by staff member
- [ ] Filter bookings by status

---

## 7. Transactions & Payments

### Features

- **Transaction history** — Full list with filters
- **Transaction statuses** — Completed, cancelled, refunded
- **Refunds** — Full or partial refund, auto stock restore
- **Payment methods** — Cash, card, digital wallet, BNPL, QR, tap-to-pay
- **Split payments** — Multiple methods on one transaction
- **Manual transactions** — Create transactions outside POS
- **Receipt generation** — PDF/print/email
- **Transaction stats** — Aggregated analytics
- **VAT/tax calculation** — Per-item tax rules applied at checkout

### Flow

```
Sale:
  POS checkout → Transaction created (status: completed)
  Stock deducted → Loyalty points awarded → Receipt generated

Refund:
  Admin initiates refund on transaction
  Full/partial amount selected
  Stock restored for returned items
  Loyalty points deducted if originally awarded
  Refund recorded as separate payment entry
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | List transactions |
| POST | `/api/transactions` | Create transaction |
| GET | `/api/transactions/[id]` | Transaction details |
| POST | `/api/transactions/[id]/refund` | Process refund |
| POST | `/api/transactions/manual` | Manual transaction |
| GET | `/api/transactions/stats` | Transaction statistics |
| GET | `/api/transactions/customer/[id]` | Customer transactions |

### Test Checklist

- [ ] Completed sale appears in transaction list
- [ ] Transaction shows correct items, quantities, prices
- [ ] Transaction shows correct payment method
- [ ] Transaction shows customer if attached
- [ ] Tax amount calculated and shown correctly
- [ ] Filter transactions by date range
- [ ] Filter transactions by payment method
- [ ] Filter transactions by status
- [ ] Filter transactions by cashier
- [ ] Full refund → status changes to refunded, stock restored
- [ ] Partial refund → partial stock restored, amount correct
- [ ] Refund deducts loyalty points if applicable
- [ ] Receipt PDF generated correctly
- [ ] Email receipt delivered to customer
- [ ] Manual transaction created and appears in list
- [ ] Split payment → both payment entries recorded
- [ ] Transaction stats match sum of individual transactions
- [ ] VAT/tax shown per item on receipt
- [ ] Cancelled transaction does not affect stock

---

## 8. Cash Drawer Management

### Features

- **Session tracking** — Open and close cash drawer sessions
- **Opening float** — Record starting cash amount
- **Cash count** — Count denominations during session
- **Cash-in/cash-out** — Record cash movements
- **Closing count** — Final cash count, shortage/overage detection
- **Session reports** — Summary per session
- **Auto-close automation** — Auto-closes forgotten sessions
- **Cash count reminders** — Automated reminders to count cash

### Flow

```
1. Cashier opens drawer session → enters opening float
2. Transactions during shift tracked against session
3. Mid-shift cash count (optional)
4. End of shift → closing count entered
5. System calculates: expected vs actual → shortage/overage shown
6. Session closed and saved to report
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cash-drawer/sessions` | List drawer sessions |
| POST | `/api/cash-drawer/sessions` | Open session, close session, cash-in, cash-out, count |
| GET | `/api/hardware/cash-drawer-kick` | Trigger hardware cash drawer open |

### Test Checklist

- [ ] Open drawer session with opening float → session started
- [ ] Cannot open two sessions simultaneously
- [ ] Cash-in entry recorded during session
- [ ] Cash-out entry recorded during session
- [ ] Mid-shift cash count saved
- [ ] Close session → shortage/overage calculated correctly
- [ ] Session report shows all entries
- [ ] Auto-close triggers on forgotten open sessions
- [ ] Cash count reminder notification sent
- [ ] Session history viewable in admin
- [ ] Filter sessions by date, branch, cashier

---

## 9. Loyalty Program

### Features

- **Points configuration** — Points-per-currency-unit, redemption rate
- **Points earning** — Automatically awarded on transactions
- **Points redemption** — Redeem at POS checkout
- **Points balance** — Shown in customer profile and POS
- **Points history** — Full transaction log of points earned/redeemed
- **Points adjustment** — Manual admin adjustment with reason
- **Per-customer loyalty view** — Detailed customer loyalty details
- **Loyalty customer list** — All customers with points balance

### Flow

```
Configuration:
  Admin sets: earn rate (e.g., 1 point per $1)
  Admin sets: redeem rate (e.g., 100 points = $1)

Earning:
  Customer completes transaction → points calculated → awarded

Redeeming:
  Cashier attaches customer → points balance shown
  Cashier applies points → amount deducted from total
  Points deducted from balance on completion
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loyalty/config` | Loyalty configuration (earn/redeem rates) |
| PUT | `/api/loyalty/config` | Update loyalty configuration |
| POST | `/api/loyalty/adjust` | Manual points adjustment for a customer |
| GET | `/api/loyalty/customers/[customerId]` | Customer loyalty balance and history |

### Test Checklist

- [ ] Configure loyalty program with earn/redeem rates
- [ ] Points earned automatically on transaction completion
- [ ] Points amount is correct per configured earn rate
- [ ] Points balance shown on customer profile
- [ ] Points balance shown at POS when customer attached
- [ ] Redeem points at POS → correct discount applied
- [ ] Points deducted from balance after redemption
- [ ] Points refunded when transaction is refunded
- [ ] Manual points adjustment recorded with reason
- [ ] Loyalty transaction history shows all entries
- [ ] Loyalty customer list sorted by points balance
- [ ] Customer with zero points not shown in loyalty list (or clearly indicated)
- [ ] Loyalty program can be disabled per tenant

---

## 10. Discounts & Promotions

### Features

- **Discount types** — Percentage or fixed amount
- **Code-based discounts** — Customer enters promo code
- **Usage limits** — Max total uses or per-customer uses
- **Date validity** — Start and end date for discount
- **Minimum order amount** — Threshold to activate discount
- **Product-specific discounts** — Apply only to specific products/categories
- **Customer-specific discounts** — Target specific customers
- **Discount validation** — Real-time validation at POS
- **Seed defaults** — Load default discount templates

### Flow

```
1. Admin creates discount code with type (% or fixed), amount, and validity dates
2. (Optional) Set max uses, per-customer limit, minimum order amount
3. (Optional) Restrict to specific products or categories
4. At POS: cashier enters code → real-time validation runs
5. Validation checks: active, within dates, usage limit, minimum order met
6. Discount applied to cart total
7. On transaction completion → usage count incremented
8. Expired discounts auto-deactivated by overnight automation
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/discounts` | List discounts |
| POST | `/api/discounts` | Create discount |
| GET | `/api/discounts/[id]` | Discount details |
| PUT | `/api/discounts/[id]` | Update discount |
| DELETE | `/api/discounts/[id]` | Delete discount |
| POST | `/api/discounts/validate` | Validate code at checkout |

### Test Checklist

- [ ] Create percentage discount → correct % applied at checkout
- [ ] Create fixed discount → correct amount deducted
- [ ] Apply valid code at POS → discount applied
- [ ] Apply expired code → error message shown
- [ ] Apply code below minimum order amount → error shown
- [ ] Apply code that reached usage limit → error shown
- [ ] Apply code to correct product category → only applies to matching products
- [ ] Apply code to specific customer only → fails for other customers
- [ ] Discount usage count increments on each use
- [ ] Discount deactivated after end date passes
- [ ] Edit discount → changes take effect immediately
- [ ] Delete discount → code no longer works
- [ ] List discounts shows active/inactive status

---

## 11. Workforce Management

### Features

- **User management** — Create, edit, delete staff accounts
- **Role assignment** — Owner, admin, manager, cashier, viewer
- **Attendance** — Clock in/out with GPS location capture
- **Break tracking** — Log and track break time
- **Shift management** — Define and assign shifts
- **Commission tracking** — Rules-based commission calculation
- **Commission rules** — % per sale, per product, per category
- **Staff reports** — Performance, hours, commissions
- **Attendance notifications** — Alerts for violations
- **Auto clock-out** — Automation closes forgotten sessions

### Flow

```
Attendance:
  Staff clocks in → location captured → session opened
  (Optional) Take break → break recorded
  End of shift → clock out → hours calculated

Commissions:
  Sale completed → commission rules evaluated
  Commission amount calculated and stored
  Admin views commission report per staff member
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users |
| POST | `/api/users` | Create user |
| GET | `/api/users/[id]` | Get user |
| PUT | `/api/users/[id]` | Update user |
| DELETE | `/api/users/[id]` | Delete user |
| GET | `/api/attendance` | List attendance records |
| POST | `/api/attendance` | Clock in/out |
| GET | `/api/attendance/current` | Current session |
| GET | `/api/shifts` | List shifts |
| POST | `/api/shifts` | Create shift |
| GET | `/api/commissions` | List commissions |
| GET | `/api/commissions/calculate` | Calculate commissions |
| GET | `/api/commission-rules` | List commission rules |
| POST | `/api/commission-rules` | Create commission rule |
| GET | `/api/shifts` | List shifts |
| POST | `/api/shifts` | Create shift |
| PUT | `/api/shifts/[id]/confirm` | Confirm shift |
| POST | `/api/shifts/swap-request` | Request shift swap |

### Test Checklist

- [ ] Create user with role → user can login
- [ ] Owner role → access to all admin features
- [ ] Cashier role → access to POS only, no admin
- [ ] Viewer role → read-only, cannot create/edit
- [ ] Edit user role → access changes on next login
- [ ] Deactivate user → cannot login
- [ ] Delete user → removed from user list
- [ ] Clock in → session opened, timestamp recorded
- [ ] Clock in twice → error (already clocked in)
- [ ] Clock out → session closed, hours calculated
- [ ] Clock out without clock in → error
- [ ] Break start recorded → break timer shown
- [ ] Break end recorded → break duration calculated
- [ ] GPS location captured on clock in (if enabled)
- [ ] Auto clock-out triggers for forgotten sessions
- [ ] Create shift → staff can be assigned
- [ ] Attendance violation notification triggered
- [ ] Commission rule created → triggers on qualifying sale
- [ ] Commission amount calculated correctly
- [ ] Commission history shows per-staff breakdown
- [ ] Staff performance report shows correct metrics

---

## 12. Reporting & Analytics

### Features

- **Dashboard KPIs** — Revenue, transactions, top products, period comparison
- **Sales reports** — Daily/weekly/monthly, trend charts
- **Product performance** — Top sellers, revenue by product
- **Staff performance** — Sales by cashier, commissions
- **Profit & loss** — Revenue vs. expenses
- **Tax/VAT reports** — Tax collected breakdown
- **Cash drawer reports** — Session summaries
- **Bundle analytics** — Bundle performance
- **Attendance trends** — Hours, violations, break patterns
- **Customer analytics** — LTV, engagement, churn risk
- **Upsell/cross-sell insights** — AI-powered product recommendations
- **Period filtering** — Today, week, month, custom range
- **Export** — PDF/CSV export (where applicable)

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/summary` | Dashboard KPIs |
| GET | `/api/reports/sales` | Sales report with period filter |
| GET | `/api/reports/products` | Product performance report |
| GET | `/api/reports/staff-performance` | Staff sales and commission report |
| GET | `/api/reports/profit-loss` | Profit and loss report |
| GET | `/api/reports/vat` | VAT/tax collected report |
| GET | `/api/reports/cash-drawer` | Cash drawer sessions report |
| GET | `/api/reports/sales-journal` | Sales journal (BIR compliance) |
| GET | `/api/reports/cas` | CAS report (BIR compliance) |
| GET | `/api/insights/upsell` | AI upsell/cross-sell recommendations |
| GET | `/api/insights/stock-predictions` | Predictive stock analytics |
| GET | `/api/bundles/analytics` | Bundle performance analytics |

### Test Checklist

- [ ] Dashboard shows today's revenue correctly
- [ ] Dashboard KPIs match sum of today's transactions
- [ ] Period filter (week/month/custom) updates all KPIs
- [ ] Sales trend chart matches transaction data
- [ ] Top products list is ordered by revenue/quantity
- [ ] Staff performance shows correct per-cashier breakdown
- [ ] Tax report shows correct VAT collected per period
- [ ] Cash drawer report shows sessions with shortage/overage
- [ ] Bundle analytics shows units sold and revenue
- [ ] P&L: revenue minus expenses = net profit
- [ ] Attendance trend chart reflects actual clock-in data
- [ ] Customer analytics shows correct LTV values
- [ ] Upsell recommendations appear on dashboard
- [ ] Report data matches raw transaction list totals
- [ ] Filter by branch → only branch-specific data shown
- [ ] Report respects tenant data isolation

---

## 13. Settings & Configuration

### Features

- **General settings** — Business name, address, contact, timezone, currency
- **Branding** — Logo, colors, fonts, themes, advanced customization
- **Localization** — Language, date format, time format, decimal separator
- **Business hours** — Daily schedule, break times
- **Holidays** — Single and recurring holiday calendar
- **Receipt templates** — Customizable HTML receipt
- **Notification templates** — Email/SMS templates for bookings, alerts
- **Tax rules** — Regional rules, category-based, priority ordering
- **Multi-currency** — Display currencies, exchange rates
- **Hardware** — Printer type, barcode scanner, cash drawer, touchscreen
- **Business type** — Retail, restaurant, laundry, service auto-configuration
- **BIR compliance** — Philippine Bureau of Internal Revenue fields
- **Feature flags** — Enable/disable individual features
- **API documentation** — Tenant API docs viewer
- **Backup & reset** — Data export and reset options
- **Sample data** — Load sample data for demos/testing

### Flow

```
1. Admin navigates to Settings in the admin panel
2. Changes are saved per-section via dedicated API endpoints
3. Changes apply immediately (no restart needed)
4. Business type change → relevant feature sections auto-show/hide
5. Receipt/notification templates are stored as HTML strings
6. Tax rules applied at checkout in priority order
7. Business hours enforced on booking time-slot availability
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tenants/[slug]/settings` | Get tenant settings |
| PUT | `/api/tenants/[slug]/settings` | Update tenant settings |
| GET | `/api/tenants/[slug]/business-hours` | Get business hours |
| PUT | `/api/tenants/[slug]/business-hours` | Update business hours |
| GET | `/api/tenants/[slug]/holidays` | List holidays |
| POST | `/api/tenants/[slug]/holidays` | Add holiday |
| GET | `/api/tenants/[slug]/receipt-templates` | Get receipt template |
| PUT | `/api/tenants/[slug]/receipt-templates` | Update receipt template |
| GET | `/api/tenants/[slug]/notification-templates` | Get notification templates |
| PUT | `/api/tenants/[slug]/notification-templates` | Update notification templates |
| GET | `/api/tenants/[slug]/bir-settings` | Get BIR compliance settings |
| PUT | `/api/tenants/[slug]/bir-settings` | Update BIR settings |
| GET | `/api/tenants/[slug]/exchange-rates` | Get exchange rates |
| PUT | `/api/tenants/[slug]/exchange-rates` | Update exchange rates |
| GET | `/api/tenants/[slug]/tax-rules` | Get tenant tax rules |
| GET | `/api/tax-rules` | List tax rules |
| POST | `/api/tax-rules` | Create tax rule |
| PUT | `/api/tax-rules/[id]` | Update tax rule |
| DELETE | `/api/tax-rules/[id]` | Delete tax rule |
| GET | `/api/business-types` | List available business type configs |
| POST | `/api/tenants/[slug]/seed-sample-data` | Load sample data |
| POST | `/api/tenants/[slug]/reset-collections` | Reset tenant data |
| POST | `/api/upload` | Upload file (logo, images) |
| GET | `/api/docs` | Tenant API documentation |

### Test Checklist

- [ ] Update business name → shown in header and receipts
- [ ] Upload logo → displayed in header and receipts
- [ ] Change primary color → UI reflects new color
- [ ] Change timezone → timestamps displayed in correct zone
- [ ] Change currency → all prices formatted correctly
- [ ] Set business hours → bookings outside hours rejected
- [ ] Add holiday → bookings on that date rejected
- [ ] Recurring holiday created → repeats yearly/monthly
- [ ] Edit receipt template → new format shown on next receipt
- [ ] Edit notification template → new text in next email/SMS
- [ ] Create tax rule → applied to correct product category
- [ ] Tax rules priority ordering → highest priority applied first
- [ ] Add display currency → prices shown in multiple currencies
- [ ] Hardware configuration saved → applied on device
- [ ] Enable feature flag → feature appears in navigation
- [ ] Disable feature flag → feature hidden
- [ ] Business type changed → relevant features auto-configured
- [ ] BIR fields filled → shown on receipts (Philippines only)
- [ ] Language change → UI switches to selected language

---

## 14. Multi-Branch Management

### Features

- **Branch CRUD** — Create, edit, delete branches
- **Per-branch stock** — Independent stock levels per branch
- **Stock transfers** — Transfer stock between branches
- **Branch-specific reports** — Filter all reports by branch
- **User-branch assignment** — Staff assigned to specific branches
- **Multi-branch sync** — Real-time sync across branches

### Flow

```
1. Owner creates branches in admin settings
2. Staff accounts assigned to specific branches
3. Each branch maintains independent stock levels
4. Transactions reduce stock at the branch where the sale occurs
5. Stock transfers move inventory between branches with audit trail
6. Reports can be filtered by branch for localized analytics
7. Low stock alerts fire per-branch based on branch stock levels
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/branches` | List all branches |
| POST | `/api/branches` | Create branch |
| GET | `/api/branches/[id]` | Get branch details |
| PUT | `/api/branches/[id]` | Update branch |
| DELETE | `/api/branches/[id]` | Delete branch |

### Test Checklist

- [ ] Create branch → appears in branch list
- [ ] Assign staff to branch → staff only sees that branch's data
- [ ] Stock is independent per branch
- [ ] Transfer stock between branches → both stock levels updated
- [ ] Low stock alert respects branch-specific levels
- [ ] Reports filtered by branch show only branch data
- [ ] Multi-branch sync → stock change on branch A visible on branch B
- [ ] Delete branch → data handled correctly

---

## 15. Restaurant Features

### Features

- **Table management** — Create tables, assign to floor plan
- **Floor map** — Visual floor layout
- **Order types** — Dine-in, takeout, delivery
- **Table assignment** — Assign order to table
- **Split billing** — Split bill among guests
- **Modifiers** — Product add-ons (e.g., extra sauce)
- **Allergen tracking** — Mark products with allergens
- **Kitchen display** — Orders sent to kitchen
- **Multi-guest orders** — Multiple customers on one table
- **Services** — Define bookable services (e.g., haircut, massage)

### Flow

```
Dine-in:
  1. Staff selects table from floor map
  2. Assigns order type: dine-in
  3. Adds products to table's order
  4. Order sent to kitchen display
  5. Items served → bill requested → payment processed

Takeout / Delivery:
  1. Select order type: takeout or delivery
  2. Add customer info (delivery: address required)
  3. Complete order normally

Table Management:
  Admin creates tables with number/name/capacity
  Floor map shows occupied (red) vs available (green) tables
  Table cleared after payment → status resets to available
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tables` | List tables |
| POST | `/api/tables` | Create table |
| GET | `/api/tables/[id]` | Get table |
| PUT | `/api/tables/[id]` | Update table (status, assignment) |
| DELETE | `/api/tables/[id]` | Delete table |
| GET | `/api/services` | List bookable services |
| POST | `/api/services` | Create service |

### Test Checklist

- [ ] Create table → appears on floor map
- [ ] Assign order to table → table status updates
- [ ] Dine-in order type selected → table required
- [ ] Takeout order type → no table required
- [ ] Delivery order type → delivery address required
- [ ] Modifier added to product → shown on kitchen order
- [ ] Allergen displayed on product
- [ ] Split bill → amounts split correctly among guests
- [ ] Multi-guest order → each guest's items tracked separately
- [ ] Table cleared → status resets to available
- [ ] Floor map shows occupied/available tables visually

---

## 16. Expense Tracking

### Features

- **Expense CRUD** — Create, edit, delete expenses
- **Categories** — Categorize expenses
- **Payment method** — Record how expense was paid
- **Date tracking** — Expense date for period filtering
- **P&L integration** — Expenses deducted in profit calculations
- **Soft delete** — Expenses marked inactive rather than hard-deleted

### Flow

```
1. Admin/manager creates expense entry with amount, category, date
2. (Optional) Add notes, vendor name, and payment method
3. Expense stored and scoped to tenant
4. Profit & loss report pulls all expenses in date range
5. Revenue minus expenses = net profit
6. Deleting an expense soft-deletes (marks isActive: false)
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses` | List expenses (with date/category filters) |
| POST | `/api/expenses` | Create expense |
| GET | `/api/expenses/[id]` | Get expense |
| PUT | `/api/expenses/[id]` | Update expense |
| DELETE | `/api/expenses/[id]` | Soft-delete expense |

### Test Checklist

- [ ] Create expense with amount, category, date → appears in list
- [ ] Edit expense → changes saved
- [ ] Delete expense → removed from list
- [ ] Expense appears in P&L report as deduction
- [ ] Filter expenses by date range
- [ ] Filter expenses by category
- [ ] Total expenses match P&L expense line

---

## 17. Webhooks & API Keys

### Features

- **Webhook subscriptions** — Subscribe to events (transaction.created, etc.)
- **Webhook delivery tracking** — Log of all webhook delivery attempts
- **Webhook retry** — Automatic retry of failed deliveries
- **Webhook test** — Send a test payload to a webhook URL
- **API keys** — Create, rotate, revoke API keys
- **Hashed storage** — API keys stored as SHA-256 hash, shown once on creation
- **API documentation** — Interactive API docs for developers

### Flow

```
Webhooks:
  1. Developer creates webhook with target URL and event types
  2. System event fires (e.g., transaction.created)
  3. POST request sent to webhook URL with event payload
  4. Delivery logged (status, response code, latency)
  5. On failure → automatic retry queued
  6. Developer can send test payload for debugging

API Keys:
  1. Developer creates API key (full 64-char key shown once)
  2. Key stored as SHA-256 hash in database
  3. Developer includes key in Authorization: Bearer <key> header
  4. Key validated on each request
  5. Rotate: old key revoked, new key generated
  6. Delete: key permanently revoked
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks` | List webhooks |
| POST | `/api/webhooks` | Create webhook |
| PATCH | `/api/webhooks/[id]` | Update webhook (enable/disable, URL, events) |
| DELETE | `/api/webhooks/[id]` | Delete webhook |
| GET | `/api/webhooks/[id]/deliveries` | Webhook delivery history |
| POST | `/api/webhooks/[id]/test` | Send test webhook payload |
| GET | `/api/api-keys` | List API keys (hashed, no raw key) |
| POST | `/api/api-keys` | Create API key (raw key returned once) |
| DELETE | `/api/api-keys/[id]` | Revoke API key |
| POST | `/api/api-keys/[id]/rotate` | Rotate API key |

### Test Checklist

- [ ] Create webhook with URL and event types → saved
- [ ] Transaction created → webhook delivered to URL
- [ ] Webhook delivery failure → retry logged in delivery history
- [ ] Disable webhook → deliveries stop
- [ ] Delete webhook → removed from list
- [ ] Create API key → key shown once on creation
- [ ] Rotate API key → old key invalidated, new key works
- [ ] Revoke API key → key no longer authenticates
- [ ] API request with valid key → request succeeds
- [ ] API request with invalid key → 401 response

---

## 18. Automation System

### Features (25+ Automations)

| Automation | Trigger | Action |
|-----------|---------|--------|
| Low Stock Alert | Stock below threshold | Notify admin/manager |
| Booking Reminder | N hours before booking | Email/SMS to customer |
| Booking Confirmation | Booking created | Email/SMS to customer |
| Auto Clock-Out | Shift end time | Close attendance session |
| Attendance Violation | Late clock-in / missed | Notify manager |
| Break Pattern Detection | Irregular breaks | Flag for review |
| Cash Drawer Auto-Close | End of day | Close open sessions |
| Cash Count Reminder | Scheduled time | Notify cashier |
| Abandoned Cart Notification | Cart idle > X minutes | Notify customer |
| Customer Welcome | New customer created | Send welcome message |
| Engagement Score Update | Daily | Recalculate all scores |
| Customer LTV Calculation | Daily | Update LTV values |
| Dynamic Pricing | Demand/time triggers | Adjust prices |
| Discount Management | Expiry date | Deactivate expired discounts |
| Expiry Alert | Product expiry date | Notify manager |
| Purchase Order Generation | Stock below reorder point | Generate PO |
| Data Archiving | Schedule | Archive old audit logs |
| Database Backup | Schedule | Backup database |
| Suspicious Activity | Unusual transaction pattern | Alert admin |
| Session Expiration | JWT expiry | Clean up sessions |
| Stock Level Prediction | Daily | Predict future stock needs |
| Multi-Branch Sync | Stock change | Sync to all branches |
| Offline Sync | Network restored | Sync offline transactions |
| Sales Trend Analytics | Daily | Update trend calculations |
| Transaction Receipt Email | Transaction complete | Email receipt to customer |

### API Endpoints

All automation routes are protected by `verifyCronAuth` (Bearer token) or internal cron scheduling. They accept both `GET` (with query params) and `POST` (with JSON body).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/automations/status` | Health status of all automations |
| GET/POST | `/api/automations/low-stock-alerts` | Low stock alert notifications |
| GET/POST | `/api/automations/booking-reminders` | Booking reminder emails/SMS |
| GET/POST | `/api/automations/bookings/confirm` | Booking confirmation messages |
| GET/POST | `/api/automations/bookings/no-show` | No-show booking handling |
| GET/POST | `/api/automations/attendance/auto-clockout` | Auto clock-out for open sessions |
| GET/POST | `/api/automations/attendance/violations` | Attendance violation alerts |
| GET/POST | `/api/automations/attendance/break-detection` | Break pattern detection |
| GET/POST | `/api/automations/cash-drawer/auto-close` | Auto-close open drawer sessions |
| GET/POST | `/api/automations/cash-drawer/reminders` | Cash count reminder notifications |
| GET/POST | `/api/automations/carts/abandoned` | Abandoned cart notifications |
| GET/POST | `/api/automations/customers/lifetime-value` | Recalculate customer LTV |
| GET/POST | `/api/automations/customers/engagement-score` | Recalculate engagement scores |
| GET/POST | `/api/automations/discounts/manage` | Deactivate expired discounts |
| GET/POST | `/api/automations/inventory/expiry-alerts` | Product expiry notifications |
| GET/POST | `/api/automations/purchase-orders` | Auto-generate purchase orders |
| GET/POST | `/api/automations/pricing/dynamic` | Dynamic pricing adjustments |
| GET/POST | `/api/automations/products/performance` | Product performance calculations |
| GET/POST | `/api/automations/stock/predictive` | Predictive stock analysis |
| GET/POST | `/api/automations/stock/transfer` | Inter-branch stock sync |
| GET/POST | `/api/automations/sync/multi-branch` | Multi-branch data sync |
| GET/POST | `/api/automations/sync/offline` | Offline transaction sync |
| GET/POST | `/api/automations/analytics/sales-trends` | Sales trend calculations |
| GET/POST | `/api/automations/reports/sales` | Automated sales report generation |
| GET/POST | `/api/automations/transaction-receipts` | Receipt email delivery |
| GET/POST | `/api/automations/sessions/expire` | JWT session cleanup |
| GET/POST | `/api/automations/subscriptions/expire` | Subscription expiry handling |
| GET/POST | `/api/automations/data/archive` | Audit log archiving |
| GET/POST | `/api/automations/backups/create` | Database backup |
| GET/POST | `/api/automations/security/suspicious-activity` | Suspicious activity detection |
| GET/POST | `/api/automations/audit-logs/cleanup` | Old audit log cleanup |
| POST | `/api/automations/triggers/evaluate` | Evaluate all automation triggers |
| POST | `/api/automations/webhooks/retry` | Retry failed webhook deliveries |
| GET | `/api/automation-triggers` | List configured automation triggers |
| POST | `/api/automation-triggers` | Create automation trigger |

### Test Checklist

- [ ] Low stock automation triggers when stock drops below threshold
- [ ] Booking reminder sent at correct time before appointment
- [ ] Booking confirmation sent immediately on creation
- [ ] Auto clock-out fires at shift end for open sessions
- [ ] Attendance violation notification sent for late clock-in
- [ ] Cash drawer auto-close runs at end of day
- [ ] Cash count reminder sent at configured time
- [ ] Abandoned cart notification sent after idle period
- [ ] Customer welcome email sent on new customer creation
- [ ] Engagement scores updated by daily automation
- [ ] LTV values updated after transaction creation
- [ ] Expired discounts auto-deactivated
- [ ] Receipt email sent automatically after sale
- [ ] Data archiving moves old logs without deleting recent ones
- [ ] Session cleanup removes expired JWT sessions
- [ ] Offline transactions synced when connectivity restored
- [ ] Automation status endpoint shows all automations health

---

## 19. Super Admin Panel

### Features

- **Tenant management** — Create, view, edit, delete tenants
- **Subscription plans** — Define plans with features and pricing
- **Subscriptions** — Assign plans to tenants, manage billing lifecycle
- **User management** — View and manage all non-super-admin users
- **Analytics** — Cross-tenant platform analytics (MRR, transactions, growth)
- **Business types** — Configure global business type definitions
- **System health** — MongoDB ping, collection stats
- **System logs** — Platform-wide audit log across all tenants
- **System seed** — Seed default subscription plans
- **Subscription actions** — Assign plan, extend trial, cancel, suspend, activate

### Flow

```
1. Super admin logs in at /super-admin/login
2. Separate JWT issued with role: super_admin, tenantId: ''
3. Auth cookie set (httpOnly) — valid for 7 days
4. Full access to all tenant data (no tenantId filter)
5. Create tenants → assign slug, name, currency, businessType
6. Create subscription plans with feature gates and pricing
7. Assign plan to tenant via subscriptions management
8. View cross-tenant analytics: MRR, top tenants, status breakdown
9. System health check: DB ping latency, collection sizes
10. Seed default plans (starter/pro/business/enterprise) with one POST
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/super-admin/auth/login` | Super admin login |
| GET | `/api/super-admin/auth/me` | Current super admin user |
| GET | `/api/super-admin/stats` | Platform-wide tenant/user counts |
| GET | `/api/super-admin/logs` | Cross-tenant audit logs |
| GET | `/api/super-admin/tenants` | List tenants (search, filter, paginate) |
| POST | `/api/super-admin/tenants` | Create tenant |
| GET | `/api/super-admin/tenants/[slug]` | Get tenant by slug |
| PUT | `/api/super-admin/tenants/[slug]` | Update tenant (name, domain, settings) |
| GET | `/api/super-admin/users` | List users across all tenants |
| PUT | `/api/super-admin/users/[id]` | Deactivate, activate, or change role |
| GET | `/api/super-admin/subscriptions` | List all subscriptions |
| GET | `/api/super-admin/subscriptions/[tenantSlug]` | Get subscription for tenant |
| PUT | `/api/super-admin/subscriptions/[tenantSlug]` | Manage subscription (assign-plan, extend-trial, cancel, suspend, activate) |
| GET | `/api/super-admin/plans` | List subscription plans |
| POST | `/api/super-admin/plans` | Create subscription plan |
| GET | `/api/super-admin/plans/[id]` | Get plan details |
| PUT | `/api/super-admin/plans/[id]` | Update plan |
| DELETE | `/api/super-admin/plans/[id]` | Delete plan (soft-delete if active subscriptions exist) |
| GET | `/api/super-admin/analytics` | Cross-tenant analytics (MRR, growth, top tenants) |
| GET | `/api/super-admin/system/health` | System health check |
| POST | `/api/super-admin/system/seed` | Seed default subscription plans |

### Test Checklist

- [ ] Super admin login → redirected to super admin dashboard
- [ ] Regular user cannot access /super-admin routes
- [ ] Create tenant → tenant can be logged into
- [ ] Edit tenant settings → changes applied
- [ ] Delete tenant → tenant inaccessible
- [ ] Create subscription plan with features → plan available to assign
- [ ] Assign plan to tenant → tenant features match plan
- [ ] Platform analytics show aggregated data across tenants
- [ ] Create super admin user → user can login to super admin panel
- [ ] System health check endpoint returns 200
- [ ] System logs show events from all tenants
- [ ] Business types configured here appear in tenant settings

---

## 20. Offline Mode

### Features

- **Offline detection** — Detects network loss
- **Offline indicator** — Visual indicator shown to user
- **Offline transactions** — Queue transactions locally (IndexedDB)
- **Sync on reconnect** — Auto-sync when network restores
- **Service worker** — PWA caching for offline access
- **Conflict resolution** — Handles stock conflicts discovered on sync

### Flow

```
1. Browser detects loss of network connectivity
2. Visual indicator displayed in the POS UI
3. Subsequent transactions stored in IndexedDB offline queue
4. App continues to function from cached data (service worker)
5. On network restore → sync automation triggered
6. Each queued transaction posted to /api/transactions
7. Stock levels updated after each synced transaction
8. Conflicts (e.g., oversold stock) flagged for staff review
9. Successfully synced transactions removed from queue
```

### Test Checklist

- [ ] Disconnect network → offline indicator appears
- [ ] Complete transaction while offline → queued locally
- [ ] Reconnect network → queued transactions synced
- [ ] Synced transactions appear in transaction history
- [ ] No duplicate transactions on sync
- [ ] App loads cached pages when offline (PWA)
- [ ] Stock levels updated after sync

---

## 21. Subscription & Feature Flags

### Features

- **Subscription plans** — Defined by super admin with feature gates and limits
- **Plan features** — Features enabled per plan (maxUsers, maxProducts, enableLoyalty, etc.)
- **Subscription guard** — Blocks access to gated features via SubscriptionGuard component
- **Feature flags** — Per-tenant manual overrides that supersede plan settings
- **Trial subscriptions** — Self-serve trial creation
- **Subscription activation** — PayPal payment capture on activation
- **Billing history** — Record of all billing events
- **Upgrade requests** — Tenant can request a plan upgrade
- **Subscription expiry** — Automation handles trial/expired/suspended status

### Flow

```
Plan Setup (Super Admin):
  1. Super admin creates subscription plans with features and pricing
  2. Plans have tiers: starter, pro, business, enterprise
  3. Each plan defines: maxUsers, maxProducts, maxBranches, enabled features

Tenant Subscription:
  1. New tenant starts with a trial via /api/subscriptions/create-trial
  2. Trial runs until trialEndDate
  3. Tenant activates by selecting plan + paying via PayPal
  4. Subscription status → active, planId stored
  5. SubscriptionGuard checks plan features on every gated page
  6. Feature flags can override plan for specific tenants

Expiry Handling:
  1. Daily automation checks trial end dates
  2. Expired trials → status: expired (features locked)
  3. Suspended subscriptions block access
  4. Super admin can manually assign plan, extend trial, cancel, or suspend
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/subscriptions` | List subscriptions (admin/owner) |
| POST | `/api/subscriptions` | Create subscription |
| GET | `/api/subscriptions/current` | Current tenant subscription |
| POST | `/api/subscriptions/create-trial` | Create trial subscription |
| POST | `/api/subscriptions/activate` | Activate with PayPal payment |
| GET | `/api/subscriptions/[id]` | Get subscription by ID |
| PUT | `/api/subscriptions/[id]` | Update subscription |
| DELETE | `/api/subscriptions/[id]` | Cancel subscription |
| GET | `/api/subscriptions/billing-history` | Billing history |
| POST | `/api/subscriptions/request-upgrade` | Request plan upgrade |
| GET | `/api/subscription/status` | Current subscription status check |
| GET | `/api/subscription-plans` | List available plans |
| POST | `/api/subscription-plans` | Create plan (admin) |
| GET | `/api/subscription-plans/[id]` | Get plan details |
| PUT | `/api/subscription-plans/[id]` | Update plan |

### Test Checklist

- [ ] Feature not in plan → blocked by SubscriptionGuard
- [ ] Feature in plan → accessible
- [ ] Feature flag overrides plan setting
- [ ] Expired subscription → features locked
- [ ] Subscription renewed → features restored
- [ ] Free plan limits enforced (e.g., max products)
- [ ] Upgrade plan → new features immediately accessible

---

## 22. Audit Logs

### Features

- **Action logging** — Every create/update/delete logged automatically
- **User attribution** — Who performed the action (userId)
- **Timestamp** — When the action occurred
- **Entity tracking** — What entity type and ID was changed
- **Change diff** — Before/after values stored in `changes` field
- **Metadata** — Additional context (IP address, role, etc.)
- **Tenant scoping** — Each tenant sees only their own logs
- **Archiving** — Old logs moved to archive collection by automation
- **Filtering** — Filter by user, action type, entity type, date range
- **Pagination** — Paginated results with configurable page size (max 200)
- **Super admin view** — Super admin can view logs across all tenants

### Flow

```
Automatic logging:
  1. Route handler calls createAuditLog() after any state-changing operation
  2. Log stored with: tenantId, userId, action, entityType, entityId, changes, metadata
  3. Tenant admin views logs at /admin/audit-logs

Filtering:
  1. Admin selects filters (user, action, entity type, date range)
  2. API returns paginated results
  3. Results limited to the authenticated tenant's data

Super Admin view:
  1. Super admin queries /api/super-admin/logs
  2. Can filter by tenantSlug (resolved to tenantId)
  3. Returns logs from all tenants when no tenant filter applied

Archiving:
  1. Nightly automation identifies logs older than retention period
  2. Old logs moved to archive collection
  3. Archived logs viewable through separate archive query
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/audit-logs` | List audit logs for current tenant (admin/owner only) |
| GET | `/api/super-admin/logs` | Cross-tenant audit logs (super admin only) |

### Test Checklist

- [ ] Create product → audit log entry created
- [ ] Update product → audit log entry with changed fields
- [ ] Delete product → audit log entry created
- [ ] Login → audit log entry created
- [ ] Refund processed → audit log entry created
- [ ] Filter audit log by user → shows only that user's actions
- [ ] Filter audit log by date range → correct entries shown
- [ ] Old logs archived → still viewable in archive
- [ ] Audit log cannot be edited or deleted by tenant users
- [ ] Super admin can view all tenant audit logs

---

## Appendix: Test Environment Setup

### Prerequisites
- MongoDB instance running
- Environment variables configured (`.env.local`)
- `pnpm install` dependencies installed
- `pnpm dev` running

### Key Environment Variables

```env
# Database
MONGODB_URI=                    # MongoDB connection string

# Auth
JWT_SECRET=                     # JWT signing secret (min 32 chars)
NEXTAUTH_SECRET=                # NextAuth secret

# File Uploads
AWS_S3_BUCKET=                  # S3 bucket for product images and uploads
AWS_ACCESS_KEY_ID=              # AWS access key
AWS_SECRET_ACCESS_KEY=          # AWS secret key
AWS_REGION=                     # AWS region (e.g., ap-southeast-1)

# Email
SENDGRID_API_KEY=               # SendGrid API key for email delivery
EMAIL_FROM=                     # Sender email address

# SMS
TWILIO_AUTH_TOKEN=              # Twilio auth token
TWILIO_ACCOUNT_SID=            # Twilio account SID
TWILIO_PHONE_NUMBER=           # Twilio from phone number

# Payments
PAYPAL_CLIENT_ID=               # PayPal client ID
PAYPAL_CLIENT_SECRET=          # PayPal client secret
PAYPAL_MODE=                    # sandbox | live

# Automation / Cron
CRON_SECRET=                    # Bearer token for cron route authentication

# App
NEXT_PUBLIC_APP_URL=            # Base URL (e.g., https://app.localpro.ph)
NODE_ENV=                       # development | production
```

### Running Tests

```bash
pnpm test              # Run unit tests (Vitest)
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage report
```

### Sample Data

Load sample data for a tenant via:  
`/[tenant]/[lang]/admin/sample-data`

---

*Last updated: April 2026*
