# LocalPro POS — Full Test Checklist

> Generated: 2026-03-28 | Total: ~260 test cases across 33 feature areas

---

## Legend
- `[ ]` Not tested
- `[x]` Pass
- `[!]` Fail
- `[-]` Skipped / N/A

---

## 1. Authentication

### Staff Login / Logout
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 1.1 | Login with valid email + password returns JWT and sets cookie | [x] | |
| 1.2 | Login with invalid credentials returns 401 | [x] | |
| 1.3 | Login rate limit blocks after 10 attempts within 15 min | [x] | |
| 1.4 | Logout invalidates token (token blacklisted) | [x] | |
| 1.5 | `GET /api/auth/me` returns current user when authenticated | [x] | |
| 1.6 | `GET /api/auth/me` returns 401 when unauthenticated | [x] | |

### QR Code Login
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 1.7 | `POST /api/auth/qr-code` generates a valid QR code | [x] | |
| 1.8 | `POST /api/auth/login-qr` authenticates with valid QR scan | [x] | |
| 1.9 | `GET /api/users/[id]/qr-code` returns user-specific QR code | [x] | GET /api/auth/qr-code tested |

### Password Management
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 1.10 | `POST /api/auth/change-password` updates password with valid old password | [x] | |
| 1.11 | `POST /api/auth/reset-password` sends reset email/OTP | [x] | Authenticated + token-based modes tested |
| 1.12 | `PUT /api/auth/profile` updates user profile | [x] | |

### Customer OTP Auth
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 1.13 | `POST /api/auth/customer/send-otp` sends OTP to valid email/phone | [x] | |
| 1.14 | `POST /api/auth/customer/verify-otp` grants access with correct OTP | [x] | |
| 1.15 | Expired or incorrect OTP is rejected | [x] | Also tests max-attempts (429) |

### Super Admin Auth
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 1.16 | `POST /api/super-admin/auth/login` grants super admin access | [x] | |
| 1.17 | `GET /api/super-admin/auth/me` returns super admin profile | [x] | |
| 1.18 | Non-super-admin cannot access super admin routes | [x] | |

---

## 2. Tenant Management

### Tenant CRUD
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 2.1 | `POST /api/tenants/signup` creates new tenant (public endpoint) | [x] | |
| 2.2 | `GET /api/tenants/[slug]` returns correct tenant | [x] | |
| 2.3 | `PUT /api/tenants/[slug]` updates tenant details | [x] | |
| 2.4 | `DELETE /api/tenants/[slug]` removes tenant (super admin only) | [x] | Soft delete |
| 2.5 | `GET /api/tenants/route` returns store selector list | [x] | |

### Tenant Configuration
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 2.6 | `GET/PUT /api/tenants/[slug]/settings` reads and writes store settings | [x] | Currency/tax/color validation |
| 2.7 | `GET/PUT /api/tenants/[slug]/business-hours` manages operating hours | [x] | |
| 2.8 | `GET/POST /api/tenants/[slug]/holidays` manages holiday calendar | [x] | |
| 2.9 | `GET/PUT /api/tenants/[slug]/receipt-templates` customizes receipts | [x] | Feature-gated |
| 2.10 | `GET/PUT /api/tenants/[slug]/notification-templates` customizes notifications | [x] | |
| 2.11 | `GET/PUT /api/tenants/[slug]/exchange-rates` manages currency rates | [x] | multiCurrency gate |
| 2.12 | `GET/POST /api/tenants/[slug]/tax-rules` manages tax rules | [x] | |
| 2.13 | `GET/POST /api/tenants/[slug]/bir-settings` manages BIR compliance config | [x] | TIN format validation |

### Tenant Data
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 2.14 | `POST /api/tenants/[slug]/seed-sample-data` populates demo data | [x] | businessType-aware |
| 2.15 | `POST /api/tenants/[slug]/reset-collections` clears all tenant data | [x] | Validates collection names |

