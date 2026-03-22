# 1POS - Data Security & Backup Plan

## BIR Compliance Documentation | Security Controls & Data Protection

---

## 1. Authentication & Access Control

### 1.1 JWT Token Authentication
**Source**: `lib/auth.ts`

| Control | Implementation |
|---------|---------------|
| Token Type | JSON Web Token (JWT) |
| Algorithm | HS256 (HMAC-SHA256) |
| Secret | `JWT_SECRET` environment variable (required in production) |
| Expiration | Configurable via `JWT_EXPIRES_IN` (default: 7 days) |
| Storage | httpOnly cookie (`auth-token`) — not accessible via JavaScript |
| Secure Flag | Enabled in production (HTTPS only) |
| SameSite | `lax` — prevents CSRF from external sites |
| Fallback | Authorization header (`Bearer <token>`) for API clients |

### Token Payload
```
{
  userId:   string   → User's database ID
  tenantId: string   → Business ID (tenant isolation)
  email:    string   → User's email
  role:     string   → Permission level
  iat:      number   → Issued at (Unix timestamp)
  exp:      number   → Expires at (Unix timestamp)
}
```

### Token Verification Flow
```
Request Received
      │
      ▼
Extract token from cookie or Authorization header
      │
      ▼
Check token blacklist (revoked tokens)
      │
      ├── Revoked → 401 Unauthorized
      │
      ▼
Verify JWT signature and expiration
      │
      ├── Invalid/Expired → 401 Unauthorized
      │
      ▼
Verify user account exists and is active
      │
      ├── Inactive/Deleted → 401 Unauthorized
      │
      ▼
Verify user tenantId matches token tenantId
      │
      ├── Mismatch → 401 Unauthorized
      │
      ▼
Grant access (return user payload)
```

### 1.2 Token Revocation
**Source**: `lib/token-blacklist.ts`

| Method | Scope | Use Case |
|--------|-------|----------|
| Token-specific revocation | Single token | User logout |
| User-wide revocation | All tokens for a user | Password change |

```
Token Blacklist:
  - Hashes token with SHA-256 before storing
  - Stores expiration from original JWT
  - Auto-cleanup every 10 minutes (removes expired entries)
  - In-memory storage (single instance)

User Revocation:
  - Stores timestamp in userRevokeTimestamps map
  - Any token issued before this timestamp is rejected
  - Invalidates ALL active sessions for the user
```

### 1.3 Role-Based Access Control (RBAC)
**Source**: `lib/auth.ts` → `requireRole()`

```
Role Hierarchy (ascending privileges):

  viewer   (1) → Read-only access
  cashier  (2) → POS operations, transactions
  manager  (3) → Voids, refunds, reports, stock management
  admin    (4) → User management, settings, full reports
  owner    (5) → Everything including tenant configuration

Access Check:
  requireRole(request, ['admin', 'manager'])
  → Verifies user's role level ≥ minimum required level
  → Returns 403 Forbidden if insufficient
```

### Endpoint Protection Matrix

| Operation | Minimum Role | Enforcement |
|-----------|-------------|-------------|
| View POS / Make sales | cashier | Route handler |
| View reports | manager | Route handler |
| Void/cancel transaction | manager | `requireRole(['admin', 'manager'])` |
| Process refund | manager | `requireRole(['admin', 'manager'])` |
| Manage users | admin | `requireRole(['admin'])` |
| Tenant settings | owner | `requireRole(['owner'])` |
| View audit logs | admin | Route handler |

---

## 2. Password Security

### 2.1 Storage
**Source**: `models/User.ts`

| Control | Implementation |
|---------|---------------|
| Hashing Algorithm | bcryptjs |
| Salt Rounds | 10 |
| Storage | Hashed in database (never plaintext) |
| Query Exclusion | `select: false` — never returned in queries by default |
| Minimum Length | 8 characters (schema validation) |

### 2.2 Password Lifecycle

