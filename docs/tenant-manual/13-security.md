# 13. Security & Access Control

## Authentication

### Methods

| Method | Description | Best For |
|--------|-------------|----------|
| **Email + Password** | Standard login with bcrypt-hashed passwords | All users |
| **PIN Login** | 4-6 digit PIN for quick access | Cashier shift changes |
| **QR Code Login** | Scan unique QR badge | Staff with printed badges |

### Password Requirements

- Minimum length enforced
- Passwords hashed with bcrypt (never stored in plaintext)
- Password change available via Profile page
- Admins can reset user passwords

### Session Management

- **JWT Tokens** — Stateless authentication via JSON Web Tokens
- **HTTP-Only Cookies** — Tokens stored in HTTP-only cookies (not accessible via JavaScript)
- **Token Expiry** — Sessions expire after inactivity
- **Token Blacklist** — On logout, tokens are blacklisted to prevent reuse
- **Single Session** — Logging in on a new device doesn't invalidate existing sessions

## Role-Based Access Control (RBAC)

### Role Hierarchy

```
Owner (Level 5)  — Full system + tenant management
  ↓
Admin (Level 4)  — Full config + user management
  ↓
Manager (Level 3) — Operations + products + inventory + reports
  ↓
Cashier (Level 2) — POS transactions + cash drawer
  ↓
Viewer (Level 1)  — Read-only access
```

### Authorization Rules

- Users can only create accounts with roles **below their own level**
- Route-level middleware checks role before allowing access
- API endpoints validate role permissions
- Client-side navigation hides unauthorized menu items

### Tenant Isolation

- Every API request validates the user belongs to the requested tenant
- Compound database indexes include `tenantId` for query isolation
- No cross-tenant data access is possible through the API
- Branch-level isolation further restricts data within a tenant

## Audit Logging

### What Is Logged

Every significant action creates an audit log entry:

| Action Type | Examples |
|-------------|---------|
| `LOGIN` | User login (success/failure) |
| `LOGOUT` | User logout |
| `CREATE` | Product, user, category, booking created |
| `UPDATE` | Any record modified |
| `DELETE` | Soft delete of any record |
| `VOID` | Transaction voided |
| `REFUND` | Refund processed |
| `STOCK_ADJUST` | Inventory adjustment |
| `STOCK_TRANSFER` | Stock moved between branches |
| `SETTINGS_CHANGE` | Tenant settings modified |
| `PASSWORD_CHANGE` | User password updated |
| `ROLE_CHANGE` | User role modified |
| `EXPORT` | Data exported |

### Audit Log Fields

Each entry records:

| Field | Description |
|-------|-------------|
| **Timestamp** | Exact date and time (UTC) |
| **User** | Who performed the action |
| **Action** | What action was taken |
| **Resource** | What was affected (product, transaction, etc.) |
| **Details** | Before/after values for changes |
| **IP Address** | Source IP of the request |
| **User Agent** | Browser/device information |
| **Tenant** | Which tenant (for platform admin) |
| **Branch** | Which branch (if applicable) |

### Viewing Audit Logs

1. Navigate to **Admin > Audit Logs**
2. Filter by:
   - Date range
   - User
   - Action type
   - Resource type
3. Click any entry for full details
4. Export for BIR inspection or internal review

### Immutability

- Audit logs **cannot be edited or deleted** by any user role
- Cleanup is handled only by the automated archiving system
- 10-year retention per BIR requirements

## Soft Delete Policy

1POS uses soft delete across all data models:

| Behavior | Description |
|----------|-------------|
| **No hard delete** | Records are never permanently removed |
| **isActive flag** | Set to `false` to "delete" a record |
| **Query filtering** | All queries exclude `isActive: false` by default |
| **Audit trail** | Every deactivation is logged |
| **Recovery** | Admins can reactivate soft-deleted records |

This ensures:
- Complete transaction history preservation
- BIR compliance (no destruction of records)
- Ability to recover from accidental deletions
- Audit trail integrity

## API Security

### Rate Limiting

API endpoints are rate-limited to prevent abuse:
- Login attempts: Stricter limits
- General API: Standard limits
- Export endpoints: Lower limits (resource-intensive)

### Input Validation

- All API inputs are validated before processing
- Email format, number ranges, string lengths enforced
- SQL injection and NoSQL injection prevention
- XSS protection on user-generated content

### CORS

- Cross-Origin Resource Sharing configured for allowed origins
- Only authorized domains can make API requests

### Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer info |

## Best Practices for Tenant Admins

1. **Use strong passwords** — Enforce minimum complexity
2. **Assign minimum roles** — Give users only the access they need
3. **Review audit logs weekly** — Look for unusual patterns
4. **Deactivate former employees** — Remove access immediately when staff leave
5. **Rotate QR codes** — Regenerate if a badge is lost
6. **Monitor login attempts** — Check audit logs for failed logins
7. **Use PIN/QR for cashiers** — Faster and reduces password sharing
8. **Logout shared devices** — Ensure logout after each session
