# 1POS - Audit Trail Documentation

## BIR Compliance Documentation | Complete Audit Logging System

---

## 1. Audit Log Architecture

### Data Model
**Source**: `models/AuditLog.ts`

```
AuditLog Document
{
  _id:         ObjectId        → Unique audit record ID
  tenantId:    ObjectId        → Business identifier
  userId:      ObjectId        → User who performed the action
  action:      string          → Action type (e.g., "transaction.create")
  entityType:  string          → Entity affected (e.g., "transaction")
  entityId:    string          → Specific record ID
  changes:     object          → Detailed change record (old → new)
  ipAddress:   string          → Source IP address
  userAgent:   string          → Client browser/app identifier
  metadata:    object          → Additional context
  createdAt:   Date            → Timestamp (auto-generated)
  updatedAt:   Date            → Last modified (auto-generated)
}
```

### Database Indexes

| Index | Purpose |
|-------|---------|
| `{ tenantId: 1, createdAt: -1 }` | Query logs by tenant, newest first |
| `{ tenantId: 1, userId: 1, createdAt: -1 }` | Query logs by specific user |
| `{ tenantId: 1, entityType: 1, entityId: 1 }` | Query logs for specific record |
| `{ createdAt: -1 }` | Cleanup/retention queries |

---

## 2. Audit Logging Function

**Source**: `lib/audit.ts` → `createAuditLog()`

### How It Works

```
createAuditLog(request, data)

INPUT:
  request:  NextRequest (HTTP request object)
  data: {
    tenantId?:   string | ObjectId
    userId?:     string (auto-populated from JWT)
    action:      string
    entityType:  string
    entityId?:   string
    changes?:    object
    metadata?:   object
  }

PROCESS:

  1. Extract IP Address
     ──────────────────
     Priority: x-forwarded-for → x-real-ip → 'unknown'
     (Proxy-aware for load balancers)

  2. Extract User Agent
     ──────────────────
     From: request.headers['user-agent']

  3. Resolve Tenant ID
     ─────────────────
     Priority: data.tenantId → current user's tenantId → URL param

  4. Resolve User ID
     ────────────────
     From JWT token in cookie/header (automatic)

  5. Create AuditLog Document
     ────────────────────────
     Saves all fields to MongoDB

  6. Error Handling
     ─────────────
     Silent failure — audit logging never breaks the main operation
     Errors are logged to console but do not throw

OUTPUT:
  AuditLog document (or null on error)
```

---

## 3. Tracked Actions

### Complete Action Registry

**Source**: `lib/audit.ts` → `AuditActions`

#### General Actions

| Action | Description | Triggered By |
|--------|------------|-------------|
| `create` | Generic record creation | Various endpoints |
| `update` | Generic record update | Various endpoints |
| `delete` | Generic record deletion | Various endpoints |
| `view` | Record viewed | Various endpoints |
| `login` | User login (any method) | `/api/auth/login`, `/api/auth/login-qr` |
| `logout` | User logout | `/api/auth/logout` |

#### Transaction Actions

| Action | Description | Data Captured |
|--------|------------|---------------|
| `transaction.create` | New sale completed | receiptNumber, total, itemsCount, paymentMethods |
| `transaction.cancel` | Transaction voided | old status → new status |
| `transaction.refund` | Refund processed | refundAmount, itemsRefunded, isFullRefund |

#### Inventory Actions

| Action | Description | Data Captured |
|--------|------------|---------------|
| `stock.adjust` | Manual stock adjustment | productId, quantity, reason |
| `stock.purchase` | Stock purchased/received | productId, quantity, supplier |

#### Discount Actions

| Action | Description | Data Captured |
|--------|------------|---------------|
| `discount.create` | New discount created | code, type, value |
| `discount.update` | Discount modified | changed fields (old → new) |
| `discount.delete` | Discount removed | code, reason |

#### Attendance Actions

| Action | Description | Data Captured |
|--------|------------|---------------|
| `attendance.clockIn` | Employee clocked in | userId, timestamp |
| `attendance.clockOut` | Employee clocked out | userId, duration |

#### Payment Actions