```
Registration / Password Change
      │
      ▼
Validate: minimum 8 characters
      │
      ▼
Generate salt (10 rounds)
      │
      ▼
Hash password with bcrypt
      │
      ▼
Store hashed value in database
      │
      ▼
(On password change) Revoke all existing tokens


Login Attempt
      │
      ▼
Retrieve user with password (+select: true)
      │
      ▼
bcrypt.compare(input, storedHash)
      │
      ├── No match → 401 + audit log (failed login)
      │
      ▼
Generate new JWT token
      │
      ▼
Set httpOnly cookie + audit log (successful login)
```

---

## 3. Data Protection

### 3.1 Data in Transit

| Control | Implementation |
|---------|---------------|
| HTTPS | Enforced in production via HSTS header |
| HSTS | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` |
| TLS | Managed by hosting platform / reverse proxy |

### 3.2 Data at Rest

| Control | Implementation |
|---------|---------------|
| Database | MongoDB Atlas (encrypted at rest) |
| Connection | `mongodb+srv://` with TLS |
| Sensitive Fields | Password: `select: false` in schema |
| Environment Secrets | `.env.local` (never committed to git) |

### 3.3 Security Headers
**Source**: `next.config.ts`

```
All Routes:
  X-Frame-Options:        DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy:        strict-origin-when-cross-origin
  Permissions-Policy:     camera=(), microphone=(), geolocation=()

Content-Security-Policy:
  default-src:  'self'
  script-src:   'self' 'unsafe-inline'
  style-src:    'self' 'unsafe-inline'
  img-src:      'self' data: blob: https:
  connect-src:  'self' paypal.com
  frame-src:    'none'
  object-src:   'none'

Production Only:
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### 3.4 CORS Policy
**Source**: `next.config.ts`

```
API Routes:
  Access-Control-Allow-Credentials: true
  Access-Control-Allow-Origin:      [explicit origin, no wildcards]
  Access-Control-Allow-Methods:     GET, OPTIONS, POST, PUT, DELETE, PATCH
  Access-Control-Allow-Headers:     Authorization, Content-Type, ...

Production:
  Origin restricted to ALLOWED_ORIGINS environment variable
  No wildcard (*) origins permitted
```

---

## 4. Input Validation & Sanitization

### 4.1 Server-Side Validation
**Source**: `lib/validation.ts`

| Input Type | Validation |
|-----------|-----------|
| Email | Regex format check, lowercase normalization |
| Password | Minimum length, strength requirements |
| Numeric | Range checks, type coercion |
| Strings | Trim, max length, allowed characters |
| ObjectIds | MongoDB ObjectId format validation |
| Dates | ISO format parsing and range checks |

### 4.2 Protection Against Common Attacks

| Attack Vector | Mitigation |
|--------------|-----------|
| SQL Injection | N/A (MongoDB, no SQL) |
| NoSQL Injection | Mongoose schema validation, typed queries |
| XSS | CSP headers, input sanitization |
| CSRF | SameSite cookies, origin validation |
| Clickjacking | X-Frame-Options: DENY |
| Path Traversal | Next.js routing (no direct file access) |
| Brute Force | Account lockout (via isActive flag) |

---

## 5. Tenant Data Isolation

### 5.1 Multi-Tenant Security Model

```
Every Database Query:
  ─────────────────────
  Transaction.find({ tenantId: currentUser.tenantId, ... })
  Product.find({ tenantId: currentUser.tenantId, ... })
  AuditLog.find({ tenantId: currentUser.tenantId, ... })

  → Users can NEVER access another tenant's data
  → tenantId is extracted from JWT (server-side)
  → Cannot be spoofed via request parameters
```

### 5.2 Tenant Access Verification
**Source**: `lib/api-tenant.ts` → `requireTenantAccess()`

```
1. Extract tenantId from authenticated user's JWT
2. Verify tenant exists and is active
3. Verify user belongs to this tenant
4. Return tenantId for use in queries
5. Reject with 403 if any check fails
```

---

## 6. Database Security

### 6.1 Connection Configuration
**Source**: `lib/mongodb.ts`

```
Connection Options:
  bufferCommands:            false
  serverSelectionTimeoutMS:  5000    → Fail fast on connection issues
  connectTimeoutMS:          10000   → 10s connection timeout
  socketTimeoutMS:           45000   → 45s query timeout
  maxPoolSize:               10      → Limit concurrent connections
  minPoolSize:               2       → Keep minimum pool ready