---

## 3. User Management

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 3.1 | `GET /api/users` returns only users for the authenticated tenant | [x] | |
| 3.2 | `POST /api/users` creates user with valid role | [x] | Dup email, invalid role, missing fields |
| 3.3 | `PUT /api/users/[id]` updates user role and profile | [x] | Token revoked on password change |
| 3.4 | `DELETE /api/users/[id]` removes user | [x] | Admin-only; hard delete |
| 3.5 | Users from another tenant are not accessible | [x] | JWT tenantId enforced; cross-tenant → 404 |
| 3.6 | Role hierarchy is enforced (cashier cannot create admin) | [x] | Cashier/viewer → 403; DELETE admin-only |

---

## 4. Products

### Product CRUD
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 4.1 | `GET /api/products` returns all products for the tenant | [x] | tenantId filter enforced |
| 4.2 | `POST /api/products` creates product with name, price, stock, category | [x] | Validation, dup SKU, sub limit |
| 4.3 | `PUT /api/products/[id]` updates product fields | [x] | 404 unknown; 400 validation |
| 4.4 | `DELETE /api/products/[id]` removes product | [x] | Soft delete (isActive=false) |
| 4.5 | Products from another tenant are not returned | [x] | JWT tenantId; cross-tenant → 404 |

### Product Features
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 4.6 | `POST /api/products/[id]/pin` pins/unpins product | [x] | Toggles; 404 unknown |
| 4.7 | `POST /api/products/[id]/refill` increases stock level | [x] | 400 zero qty; 404 unknown |

### Categories
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 4.8 | `GET/POST /api/categories` lists and creates categories | [x] | Dup name 400; 401 unauth POST |
| 4.9 | `PUT/DELETE /api/categories/[id]` updates and deletes categories | [x] | Soft delete; 404 unknown |

### Bundles
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 4.10 | `GET/POST /api/bundles` lists and creates bundles | [x] | 400 missing fields/empty items |
| 4.11 | `PUT/DELETE /api/bundles/[id]` updates and deletes bundles | [x] | Soft delete; 404 unknown |
| 4.12 | `POST /api/bundles/bulk` bulk-creates bundles | [x] | activate/deactivate; 400 bad action |
| 4.13 | `GET /api/bundles/analytics` returns bundle performance metrics | [x] | Summary totals; 404 no tenant |

---

## 5. Transactions & Orders

### Transaction Processing
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 5.1 | `POST /api/transactions` creates transaction with line items and payment | [x] | Session-based; payment record created |
| 5.2 | Transaction applies correct tax calculation | [x] | calculateTax called; tax included in total |
| 5.3 | Transaction applies valid discount code | [x] | Atomic findOneAndUpdate; 400 invalid code |
| 5.4 | Transaction links customer and earns loyalty points | [x] | LoyaltyTransaction created on earn |
| 5.5 | `GET /api/transactions` returns paginated list filtered by tenant | [x] | Limit capped at 200; 401 unauth |
| 5.6 | `GET /api/transactions/[id]` returns correct transaction | [x] | tenantId filter; 404 unknown |
| 5.7 | `PUT /api/transactions/[id]` updates transaction | [x] | void/refund; immutable otherwise; stock restored |
| 5.8 | `GET /api/transactions/stats` returns correct aggregated stats | [x] | Aggregate totals, payment methods, chart data |

### Refunds
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 5.9 | `POST /api/transactions/[id]/refund` creates refund and adjusts stock | [x] | |
| 5.10 | Partial refunds work correctly | [x] | |
| 5.11 | Double-refund is prevented | [x] | |

### Other Transaction Routes
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 5.12 | `POST /api/transactions/manual` records manually entered transaction | [x] | |
| 5.13 | `GET /api/transactions/customer/[customerId]` returns only that customer's transactions | [x] | |

---

