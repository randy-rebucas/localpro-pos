# Multi-Tenant Architecture

This POS system now supports multi-tenant architecture, allowing multiple stores/organizations to use the same application with complete data isolation.

## Architecture Overview

The multi-tenant implementation follows Next.js best practices as outlined in the [Next.js Multi-Tenant Guide](https://nextjs.org/docs/app/guides/multi-tenant).

### Routing Structure

- **Path-based routing**: `/tenant-slug/lang/...`
  - Example: `/default/en/pos` or `/store1/es/products`
- **Subdomain routing**: `tenant-slug.yourdomain.com`
  - Example: `store1.yourdomain.com` → automatically routes to `/store1/en/...`

### Data Isolation

- All data models (Product, Transaction) include a `tenantId` field
- All API routes filter data by `tenantId` to ensure complete isolation
- Tenant-specific settings (currency, language, branding) are supported

## Setup

### 1. Create Default Tenant

Before using the system, create a default tenant:

```bash
# Using Node.js directly
node -e "require('./scripts/create-default-tenant.ts')"

# Or using tsx (if installed)
npx tsx scripts/create-default-tenant.ts
```

Or manually create via API:

```bash
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "default",
    "name": "Default Store",
    "settings": {
      "currency": "USD",
      "timezone": "UTC",
      "language": "en",
      "primaryColor": "#2563eb"
    }
  }'
```

### 2. Access the Application

- Default tenant: `http://localhost:3000/default/en`
- The proxy middleware automatically redirects `/` to `/default/en` (or appropriate locale)

## Creating New Tenants

### Via API

```bash
POST /api/tenants
{
  "slug": "store1",
  "name": "Store 1",
  "subdomain": "store1",  // Optional: for subdomain routing
  "domain": "store1.example.com",  // Optional: for custom domain
  "settings": {
    "currency": "USD",
    "timezone": "America/New_York",
    "language": "en",
    "primaryColor": "#10b981"
  },
  "isActive": true
}
```

### Tenant Settings

Each tenant can have:
- **slug**: URL-friendly identifier (required, unique)
- **name**: Display name
- **subdomain**: For subdomain-based routing
- **domain**: For custom domain routing
- **settings**:
  - `currency`: Currency code (default: "USD")
  - `timezone`: Timezone (default: "UTC")
  - `language`: Default language (default: "en")
  - `logo`: Logo URL (optional)
  - `primaryColor`: Brand color (default: "#2563eb")
- **isActive**: Enable/disable tenant

## How It Works

### 1. Tenant Detection

The system detects tenants in this order:
1. URL path parameter (`/tenant-slug/...`)
2. Query parameter (`?tenant=tenant-slug`)
3. Subdomain from Host header
4. Default tenant (`default`)

### 2. Data Filtering

All database queries automatically include `tenantId`:
- Products are scoped to tenant
- Transactions are scoped to tenant
- SKUs are unique per tenant (not globally)

### 3. Routing

- **Proxy Middleware** (`app/proxy.ts`): Handles initial routing and redirects
- **Tenant Layout** (`app/[tenant]/layout.tsx`): Validates tenant exists
- **Language Layout** (`app/[tenant]/[lang]/layout.tsx`): Handles internationalization

## API Routes

All API routes now require tenant identification:

- `GET /api/products?tenant=default`
- `POST /api/products?tenant=default`
- `GET /api/transactions?tenant=default`
- `GET /api/transactions/stats?tenant=default&period=today`

## Migration Notes

If you have existing data without `tenantId`:

1. Create the default tenant first
2. Run a migration script to add `tenantId` to existing records
3. Update all existing products and transactions to belong to the default tenant

## Security Considerations

- Tenant validation happens at the layout level
- API routes verify tenant exists before processing
- Data isolation is enforced at the database query level
- Consider adding authentication/authorization per tenant

## Future Enhancements

- Tenant-specific branding (logos, colors)
- Tenant admin dashboard
- Tenant user management
- Tenant billing/subscription management
- Custom domains per tenant