Connection Management:
  - Global singleton (prevents connection leaks)
  - Cached promise pattern (reused across requests)
  - Error logging via structured logger
```

### 6.2 Connection String Security

```
Environment Variable: MONGODB_URI
Format: mongodb+srv://<username>:<password>@<cluster>/<database>

Security:
  - Stored in .env.local (never committed)
  - TLS encryption for all connections
  - IP whitelist on MongoDB Atlas (recommended)
  - Database user with least-privilege access
```

---

## 7. Backup & Recovery

### 7.1 Automated Backups
**Source**: `app/api/automations/backups/create/route.ts`, `lib/automations/database-backups.ts`

```
Backup Automation:
  ────────────────
  Endpoint: POST /api/automations/backups/create
  Trigger:  Cron schedule (configurable via node-cron)

  Authentication:
    - CRON_SECRET environment variable required
    - Verified via Authorization header or query parameter
    - Fail-closed in production (disabled if secret not set)

  Process:
    1. Authenticate cron request
    2. Connect to database
    3. Export collections (tenant-scoped or full)
    4. Compress backup data
    5. Upload to cloud storage (optional)
    6. Log backup result

  Recovery:
    - Restore from backup file
    - MongoDB Atlas point-in-time recovery (if Atlas)
    - Manual import via mongorestore
```

### 7.2 MongoDB Atlas Backups (Recommended)

| Feature | Description |
|---------|-------------|
| Continuous Backup | Point-in-time recovery up to last 24 hours |
| Daily Snapshots | Retained for 7 days (configurable) |
| Weekly Snapshots | Retained for 4 weeks |
| Monthly Snapshots | Retained for 12 months |
| Cross-Region | Replicate backups to different region |

### 7.3 Backup Schedule Recommendation

| Backup Type | Frequency | Retention | Method |
|------------|-----------|-----------|--------|
| Automated DB Backup | Daily (2:00 AM) | 30 days | Cron + cloud storage |
| MongoDB Atlas Snapshot | Continuous | Per Atlas plan | Automatic |
| Configuration Export | Weekly | 90 days | Settings + env backup |
| Audit Log Archive | Monthly | 5 years (BIR) | Export to cold storage |

---

## 8. Cron Job Security
**Source**: `lib/automation-auth.ts`

### Authentication Flow

```
Cron Request Received
      │
      ▼
Check: Is CRON_SECRET configured?
      │
      ├── NOT SET + Production → 503 Service Unavailable
      │                          (fail-closed, all automations disabled)
      │
      ├── NOT SET + Development → Allow (open for testing)
      │
      ▼ (SET)
Verify: Authorization header = "Bearer <CRON_SECRET>"
   OR:  Query parameter secret = CRON_SECRET
      │
      ├── Mismatch → 401 Unauthorized
      │
      ▼
Grant access to automation endpoint
```

### Protected Automation Endpoints

| Endpoint | Function |
|---------|----------|
| `/api/automations/backups/create` | Database backup |
| `/api/automations/attendance/auto-clockout` | Auto clock-out |
| `/api/automations/booking-reminders` | Booking notifications |
| `/api/automations/bookings/confirm` | Auto-confirm bookings |
| `/api/automations/bookings/no-show` | Mark no-shows |
| `/api/automations/cash-drawer/auto-close` | Close open drawers |
| `/api/automations/discounts/manage` | Expire old discounts |
| `/api/automations/low-stock-alerts` | Stock alert emails |
| `/api/automations/reports/sales` | Daily sales report |
| `/api/automations/sessions/expire` | Expire stale sessions |
| `/api/automations/transaction-receipts` | Email receipts |

---

## 9. Logging & Monitoring

### 9.1 Structured Logging
**Source**: `lib/logger.ts`

```
Log Levels:
  debug → Development diagnostics
  info  → Normal operations
  warn  → Potential issues
  error → Failures requiring attention