| Action | Description | Data Captured |
|--------|------------|---------------|
| `payment.create` | Payment recorded | method, amount, transactionId |
| `payment.refund` | Payment refunded | amount, reason, originalPaymentId |

#### Invoice Actions

| Action | Description | Data Captured |
|--------|------------|---------------|
| `invoice.create` | Invoice created | invoiceNumber, total, customerId |
| `invoice.update` | Invoice modified | changed fields |
| `invoice.send` | Invoice emailed | recipientEmail |
| `invoice.markPaid` | Invoice marked paid | paidAmount, paidAt |

---

## 4. Audit Trail Examples

### Example 1: Transaction Creation

```json
{
  "_id": "65f2a1b3c4d5e6f7a8b9c0d1",
  "tenantId": "65f2a1b3c4d5e6f7a8b9c001",
  "userId": "65f2a1b3c4d5e6f7a8b9c002",
  "action": "transaction.create",
  "entityType": "transaction",
  "entityId": "65f2a1b3c4d5e6f7a8b9c0aa",
  "changes": {
    "receiptNumber": "REC-20260321-00042",
    "total": 732.57,
    "itemsCount": 3,
    "paymentCount": 1,
    "paymentIds": ["65f2a1b3c4d5e6f7a8b9c0bb"],
    "isMultiplePayments": false
  },
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
  "createdAt": "2026-03-21T14:30:25.000Z"
}
```

### Example 2: Transaction Voided

```json
{
  "_id": "65f2a1b3c4d5e6f7a8b9c0d2",
  "tenantId": "65f2a1b3c4d5e6f7a8b9c001",
  "userId": "65f2a1b3c4d5e6f7a8b9c003",
  "action": "transaction.cancel",
  "entityType": "transaction",
  "entityId": "65f2a1b3c4d5e6f7a8b9c0aa",
  "changes": {
    "status": {
      "old": "completed",
      "new": "cancelled"
    }
  },
  "ipAddress": "192.168.1.101",
  "userAgent": "Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1",
  "createdAt": "2026-03-21T16:00:00.000Z"
}
```

### Example 3: Refund Processed

```json
{
  "_id": "65f2a1b3c4d5e6f7a8b9c0d3",
  "tenantId": "65f2a1b3c4d5e6f7a8b9c001",
  "userId": "65f2a1b3c4d5e6f7a8b9c003",
  "action": "transaction.refund",
  "entityType": "transaction",
  "entityId": "65f2a1b3c4d5e6f7a8b9c0aa",
  "changes": {
    "refundTransactionId": "65f2a1b3c4d5e6f7a8b9c0cc",
    "refundAmount": 153.00,
    "itemsRefunded": 1,
    "isFullRefund": false,
    "refundPaymentId": "65f2a1b3c4d5e6f7a8b9c0dd"
  },
  "ipAddress": "192.168.1.101",
  "userAgent": "Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1",
  "createdAt": "2026-03-21T15:45:10.000Z"
}
```

### Example 4: User Login

```json
{
  "_id": "65f2a1b3c4d5e6f7a8b9c0d4",
  "tenantId": "65f2a1b3c4d5e6f7a8b9c001",
  "userId": "65f2a1b3c4d5e6f7a8b9c002",
  "action": "login",
  "entityType": "user",
  "entityId": "65f2a1b3c4d5e6f7a8b9c002",
  "metadata": {
    "success": true,
    "method": "email"
  },
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
  "createdAt": "2026-03-21T08:00:00.000Z"
}
```

### Example 5: Profile Update

```json
{
  "_id": "65f2a1b3c4d5e6f7a8b9c0d5",
  "tenantId": "65f2a1b3c4d5e6f7a8b9c001",
  "userId": "65f2a1b3c4d5e6f7a8b9c002",
  "action": "update",
  "entityType": "user",
  "entityId": "65f2a1b3c4d5e6f7a8b9c002",
  "changes": {
    "name": {
      "old": "Maria S. Santos",
      "new": "Maria Santos-Cruz"
    },
    "password": {
      "changed": true
    }
  },
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
  "createdAt": "2026-03-21T09:15:00.000Z"
}
```

### Example 6: Stock Adjustment