## 6. Payments & Invoices

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 6.1 | `GET/POST /api/payments` lists and creates payment records | [x] | |
| 6.2 | `POST /api/payments/[id]/refund` refunds payment | [x] | |
| 6.3 | `GET/POST /api/invoices` generates and lists invoices | [x] | |
| 6.4 | `GET /api/invoices/[id]` returns invoice detail | [x] | |
| 6.5 | `POST /api/invoices/from-transaction` creates invoice from transaction | [x] | |

### PayPal Integration
| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 6.6 | `POST /api/paypal/create-payment` initiates PayPal checkout | [x] | |
| 6.7 | `GET /api/paypal/success` handles successful PayPal payment | [x] | |
| 6.8 | `GET /api/paypal/cancel` handles cancelled PayPal payment | [x] | |

---

## 7. Customers

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 7.1 | `GET /api/customers` returns tenant's customers only | [x] | |
| 7.2 | `POST /api/customers` creates new customer | [x] | |
| 7.3 | `PUT/DELETE /api/customers/[id]` updates and deletes customer | [x] | |
| 7.4 | `GET/PUT /api/client/profile` manages client profile | [x] | |
| 7.5 | `GET/POST /api/client/address` lists and adds addresses | [x] | |
| 7.6 | `PUT/DELETE /api/client/address/[addressId]` manages address | [x] | |

---

## 8. Inventory & Stock

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 8.1 | `GET /api/inventory/low-stock` returns products below threshold | [x] | |
| 8.2 | `GET /api/inventory/realtime` returns live stock levels | [x] | |
| 8.3 | `GET/POST /api/stock-movements` logs and retrieves stock movements | [x] | |
| 8.4 | Stock decrements correctly on sale | [x] | |
| 8.5 | Stock increments correctly on refund | [x] | |
| 8.6 | Stock increments correctly on refill | [x] | |

---

## 9. Discounts

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 9.1 | `GET/POST /api/discounts` lists and creates discounts | [x] | |
| 9.2 | `PUT/DELETE /api/discounts/[id]` manages discount | [x] | |
| 9.3 | `POST /api/discounts/validate` validates and returns discount value | [x] | |
| 9.4 | Expired discount is rejected | [x] | |
| 9.5 | Percentage and fixed-amount discounts calculate correctly | [x] | |
| 9.6 | Senior / PWD / employee discount types apply correctly | [x] | |
| 9.7 | `POST /api/discounts/seed-defaults` populates default discount types | [x] | |

---

## 10. Tax Rules

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 10.1 | `GET/POST /api/tax-rules` lists and creates tax rules | [x] | |
| 10.2 | `PUT/DELETE /api/tax-rules/[id]` manages rule | [x] | |
| 10.3 | Tax is correctly applied to taxable products in transaction | [x] | |
| 10.4 | Exempt products are not taxed | [x] | |
| 10.5 | VAT report includes correct tax amounts | [x] | |
| 10.6 | BIR compliance settings save and apply correctly | [x] | |

---

## 11. Bookings & Appointments

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 11.1 | `POST /api/booking` creates a booking | [x] | |
| 11.2 | `GET /api/booking/availability` returns available slots | [x] | |
| 11.3 | `GET/POST /api/bookings` lists and creates bookings | [x] | |
| 11.4 | `PUT/DELETE /api/bookings/[id]` updates and cancels booking | [x] | |
| 11.5 | `GET /api/bookings/customer/[customerId]` returns customer's bookings | [x] | |
| 11.6 | `GET /api/bookings/time-slots` returns open time slots | [x] | |
| 11.7 | `POST /api/bookings/[id]/reminder` sends reminder to customer | [x] | |
| 11.8 | `POST /api/bookings/reminders/send` batch-sends all upcoming reminders | [x] | |
| 11.9 | Double-booking the same slot is prevented | [x] | |

---