Output Format:
  Production:  JSON (for log aggregators like Datadog, CloudWatch)
  Development: Human-readable with metadata

Log Entry:
  {
    level:     "error",
    message:   "Failed to process refund",
    timestamp: "2026-03-21T15:45:10.000Z",
    userId:    "65f2...",
    error:     "Insufficient stock for restoration"
  }
```

### 9.2 Error Handling
**Source**: `lib/error-handler.ts`

- Centralized error handling for API routes
- Sanitized error messages in production (no stack traces to client)
- Detailed logging for server-side debugging
- Structured error responses: `{ success: false, error: "message" }`

---

## 10. Environment Variables & Secrets Management

### Required Secrets (Production)

| Variable | Purpose | Generation |
|---------|---------|-----------|
| `MONGODB_URI` | Database connection | MongoDB Atlas dashboard |
| `JWT_SECRET` | Token signing | `crypto.randomBytes(32).toString('hex')` |
| `CRON_SECRET` | Automation auth | `crypto.randomBytes(32).toString('hex')` |

### Optional Secrets

| Variable | Purpose |
|---------|---------|
| `PAYPAL_CLIENT_SECRET` | Payment processing |
| `EMAIL_API_KEY` | Email delivery (Resend/SendGrid) |
| `TWILIO_AUTH_TOKEN` | SMS notifications |
| `AWS_SECRET_ACCESS_KEY` | AWS services (SNS, S3) |

### Secret Storage Rules

```
NEVER commit to git:
  ✗ .env.local
  ✗ .env.production
  ✗ Any file containing actual secrets

Safe to commit:
  ✓ .env.example (with placeholder values)
  ✓ next.config.ts (references env vars, not values)

Storage:
  - Local development: .env.local file
  - Production: Platform environment variables
    (Vercel, AWS, Railway, etc.)
  - CI/CD: Encrypted secrets in pipeline config
```

---

## 11. BIR Data Security Compliance Summary

| BIR Requirement | System Implementation | Status |
|----------------|----------------------|--------|
| Data confidentiality | JWT auth, RBAC, tenant isolation | Implemented |
| Data integrity | Immutable transactions, audit trail | Implemented |
| Data availability | Automated backups, MongoDB replication | Implemented |
| Access control | 5-tier role hierarchy, API-level enforcement | Implemented |
| Audit trail | Complete action logging with user + timestamp + IP | Implemented |
| Secure transmission | HTTPS (HSTS), TLS for database | Implemented |
| Password protection | bcrypt hashing (10 rounds), not stored in plaintext | Implemented |
| Session management | JWT with expiration, token revocation | Implemented |
| Backup & recovery | Automated backups, point-in-time recovery | Implemented |
| Record retention | Persistent storage, no auto-deletion of financial data | Implemented |
| Input validation | Server-side validation on all endpoints | Implemented |
| Separation of duties | Role-based permissions (cashier vs manager vs admin) | Implemented |

---

## 12. Disaster Recovery Plan

### Recovery Time Objectives

| Scenario | RTO | RPO | Recovery Method |
|----------|-----|-----|----------------|
| Application crash | < 5 min | 0 | Auto-restart (platform) |
| Database corruption | < 1 hour | < 24 hours | Atlas point-in-time restore |
| Data center outage | < 4 hours | < 1 hour | Cross-region replica |
| Accidental deletion | < 30 min | < 24 hours | Backup restore |
| Security breach | < 1 hour | 0 | Token revocation + password reset |

### Recovery Procedures

1. **Application Failure**: Platform auto-restart (Vercel/Railway/AWS)
2. **Database Issues**: MongoDB Atlas automatic failover to replica
3. **Data Loss**: Restore from most recent backup
4. **Compromised Account**: Revoke all tokens → force password reset → review audit logs
5. **Full System Compromise**: Rotate all secrets → restore from clean backup → audit review

---

*Document Version: 1.0*
*Generated: 2026-03-21*
*System: 1POS*
