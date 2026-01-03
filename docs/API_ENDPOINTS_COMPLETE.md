# Complete API Endpoints Reference

Complete list of all API endpoints in the 1POS system, organized by category.

**Base URL:** `/api`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Customer Authentication (Mobile)](#customer-authentication-mobile)
3. [Users](#users)
4. [Products](#products)
5. [Categories](#categories)
6. [Transactions/Orders](#transactionsorders)
7. [Bookings](#bookings)
8. [Customers](#customers)
9. [Discounts](#discounts)
10. [Bundles](#bundles)
11. [Inventory & Stock](#inventory--stock)
12. [Tax Rules](#tax-rules)
13. [Branches](#branches)
14. [Expenses](#expenses)
15. [Saved Carts](#saved-carts)
16. [Cash Drawer](#cash-drawer)
17. [Attendance](#attendance)
18. [Reports](#reports)
19. [Tenants](#tenants)
20. [Business Types](#business-types)
21. [Audit Logs](#audit-logs)
22. [Automations](#automations)

---

## Authentication

### Staff Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/login` | Email/password login | No |
| POST | `/auth/login-pin` | PIN-based login | No |
| POST | `/auth/login-qr` | QR code login | No |
| POST | `/auth/logout` | Logout | Yes |
| GET | `/auth/me` | Get current user | Yes |
| GET | `/auth/profile` | Get user profile | Yes |
| PUT | `/auth/profile` | Update user profile | Yes |
| GET | `/auth/qr-code` | Generate QR code for login | Yes |

---

## Customer Authentication (Mobile)

### Customer OTP Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/customer/send-otp` | Send OTP to phone via SMS | No |
| POST | `/auth/customer/verify-otp` | Verify OTP and login/register | No |

---

## Users

| Method | Endpoint | Description | Auth Required | Roles |
|--------|----------|-------------|---------------|-------|
| GET | `/users` | List all users | Yes | Admin, Manager |
| POST | `/users` | Create new user | Yes | Admin, Manager |
| GET | `/users/[id]` | Get user by ID | Yes | Admin, Manager |
| PUT | `/users/[id]` | Update user | Yes | Admin, Manager |
| DELETE | `/users/[id]` | Delete user | Yes | Admin |
| POST | `/users/[id]/pin` | Set/update user PIN | Yes | Admin, Manager |
| GET | `/users/[id]/qr-code` | Get user QR code | Yes | Admin, Manager |
| POST | `/users/pin` | Update own PIN | Yes | All |

---

## Products

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/products` | List products | No* |
| POST | `/products` | Create product | Yes |
| GET | `/products/[id]` | Get product by ID | No* |
| PUT | `/products/[id]` | Update product | Yes |
| DELETE | `/products/[id]` | Delete product | Yes |
| POST | `/products/[id]/refill` | Refill product stock | Yes |
| POST | `/products/[id]/pin` | Pin/unpin product | Yes |

*Public access for mobile app, but tenant-scoped

---

## Categories

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/categories` | List categories | No* |
| POST | `/categories` | Create category | Yes |
| GET | `/categories/[id]` | Get category by ID | No* |
| PUT | `/categories/[id]` | Update category | Yes |
| DELETE | `/categories/[id]` | Delete category | Yes |

*Public access for mobile app, but tenant-scoped

---

## Transactions/Orders

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/transactions` | List transactions | Yes |
| POST | `/transactions` | Create transaction/order | Yes |
| GET | `/transactions/[id]` | Get transaction by ID | Yes |
| POST | `/transactions/[id]/refund` | Refund transaction | Yes |
| GET | `/transactions/stats` | Get transaction statistics | Yes |
| GET | `/transactions/customer/[customerId]` | Get customer orders | Yes (Customer) |

---

## Bookings

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/bookings` | List bookings | Yes |
| POST | `/bookings` | Create booking | Yes (Staff/Customer) |
| GET | `/bookings/[id]` | Get booking by ID | Yes |
| PUT | `/bookings/[id]` | Update booking | Yes |
| DELETE | `/bookings/[id]` | Delete booking | Yes |
| GET | `/bookings/time-slots` | Get available time slots | No* |
| POST | `/bookings/[id]/reminder` | Send booking reminder | Yes |
| POST | `/bookings/reminders/send` | Send reminders for upcoming bookings | Yes |
| GET | `/bookings/customer/[customerId]` | Get customer bookings | Yes (Customer) |

*Public access for mobile app, but tenant-scoped

---

## Customers

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/customers` | List customers | Yes |
| POST | `/customers` | Create customer | Yes |
| GET | `/customers/[id]` | Get customer by ID | Yes |
| PUT | `/customers/[id]` | Update customer | Yes |

---

## Discounts

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/discounts` | List discounts | Yes |
| POST | `/discounts` | Create discount | Yes |
| GET | `/discounts/[id]` | Get discount by ID | Yes |
| PUT | `/discounts/[id]` | Update discount | Yes |
| DELETE | `/discounts/[id]` | Delete discount | Yes |
| POST | `/discounts/validate` | Validate discount code | No* |

*Public access for mobile app

---

## Bundles

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/bundles` | List bundles | Yes |
| POST | `/bundles` | Create bundle | Yes |
| GET | `/bundles/[id]` | Get bundle by ID | Yes |
| PUT | `/bundles/[id]` | Update bundle | Yes |
| DELETE | `/bundles/[id]` | Delete bundle | Yes |
| GET | `/bundles/analytics` | Get bundle analytics | Yes |
| POST | `/bundles/bulk` | Bulk create/update bundles | Yes |

---

## Inventory & Stock

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/stock-movements` | List stock movements | Yes |
| GET | `/inventory/low-stock` | Get low stock alerts | Yes |
| GET | `/inventory/realtime` | Real-time stock updates (SSE) | Yes |

---

## Tax Rules

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/tax-rules` | List tax rules | Yes |
| POST | `/tax-rules` | Create tax rule | Yes |
| GET | `/tax-rules/[id]` | Get tax rule by ID | Yes |
| PUT | `/tax-rules/[id]` | Update tax rule | Yes |
| DELETE | `/tax-rules/[id]` | Delete tax rule | Yes |

---

## Branches

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/branches` | List branches | Yes |
| POST | `/branches` | Create branch | Yes |
| GET | `/branches/[id]` | Get branch by ID | Yes |
| PUT | `/branches/[id]` | Update branch | Yes |

---

## Expenses

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/expenses` | List expenses | Yes |
| POST | `/expenses` | Create expense | Yes |
| GET | `/expenses/[id]` | Get expense by ID | Yes |
| PUT | `/expenses/[id]` | Update expense | Yes |
| DELETE | `/expenses/[id]` | Delete expense | Yes |

---

## Saved Carts

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/saved-carts` | List saved carts | Yes |
| POST | `/saved-carts` | Save cart | Yes |
| GET | `/saved-carts/[id]` | Get saved cart by ID | Yes |
| PUT | `/saved-carts/[id]` | Update saved cart | Yes |
| DELETE | `/saved-carts/[id]` | Delete saved cart | Yes |

---

## Cash Drawer

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/cash-drawer/sessions` | List cash drawer sessions | Yes |
| POST | `/cash-drawer/sessions` | Open/close cash drawer session | Yes |

---

## Attendance

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/attendance` | List attendance records | Yes |
| POST | `/attendance` | Clock in/out | Yes |
| GET | `/attendance/current` | Get current attendance session | Yes |
| POST | `/attendance/notifications` | Send attendance notifications | Yes |

---

## Reports

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/reports/sales` | Sales report | Yes |
| GET | `/reports/products` | Product performance report | Yes |
| GET | `/reports/profit-loss` | Profit & loss report | Yes |
| GET | `/reports/cash-drawer` | Cash drawer report | Yes |
| GET | `/reports/vat` | VAT/Tax report | Yes |

---

## Tenants

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/tenants` | List tenants | Yes (Admin) |
| POST | `/tenants` | Create tenant | Yes (Admin) |
| GET | `/tenants/[slug]` | Get tenant by slug | No* |
| PUT | `/tenants/[slug]` | Update tenant | Yes (Admin) |
| POST | `/tenants/signup` | Tenant signup | No |
| GET | `/tenants/[slug]/settings` | Get tenant settings | Yes |
| PUT | `/tenants/[slug]/settings` | Update tenant settings | Yes |
| GET | `/tenants/[slug]/business-hours` | Get business hours | Yes |
| PUT | `/tenants/[slug]/business-hours` | Update business hours | Yes |
| GET | `/tenants/[slug]/holidays` | Get holidays | Yes |
| POST | `/tenants/[slug]/holidays` | Create holiday | Yes |
| PUT | `/tenants/[slug]/holidays/[id]` | Update holiday | Yes |
| DELETE | `/tenants/[slug]/holidays/[id]` | Delete holiday | Yes |
| GET | `/tenants/[slug]/tax-rules` | Get tenant tax rules | Yes |
| GET | `/tenants/[slug]/exchange-rates` | Get exchange rates | Yes |
| PUT | `/tenants/[slug]/exchange-rates` | Update exchange rates | Yes |
| GET | `/tenants/[slug]/receipt-templates` | Get receipt templates | Yes |
| PUT | `/tenants/[slug]/receipt-templates` | Update receipt templates | Yes |
| GET | `/tenants/[slug]/notification-templates` | Get notification templates | Yes |
| PUT | `/tenants/[slug]/notification-templates` | Update notification templates | Yes |
| POST | `/tenants/[slug]/reset-collections` | Reset tenant collections | Yes (Admin) |

*Public access for tenant info, but settings require auth

---

## Business Types

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/business-types` | List business types | No |

---

## Audit Logs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/audit-logs` | List audit logs | Yes (Admin) |

---

## Automations

All automation endpoints are POST requests that trigger automated workflows.

### Booking Automations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/automations/booking-reminders` | Send booking reminders | Yes |
| POST | `/automations/bookings/confirm` | Auto-confirm bookings | Yes |
| POST | `/automations/bookings/no-show` | Track no-show bookings | Yes |

### Inventory Automations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/automations/low-stock-alerts` | Send low stock alerts | Yes |
| POST | `/automations/stock/predictive` | Predictive stock analysis | Yes |
| POST | `/automations/stock/transfer` | Auto stock transfers | Yes |
| POST | `/automations/purchase-orders` | Generate purchase orders | Yes |

### Transaction Automations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/automations/transaction-receipts` | Auto-email receipts | Yes |
| POST | `/automations/carts/abandoned` | Abandoned cart recovery | Yes |

### Reporting Automations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/automations/reports/sales` | Generate sales reports | Yes |
| POST | `/automations/analytics/sales-trends` | Sales trend analysis | Yes |

### Discount Automations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/automations/discounts/manage` | Auto-manage discounts | Yes |
| POST | `/automations/pricing/dynamic` | Dynamic pricing | Yes |

### Attendance Automations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/automations/attendance/auto-clockout` | Auto clock-out | Yes |
| POST | `/automations/attendance/break-detection` | Break detection | Yes |
| POST | `/automations/attendance/violations` | Track violations | Yes |

### Cash Management Automations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/automations/cash-drawer/auto-close` | Auto-close drawers | Yes |
| POST | `/automations/cash-drawer/reminders` | Cash count reminders | Yes |

### Customer Automations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/automations/customers/lifetime-value` | Calculate lifetime value | Yes |

### Product Automations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/automations/products/performance` | Product performance analysis | Yes |

### System Automations

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/automations/backups/create` | Create database backup | Yes (Admin) |
| POST | `/automations/audit-logs/cleanup` | Cleanup audit logs | Yes (Admin) |
| POST | `/automations/data/archive` | Archive old data | Yes (Admin) |
| POST | `/automations/sessions/expire` | Expire sessions | Yes (Admin) |
| POST | `/automations/security/suspicious-activity` | Detect suspicious activity | Yes (Admin) |
| POST | `/automations/sync/multi-branch` | Multi-branch sync | Yes |
| POST | `/automations/sync/offline` | Offline sync | Yes |
| GET | `/automations/status` | Get automation status | Yes |

---

## Endpoint Summary by Category

### Public Endpoints (No Auth Required)
- `GET /products` - List products
- `GET /products/[id]` - Get product
- `GET /categories` - List categories
- `GET /categories/[id]` - Get category
- `GET /bookings/time-slots` - Get available time slots
- `POST /discounts/validate` - Validate discount code
- `GET /tenants/[slug]` - Get tenant info
- `GET /business-types` - List business types
- `POST /auth/customer/send-otp` - Send OTP
- `POST /auth/customer/verify-otp` - Verify OTP

### Customer Endpoints (Customer Auth Required)
- `GET /bookings/customer/[customerId]` - Get customer bookings
- `GET /transactions/customer/[customerId]` - Get customer orders
- `POST /bookings` - Create booking (as customer)
- `POST /transactions` - Create order (as customer)

### Staff Endpoints (Staff Auth Required)
- All other endpoints require staff authentication
- Role-based access control applies (Owner, Admin, Manager, Cashier, Viewer)

---

## Query Parameters

### Common Query Parameters

**Pagination:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50, max: 100)

**Filtering:**
- `search` - Search term
- `status` - Filter by status
- `startDate` - Start date (ISO format)
- `endDate` - End date (ISO format)
- `categoryId` - Filter by category
- `isActive` - Filter by active status

**Sorting:**
- Most endpoints sort by `createdAt: -1` (newest first)
- Some endpoints have custom sorting (e.g., products by `pinned: -1`)

---

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message"
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "pages": 2
  }
}
```

---

## Authentication

### Staff Authentication
- Use JWT token in `Authorization: Bearer {token}` header
- Or HTTP-only cookie `auth-token`
- Token obtained from `/auth/login`, `/auth/login-pin`, or `/auth/login-qr`

### Customer Authentication
- Use JWT token in `Authorization: Bearer {token}` header
- Or HTTP-only cookie `customer-auth-token`
- Token obtained from `/auth/customer/verify-otp`

---

## Rate Limiting

- OTP requests: 1 per minute per phone number
- API requests: Standard rate limiting (check response headers)
- Some endpoints may have specific rate limits

---

## Error Codes

- `400` - Bad Request (validation error)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (e.g., booking conflict)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

---

## Total Endpoint Count

- **Authentication**: 8 endpoints
- **Customer Auth**: 2 endpoints
- **Users**: 7 endpoints
- **Products**: 6 endpoints
- **Categories**: 5 endpoints
- **Transactions**: 5 endpoints
- **Bookings**: 8 endpoints
- **Customers**: 4 endpoints
- **Discounts**: 6 endpoints
- **Bundles**: 7 endpoints
- **Inventory**: 3 endpoints
- **Tax Rules**: 5 endpoints
- **Branches**: 4 endpoints
- **Expenses**: 5 endpoints
- **Saved Carts**: 5 endpoints
- **Cash Drawer**: 2 endpoints
- **Attendance**: 4 endpoints
- **Reports**: 5 endpoints
- **Tenants**: 15 endpoints
- **Business Types**: 1 endpoint
- **Audit Logs**: 1 endpoint
- **Automations**: 30+ endpoints

**Total: ~150+ API endpoints**

---

**Last Updated**: 2024
**Version**: 1.0