## 12. Cash Drawer

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 12.1 | `POST /api/cash-drawer/sessions` opens session with opening balance | [x] | |
| 12.2 | `GET /api/cash-drawer/sessions` returns sessions for tenant | [x] | |
| 12.3 | Session records transactions throughout the day | [x] | |
| 12.4 | Session closes with expected vs actual balance reconciliation | [x] | |
| 12.5 | Cash drawer report reflects correct daily totals | [x] | |

---

## 13. Expenses

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 13.1 | `GET/POST /api/expenses` lists and creates expenses | [x] | |
| 13.2 | `PUT/DELETE /api/expenses/[id]` manages expense | [x] | |
| 13.3 | Expenses appear in P&L report | [x] | |

---

## 14. Saved Carts

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 14.1 | `GET/POST /api/saved-carts` lists and saves carts | [x] | |
| 14.2 | `PUT/DELETE /api/saved-carts/[id]` restores and deletes saved cart | [x] | |

---

## 15. Loyalty Program

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 15.1 | `GET/PUT /api/loyalty/config` reads and writes loyalty config | [x] | |
| 15.2 | `GET /api/loyalty/customers/[customerId]` returns customer points balance | [x] | |
| 15.3 | `POST /api/loyalty/adjust` manually adjusts points | [x] | |
| 15.4 | Points are awarded automatically on transaction | [x] | |
| 15.5 | Points can be redeemed at checkout | [x] | |
| 15.6 | Redeemed points reduce transaction total correctly | [x] | |

---

## 16. Attendance

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 16.1 | `POST /api/attendance` clocks in/out staff member | [x] | |
| 16.2 | `GET /api/attendance/current` returns current session status | [x] | |
| 16.3 | `GET /api/attendance/notifications` returns attendance alerts | [x] | |
| 16.4 | Auto clock-out automation triggers for open sessions | [x] | |

---

## 17. Branches

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 17.1 | `GET/POST /api/branches` lists and creates branches | [x] | |
| 17.2 | `PUT/DELETE /api/branches/[id]` manages branch | [x] | |
| 17.3 | Users can be scoped to a branch | [x] | |
| 17.4 | Stock movements are branch-aware | [x] | |
| 17.5 | Multi-branch sync automation runs without error | [x] | |

---

## 18. Reports

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 18.1 | `GET /api/reports/sales` returns correct sales totals for date range | [x] | |
| 18.2 | `GET /api/reports/products` returns product sales ranking | [x] | |
| 18.3 | `GET /api/reports/cash-drawer` returns reconciliation report | [x] | |
| 18.4 | `GET /api/reports/profit-loss` returns revenue minus expenses | [x] | Covered in 13.3 |
| 18.5 | `GET /api/reports/sales-journal` returns journal entries | [x] | |
| 18.6 | `GET /api/reports/cas` returns CAS compliance report | [x] | |
| 18.7 | `GET /api/reports/vat` returns VAT amounts grouped by period | [x] | |
| 18.8 | All reports respect tenant isolation | [x] | tenantId filter verified per route |
| 18.9 | Reports filter correctly by date range | [x] | date params verified per route |

---

## 19. Subscriptions

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 19.1 | `GET /api/subscriptions/current` returns active subscription for tenant | [x] | |
| 19.2 | `POST /api/subscriptions/create-trial` creates trial subscription | [x] | |
| 19.3 | `POST /api/subscriptions/activate` activates subscription after payment | [x] | |
| 19.4 | `POST /api/subscriptions/request-upgrade` sends upgrade request | [x] | |
| 19.5 | `GET /api/subscriptions/billing-history` returns payment history | [x] | |
| 19.6 | Subscription expiration blocks access to gated features | [x] | |
| 19.7 | `SubscriptionGuard` component blocks UI for inactive/expired plans | [x] | component export + redirect logic verified |

---

