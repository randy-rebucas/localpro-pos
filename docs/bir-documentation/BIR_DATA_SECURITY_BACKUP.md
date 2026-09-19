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
**Source**: `prisma/schema.prisma` (`User` model), `lib/auth.ts`

| Control | Implementation |
|---------|---------------|
| Hashing Algorithm | bcryptjs |
| Salt Rounds | 10 |
| Storage | Hashed in database (never plaintext) |
| Query Exclusion | Non-auth routes use Prisma `select` to whitelist fields (excluding `password`), or strip it from the result before returning to the client |
| Minimum Length | 8 characters (application-level validation) |

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
| Database | PostgreSQL (encryption at rest depends on the hosting provider — confirm with your DB host) |
| Connection | `DATABASE_URL` (postgresql://), TLS recommended/required per provider |
| Sensitive Fields | Password: hashed with bcrypt; excluded from API responses via Prisma `select` or explicit stripping (see §2.1) |
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
| Record IDs | Format validation (24-hex-char id shape retained from the pre-migration schema) |
| Dates | ISO format parsing and range checks |

### 4.2 Protection Against Common Attacks

| Attack Vector | Mitigation |
|--------------|-----------|
| SQL Injection | Prisma parameterized queries (no raw string-concatenated SQL) |
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
  prisma.transaction.findMany({ where: { tenantId: currentUser.tenantId, ... } })
  prisma.product.findMany({ where: { tenantId: currentUser.tenantId, ... } })
  prisma.auditLog.findMany({ where: { tenantId: currentUser.tenantId, ... } })

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
**Source**: `lib/db.ts`

```
Connection Management:
  - Single PrismaClient instance, cached on globalThis in development
    (prevents connection-pool exhaustion from hot-reload creating new clients)
  - Pool sizing/timeouts configured via DATABASE_URL connection params
    or the hosting provider's pooler (e.g. PgBouncer), not hardcoded here
  - Error logging via structured logger
```

### 6.2 Connection String Security

```
Environment Variable: DATABASE_URL
Format: postgresql://<username>:<password>@<host>:<port>/<database>

Security:
  - Stored in .env.local (never committed)
  - TLS encryption for all connections (required by most managed providers)
  - IP allowlisting on the database host (recommended where supported)
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
    2. Run pg_dump against DATABASE_URL (custom-format dump, produces a
       .dump file; a full-database export — pg_dump cannot filter rows
       by tenant, so a per-tenant backup request still exports everything
       and a warning is logged)
    3. Write dump to local backup directory, rotate old backups (keep N)
    4. Upload to cloud storage (optional, S3-compatible)
    5. Log backup result

  Recovery:
    - Restore from a .dump file via pg_restore (see scripts/restore-database.ts)
    - Or your database provider's own point-in-time recovery, if offered
```

### 7.2 Managed PostgreSQL Provider Backups (Recommended)

Point-in-time recovery, automatic snapshots, and cross-region replication
are provider features (e.g. RDS, Cloud SQL, Neon, Supabase), not something
this application implements itself. Confirm what your specific hosting
provider offers and record it here once the production database is
provisioned — do not assume Atlas-style continuous backups are active by
default.

### 7.3 Backup Schedule Recommendation

| Backup Type | Frequency | Retention | Method |
|------------|-----------|-----------|--------|
| Automated DB Backup | Daily (2:00 AM) | 30 days | Cron (`pnpm db:backup`) + cloud storage |
| Managed Provider Snapshot | Per provider plan | Per provider plan | Confirm with hosting provider |
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
| `DATABASE_URL` | Database connection | Your PostgreSQL hosting provider's dashboard |
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
| Data availability | Automated backups (pg_dump/cron), plus provider replication where available | Implemented |
| Access control | 5-tier role hierarchy, API-level enforcement | Implemented |
| Audit trail | Complete action logging with user + timestamp + IP | Implemented |
| Secure transmission | HTTPS (HSTS), TLS for database | Implemented |
| Password protection | bcrypt hashing (10 rounds), not stored in plaintext | Implemented |
| Session management | JWT with expiration, token revocation | Implemented |
| Backup & recovery | Automated pg_dump backups; point-in-time recovery depends on hosting provider (confirm) | Partially implemented |
| Record retention | Persistent storage, no auto-deletion of financial data | Implemented |
| Input validation | Server-side validation on all endpoints | Implemented |
| Separation of duties | Role-based permissions (cashier vs manager vs admin) | Implemented |

---

## 12. Disaster Recovery Plan

### Recovery Time Objectives

| Scenario | RTO | RPO | Recovery Method |
|----------|-----|-----|----------------|
| Application crash | < 5 min | 0 | Auto-restart (platform) |
| Database corruption | < 1 hour | < 24 hours | Restore from latest `pg_dump` backup, or provider point-in-time restore if available |
| Data center outage | Depends on provider | Depends on provider | Provider failover/replica, if the plan includes one — confirm with hosting provider |
| Accidental deletion | < 30 min | < 24 hours | `pg_restore` from most recent backup (`scripts/restore-database.ts`) |
| Security breach | < 1 hour | 0 | Token revocation + password reset |

### Recovery Procedures

1. **Application Failure**: Platform auto-restart (Vercel/Railway/AWS)
2. **Database Issues**: Restore via `pg_restore` from the most recent `pg_dump` backup; escalate to provider support for provider-level failover
3. **Data Loss**: Restore from most recent backup (`pnpm db:restore`)
4. **Compromised Account**: Revoke all tokens → force password reset → review audit logs
5. **Full System Compromise**: Rotate all secrets (including `DATABASE_URL` credentials) → restore from clean backup → audit review

---

*Document Version: 1.1 — updated for the PostgreSQL/Prisma migration (previously described MongoDB/Mongoose)*
*Generated: 2026-03-21, revised 2026-09-19*
*System: 1POS*