```json
{
  "_id": "65f2a1b3c4d5e6f7a8b9c0d6",
  "tenantId": "65f2a1b3c4d5e6f7a8b9c001",
  "userId": "65f2a1b3c4d5e6f7a8b9c003",
  "action": "stock.adjust",
  "entityType": "product",
  "entityId": "65f2a1b3c4d5e6f7a8b9c0ee",
  "changes": {
    "stock": {
      "old": 50,
      "new": 45
    },
    "reason": "Damaged goods - 5 units removed"
  },
  "ipAddress": "192.168.1.102",
  "userAgent": "Mozilla/5.0 (Android 14) Chrome/120.0",
  "createdAt": "2026-03-21T10:30:00.000Z"
}
```

---

## 5. What is Captured Per Audit Entry

| Data Point | Source | Always Present |
|-----------|--------|----------------|
| Tenant ID | JWT token / parameter | Yes |
| User ID | JWT token (auto) | Yes (if authenticated) |
| Action Type | Calling code | Yes |
| Entity Type | Calling code | Yes |
| Entity ID | Calling code | When applicable |
| Changes | Calling code | When applicable |
| IP Address | `x-forwarded-for` / `x-real-ip` | Yes |
| User Agent | `user-agent` header | Yes |
| Timestamp | MongoDB `timestamps: true` | Yes (auto) |
| Metadata | Calling code | When applicable |

---

## 6. Audit Trail Integrity

### Immutability
- Audit logs are **write-only** — no update or delete API endpoints exist
- The `AuditLog` model has no PUT or DELETE route handlers
- Records can only be queried (read) after creation

### Non-Blocking
- Audit logging failures do not affect the primary operation
- Errors are caught silently and logged to console
- The transaction/action always completes regardless of audit success

### Completeness
- Every financial operation creates an audit record
- Login attempts (success and failure) are logged
- All CRUD operations on critical entities are tracked
- IP and user agent provide forensic traceability

---

## 7. Stock Movement Audit Trail

In addition to the main AuditLog, every inventory change creates a dedicated `StockMovement` record:

**Source**: `models/StockMovement.ts`

```
StockMovement {
  productId:     ObjectId    → Product affected
  tenantId:      ObjectId    → Business
  branchId:      ObjectId    → Location (if multi-branch)
  variation:     object      → { size, color, type } if applicable
  type:          enum        → sale | purchase | adjustment | return | damage | transfer
  quantity:      number      → Change amount (+/-)
  previousStock: number      → Stock before change
  newStock:      number      → Stock after change
  reason:        string      → Why the change was made
  transactionId: ObjectId    → Linked transaction (if sale/return)
  userId:        ObjectId    → User who made the change
  notes:         string      → Additional notes
  createdAt:     Date        → Timestamp
}
```

This provides a **complete chain of custody** for every unit of inventory.

---

## 8. Querying Audit Logs

### API Endpoint
```
GET /api/audit-logs?entityType=transaction&startDate=2026-03-01&endDate=2026-03-31
```

### Available Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `entityType` | string | Filter by entity (transaction, product, user, etc.) |
| `action` | string | Filter by action type |
| `userId` | string | Filter by specific user |
| `entityId` | string | Filter by specific record |
| `startDate` | ISO date | From date |
| `endDate` | ISO date | To date |

### Access Control
- Requires authenticated user
- Scoped to user's tenant (cannot view other tenants' logs)
- Typically restricted to admin/manager roles

---

## 9. BIR Audit Compliance Summary

| BIR Requirement | System Implementation |
|----------------|----------------------|
| Who performed the action | `userId` → linked to User model (name, email, role) |
| When it was performed | `createdAt` → automatic UTC timestamp |
| What was changed | `changes` → old value and new value for each field |
| What entity was affected | `entityType` + `entityId` → traceable to source record |
| Where it was performed from | `ipAddress` + `userAgent` → device and network origin |
| Transaction traceability | `receiptNumber` in changes → links to official receipt |
| Void/refund authorization | `userId` + role check → only admin/manager can void |
| Non-deletable records | No delete endpoint for audit logs |
| Continuous logging | All financial operations emit audit events |
| Retention | Records persist indefinitely (configurable TTL via index) |

---

*Document Version: 1.0*
*Generated: 2026-03-21*
*System: 1POS*