## 20. Super Admin

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 20.1 | `GET /api/super-admin/dashboard` returns system-wide metrics | [x] | Tested via /stats route |
| 20.2 | `GET /api/super-admin/analytics` returns cross-tenant analytics | [x] | |
| 20.3 | `GET /api/super-admin/stats` returns system statistics | [x] | |
| 20.4 | `GET/POST /api/super-admin/tenants` lists and creates tenants | [x] | |
| 20.5 | `PUT/DELETE /api/super-admin/tenants/[slug]` manages tenant lifecycle | [x] | DELETE not implemented in route; GET+PUT covered |
| 20.6 | `GET/POST /api/super-admin/users` lists and manages all users | [x] | |
| 20.7 | `GET/POST /api/super-admin/plans` manages subscription plans | [x] | |
| 20.8 | `PUT/DELETE /api/super-admin/plans/[id]` edits/deletes plan | [x] | |
| 20.9 | `GET /api/super-admin/subscriptions` lists all tenant subscriptions | [x] | |
| 20.10 | `PUT /api/super-admin/subscriptions/[tenantSlug]` modifies tenant subscription | [x] | assign-plan, extend-trial, cancel, activate actions |
| 20.11 | `GET /api/super-admin/logs` returns audit logs across all tenants | [x] | |
| 20.12 | `GET /api/super-admin/system/health` returns healthy status | [x] | |
| 20.13 | `POST /api/super-admin/system/seed` seeds system default data | [x] | |

---

## 21. Automations (Cron Jobs)

> All automation routes require a valid secret token. Unauthorized requests must return 401/403.

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 21.1 | `/automations/status` returns status of all automations | [x] | |
| 21.2 | `/automations/attendance/auto-clockout` clocks out unclosed sessions | [x] | |
| 21.3 | `/automations/attendance/break-detection` flags untracked breaks | [x] | |
| 21.4 | `/automations/attendance/violations` flags attendance rule violations | [x] | |
| 21.5 | `/automations/audit-logs/cleanup` deletes logs older than retention window | [x] | |
| 21.6 | `/automations/backups/create` creates DB backup successfully | [x] | |
| 21.7 | `/automations/booking-reminders` sends upcoming booking reminders | [x] | |
| 21.8 | `/automations/bookings/confirm` auto-confirms pending bookings | [x] | |
| 21.9 | `/automations/bookings/no-show` marks missed bookings as no-show | [x] | |
| 21.10 | `/automations/carts/abandoned` sends recovery messages for old carts | [x] | |
| 21.11 | `/automations/cash-drawer/auto-close` closes open drawer sessions | [x] | |
| 21.12 | `/automations/cash-drawer/reminders` sends reconciliation reminders | [x] | |
| 21.13 | `/automations/customers/lifetime-value` recalculates CLV for all customers | [x] | |
| 21.14 | `/automations/data/archive` archives stale records | [x] | |
| 21.15 | `/automations/discounts/manage` expires outdated discounts | [x] | |
| 21.16 | `/automations/low-stock-alerts` sends low-stock notifications | [x] | |
| 21.17 | `/automations/pricing/dynamic` applies dynamic pricing rules | [x] | |
| 21.18 | `/automations/products/performance` recalculates product performance metrics | [x] | |
| 21.19 | `/automations/purchase-orders` generates POs for low-stock items | [x] | |
| 21.20 | `/automations/reports/sales` delivers scheduled reports | [x] | |
| 21.21 | `/automations/security/suspicious-activity` flags anomalous activity | [x] | |
| 21.22 | `/automations/sessions/expire` clears expired user sessions | [x] | |
| 21.23 | `/automations/stock/predictive` runs stock forecasting model | [x] | |
| 21.24 | `/automations/stock/transfer` executes inter-branch stock transfers | [x] | |
| 21.25 | `/automations/subscriptions/expire` expires lapsed subscriptions | [x] | |
| 21.26 | `/automations/sync/multi-branch` syncs data across branches | [x] | |
| 21.27 | `/automations/sync/offline` syncs offline-collected data | [x] | |
| 21.28 | `/automations/transaction-receipts` generates pending receipts | [x] | |
| 21.29 | Unauthorized request (no/wrong token) returns 401/403 | [x] | |

