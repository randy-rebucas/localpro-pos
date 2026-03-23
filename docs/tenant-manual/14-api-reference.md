# 14. Tenant API Reference

## Authentication

All API requests require a JWT token in the Authorization header or HTTP-only cookie.

```
Authorization: Bearer {token}
```

### Login

```
POST /api/auth/login
Body: { "email": "...", "password": "..." }
Response: { "token": "...", "user": {...} }
```

### PIN Login

```
POST /api/auth/pin-login
Body: { "pin": "1234", "tenantId": "..." }
```

### QR Login

```
POST /api/auth/qr-login
Body: { "qrToken": "...", "tenantId": "..." }
```

### Logout

```
POST /api/auth/logout
```

### Change Password

```
POST /api/auth/change-password
Body: { "currentPassword": "...", "newPassword": "..." }
```

## Tenant Management

### Get Tenant

```
GET /api/tenants/{tenantId}
```

### Update Tenant Settings

```
PUT /api/tenants/{tenantId}
Body: { "settings": { ... } }
```

### Get Tenant by Slug

```
GET /api/tenants/by-slug/{slug}
```

## Products

### List Products

```
GET /api/products?tenantId={id}&page=1&limit=20&category={catId}&search={term}
```

### Get Product

```
GET /api/products/{productId}?tenantId={id}
```

### Create Product

```
POST /api/products
Body: { "tenantId": "...", "name": "...", "price": 100, "sku": "...", ... }
```

### Update Product

```
PUT /api/products/{productId}
Body: { "name": "...", "price": 120 }
```

### Delete (Soft)

```
DELETE /api/products/{productId}?tenantId={id}
```

## Categories

```
GET    /api/categories?tenantId={id}
POST   /api/categories           Body: { "tenantId": "...", "name": "..." }
PUT    /api/categories/{id}      Body: { "name": "..." }
DELETE /api/categories/{id}?tenantId={id}
```

## Transactions

### List Transactions

```
GET /api/transactions?tenantId={id}&page=1&limit=20&status=completed&startDate=...&endDate=...
```

### Create Transaction (Process Sale)

```
POST /api/transactions
Body: {
  "tenantId": "...",
  "branchId": "...",
  "items": [{ "productId": "...", "quantity": 2, "price": 100 }],
  "paymentMethod": "cash",
  "amountTendered": 250,
  "customerId": "...",
  "discountCode": "..."
}
```

### Refund

```
POST /api/transactions/{transactionId}/refund
Body: { "items": [...], "reason": "..." }
```

## Inventory

### Get Stock Levels

```
GET /api/inventory?tenantId={id}&branchId={id}
```

### Stock Movement

```
POST /api/inventory/movements
Body: {
  "tenantId": "...",
  "productId": "...",
  "branchId": "...",
  "type": "restock",
  "quantity": 50,
  "notes": "Supplier delivery"
}
```

### Stock Transfer

```
POST /api/inventory/transfer
Body: {
  "tenantId": "...",
  "fromBranchId": "...",
  "toBranchId": "...",
  "items": [{ "productId": "...", "quantity": 10 }]
}
```

## Users

```
GET    /api/users?tenantId={id}
POST   /api/users              Body: { "tenantId": "...", "name": "...", "email": "...", "password": "...", "role": "cashier" }
PUT    /api/users/{id}         Body: { "name": "...", "role": "manager" }
DELETE /api/users/{id}?tenantId={id}
```

## Bookings

```
GET    /api/bookings?tenantId={id}&date=2026-03-23
POST   /api/bookings           Body: { "tenantId": "...", "customerId": "...", "serviceId": "...", "date": "...", "time": "..." }
PUT    /api/bookings/{id}      Body: { "status": "confirmed" }
DELETE /api/bookings/{id}?tenantId={id}
```

## Customers

```
GET    /api/customers?tenantId={id}&search={term}
POST   /api/customers          Body: { "tenantId": "...", "name": "...", "email": "..." }
PUT    /api/customers/{id}     Body: { "name": "...", "tags": ["VIP"] }
DELETE /api/customers/{id}?tenantId={id}
```

## Reports

### Sales Report

```
GET /api/reports/sales?tenantId={id}&startDate=...&endDate=...&branchId=...
```

### Product Performance

```
GET /api/reports/products?tenantId={id}&startDate=...&endDate=...
```

### VAT Report

```
GET /api/reports/vat?tenantId={id}&startDate=...&endDate=...
```

## Cash Drawer

```
POST /api/cash-drawer/open    Body: { "tenantId": "...", "openingBalance": 5000 }
POST /api/cash-drawer/close   Body: { "tenantId": "...", "actualCount": 15000, "notes": "..." }
POST /api/cash-drawer/cash-in Body: { "tenantId": "...", "amount": 1000, "reason": "Float" }
POST /api/cash-drawer/cash-out Body: { "tenantId": "...", "amount": 500, "reason": "Deposit" }
```

## Attendance

```
POST /api/attendance/clock-in    Body: { "tenantId": "..." }
POST /api/attendance/clock-out   Body: { "tenantId": "..." }
POST /api/attendance/break-start Body: { "tenantId": "..." }
POST /api/attendance/break-end   Body: { "tenantId": "..." }
GET  /api/attendance?tenantId={id}&startDate=...&endDate=...
```

## Subscriptions

```
GET  /api/subscriptions?tenantId={id}
GET  /api/subscriptions/plans
POST /api/subscriptions/upgrade  Body: { "planId": "..." }
```

## Audit Logs

```
GET /api/audit-logs?tenantId={id}&action=LOGIN&startDate=...&endDate=...&userId=...
```

## Health Check

```
GET /api/health
Response: { "status": "ok", "database": "connected", "timestamp": "..." }
```

## Common Response Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request (validation error) |
| `401` | Unauthorized (not logged in) |
| `403` | Forbidden (insufficient role) |
| `404` | Not found |
| `429` | Rate limited |
| `500` | Server error |