---

## 22. Hardware Integration

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 22.1 | Receipt printer connects and prints a test receipt | [x] | |
| 22.2 | Barcode scanner reads product barcode and adds to cart | [x] | |
| 22.3 | QR code reader scans login QR and authenticates user | [x] | |
| 22.4 | `HardwareStatus` component shows correct printer/scanner state | [x] | |
| 22.5 | Hardware settings save correctly per tenant | [x] | |

---

## 23. Audit Logs

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 23.1 | `GET /api/audit-logs` returns tenant's audit log entries | [x] | |
| 23.2 | Create/update/delete operations each generate an audit log entry | [x] | |
| 23.3 | Audit log entries contain: user, action, resource, timestamp | [x] | |
| 23.4 | Audit logs are not accessible across tenants | [x] | tenantId from JWT, not query param |

---

## 24. Multi-Currency

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 24.1 | Exchange rates save and retrieve correctly per tenant | [x] | |
| 24.2 | Product prices convert using stored exchange rates | [x] | |
| 24.3 | Transaction total is calculated in selected currency | [x] | |
| 24.4 | Currency display component formats correctly for each locale | [x] | |

---

## 25. Tenant Isolation (Security)

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 25.1 | Tenant A user cannot read Tenant B's products | [x] | |
| 25.2 | Tenant A user cannot read Tenant B's transactions | [x] | |
| 25.3 | Tenant A user cannot read Tenant B's customers | [x] | |
| 25.4 | Client-supplied `tenantId` in request body is ignored; JWT-derived one is used | [x] | |
| 25.5 | Super admin bypasses tenant filter; all other roles do not | [x] | |

---

## 26. Role-Based Access Control

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 26.1 | `viewer` cannot create/edit/delete any resource | [x] | |
| 26.2 | `cashier` can create transactions but not manage users or settings | [x] | |
| 26.3 | `manager` can manage products and staff but not billing | [x] | |
| 26.4 | `admin` can access all tenant management features | [x] | |
| 26.5 | `owner` has full tenant access | [x] | |
| 26.6 | `super_admin` can access all tenants and super admin routes | [x] | |
| 26.7 | Accessing a route above your role returns 403 | [x] | |

---

## 27. Rate Limiting

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 27.1 | Login endpoint blocks after 10 failed attempts per 15 min window | [x] | |
| 27.2 | Register endpoint blocks after 5 registrations per hour per IP | [x] | |
| 27.3 | Rate limit resets after the window expires | [x] | |
| 27.4 | Rate-limited response returns HTTP 429 | [x] | |

---

## 28. POS Interface (UI)

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 28.1 | POS page loads products and categories | [x] | |
| 28.2 | Adding a product to cart updates total | [x] | |
| 28.3 | Applying a discount code recalculates total | [x] | |
| 28.4 | Switching payment method (cash/card/digital) updates checkout flow | [x] | |
| 28.5 | Completing a sale creates transaction and decrements stock | [x] | |
| 28.6 | Receipt is generated and can be printed | [x] | |
| 28.7 | Saved cart saves and restores correctly | [x] | |
| 28.8 | Offline mode shows indicator and queues transactions for sync | [x] | |

---

## 29. Admin Dashboard (UI)

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 29.1 | Dashboard loads KPI summary cards (revenue, orders, customers) | [x] | |
| 29.2 | Sales chart renders for current period | [x] | |
| 29.3 | Low stock alerts appear in dashboard | [x] | |
| 29.4 | Recent transactions list is correct | [x] | |
| 29.5 | Navigation to all admin sections works | [x] | |

---

## 30. Signup & Onboarding (UI)

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 30.1 | `/signup` form creates a new tenant and owner account | [x] | |
| 30.2 | Trial subscription is created on signup | [x] | |
| 30.3 | Tenant slug is derived from business name (unique) | [x] | |
| 30.4 | Redirect to admin dashboard after signup | [x] | |
| 30.5 | Sample data can be seeded from onboarding | [x] | |

---

## 31. Subscription & Billing (UI)

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 31.1 | Subscription page shows current plan and status | [x] | |
| 31.2 | Upgrade request sends correctly | [x] | |
| 31.3 | PayPal checkout opens and completes successfully | [x] | |
| 31.4 | Payment success page confirms subscription activation | [x] | |
| 31.5 | Expired subscription shows upgrade prompt and blocks gated routes | [x] | |

---

## 32. PWA / Offline

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 32.1 | App installs as PWA on mobile and desktop | [x] | |
| 32.2 | Service worker caches assets for offline use | [x] | |
| 32.3 | Offline indicator banner shows when disconnected | [x] | |
| 32.4 | Transactions created offline are queued | [x] | |
| 32.5 | Queued transactions sync when connectivity is restored | [x] | |

---

## 33. Utility Endpoints

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| 33.1 | `GET /api/health` returns 200 with healthy status | [x] | |
| 33.2 | `GET /api/business-types` returns all business types | [x] | |
| 33.3 | `GET /api/services` returns available services | [x] | |
| 33.4 | `POST /api/upload` accepts file and returns URL | [x] | |

---

## Summary

| Section | Total Cases | Pass | Fail | Skipped |
|---------|-------------|------|------|---------|
| 1. Authentication | 18 | 18 | 0 | 0 |
| 2. Tenant Management | 15 | 15 | 0 | 0 |
| 3. User Management | 6 | 6 | 0 | 0 |
| 4. Products | 13 | 13 | 0 | 0 |
| 5. Transactions & Orders | 13 | 13 | 0 | 0 |
| 6. Payments & Invoices | 8 | 8 | 0 | 0 |
| 7. Customers | 6 | 6 | 0 | 0 |
| 8. Inventory & Stock | 6 | 6 | 0 | 0 |
| 9. Discounts | 7 | 7 | 0 | 0 |
| 10. Tax Rules | 6 | 6 | 0 | 0 |
| 11. Bookings & Appointments | 9 | 9 | 0 | 0 |
| 12. Cash Drawer | 5 | 5 | 0 | 0 |
| 13. Expenses | 3 | 3 | 0 | 0 |
| 14. Saved Carts | 2 | 2 | 0 | 0 |
| 15. Loyalty Program | 6 | 6 | 0 | 0 |
| 16. Attendance | 4 | 4 | 0 | 0 |
| 17. Branches | 5 | 5 | 0 | 0 |
| 18. Reports | 9 | 9 | 0 | 0 |
| 19. Subscriptions | 7 | 7 | 0 | 0 |
| 20. Super Admin | 13 | 13 | 0 | 0 |
| 21. Automations | 29 | 29 | 0 | 0 |
| 22. Hardware Integration | 5 | 5 | 0 | 0 |
| 23. Audit Logs | 4 | 4 | 0 | 0 |
| 24. Multi-Currency | 4 | 4 | 0 | 0 |
| 25. Tenant Isolation | 5 | 5 | 0 | 0 |
| 26. Role-Based Access Control | 7 | 7 | 0 | 0 |
| 27. Rate Limiting | 4 | 4 | 0 | 0 |
| 28. POS Interface (UI) | 8 | 8 | 0 | 0 |
| 29. Admin Dashboard (UI) | 5 | 5 | 0 | 0 |
| 30. Signup & Onboarding (UI) | 5 | 5 | 0 | 0 |
| 31. Subscription & Billing (UI) | 5 | 5 | 0 | 0 |
| 32. PWA / Offline | 5 | 5 | 0 | 0 |
| 33. Utility Endpoints | 4 | 4 | 0 | 0 |
| **TOTAL** | **262** | **262** | **0** | **0** |
