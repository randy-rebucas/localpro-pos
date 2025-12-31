# Multi-Tenant Subdomain Implementation

## Overview

This application implements a multi-tenant architecture using subdomain-based routing. Each tenant (clinic) is identified by a unique subdomain (e.g., `clinic1.example.com`, `clinic2.example.com`), allowing multiple clinics to operate independently on the same application instance with complete data isolation.

## Core Implementation Components

### 1. Tenant Utilities (`lib/tenant.ts`)

Core functions for extracting subdomains, retrieving tenant context, and verifying tenants.

#### `extractSubdomain(host?: string | null): string | null`

Extracts the subdomain from the host header. Handles multiple environments:

- **Local Development**: Supports `subdomain.localhost` format
- **Production**: Extracts subdomain from `subdomain.rootdomain.com`
- **Vercel Preview**: Handles `tenant---branch-name.vercel.app` format

Returns `null` for root domain, `www`, or invalid subdomains.

**Implementation:**
```typescript
export function extractSubdomain(host?: string | null): string | null {
  if (!host) return null;
  
  const hostname = host.split(':')[0]; // Remove port
  const rootDomain = process.env.ROOT_DOMAIN || 'localhost';
  
  // Local development
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    if (hostname.includes('.localhost')) {
      const parts = hostname.split('.');
      if (parts.length > 1 && parts[0] !== 'www') {
        return parts[0];
      }
    }
    return null;
  }
  
  // Production
  const rootDomainFormatted = rootDomain.split(':')[0];
  
  // Vercel preview deployments
  if (hostname.includes('---') && hostname.endsWith('.vercel.app')) {
    const parts = hostname.split('---');
    return parts.length > 0 ? parts[0] : null;
  }
  
  // Regular subdomain detection
  const isSubdomain =
    hostname !== rootDomainFormatted &&
    hostname !== `www.${rootDomainFormatted}` &&
    hostname.endsWith(`.${rootDomainFormatted}`);
  
  return isSubdomain ? hostname.replace(`.${rootDomainFormatted}`, '') : null;
}
```

#### `getTenantContext(): Promise<TenantContext>`

Retrieves full tenant context from request headers. Used in server components and API routes.

**Returns:**
```typescript
{
  tenantId: string | null;
  subdomain: string | null;
  tenant: TenantData | null; // Includes settings, subscription, etc.
}
```

**Implementation:**
```typescript
export async function getTenantContext(): Promise<TenantContext> {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || headersList.get('x-forwarded-host');
    const subdomain = extractSubdomain(host);
    
    if (!subdomain) {
      return { tenantId: null, subdomain: null, tenant: null };
    }
    
    await connectDB();
    const tenant = await Tenant.findOne({ 
      subdomain: subdomain.toLowerCase(),
      status: 'active'
    }).select('_id name subdomain displayName status settings subscription').lean();
    
    if (!tenant) {
      return { tenantId: null, subdomain, tenant: null };
    }
    
    return {
      tenantId: tenant._id.toString(),
      subdomain: tenant.subdomain,
      tenant: {
        _id: tenant._id.toString(),
        name: tenant.name,
        subdomain: tenant.subdomain,
        displayName: tenant.displayName,
        status: tenant.status,
        settings: tenant.settings,
        subscription: tenant.subscription ? {
          plan: tenant.subscription.plan,
          status: tenant.subscription.status,
          expiresAt: tenant.subscription.expiresAt,
        } : undefined,
      },
    };
  } catch (error) {
    console.error('Error getting tenant context:', error);
    return { tenantId: null, subdomain: null, tenant: null };
  }
}
```

#### `getTenantId(): Promise<string | null>`

Lightweight version that returns only the tenant ID.

#### `verifyTenant(subdomain: string): Promise<TenantData | null>`

Verifies that a tenant exists and is active. Returns tenant data if valid, `null` otherwise.

### 2. Request Middleware (`proxy.ts`)

Middleware logic for intercepting requests and handling tenant routing, validation, and security.

**Note**: The `proxy.ts` file contains middleware logic. To use it as Next.js middleware, create `middleware.ts` at the root:

```typescript
// middleware.ts (at project root)
import { proxy } from './proxy';

export default proxy;

export { config } from './proxy';
```

#### Request Flow

1. **Subdomain Extraction**: Extracts subdomain from `host` header
2. **Route Filtering**: Allows API routes, static files, and Next.js internals to pass through
3. **Root Domain Handling**: 
   - Redirects root domain (without www) to www in production
   - Blocks tenant-specific routes on root domain (except `/tenant-onboard`)
4. **Tenant Verification**: 
   - If subdomain exists, verifies tenant exists and is active
   - Redirects to `/tenant-not-found` if tenant doesn't exist
5. **Subscription Check**: 
   - Validates subscription status for protected routes
   - Redirects to `/subscription` if subscription expired
6. **Route Protection**: 
   - Blocks `/admin` routes from subdomains (root domain only)
   - Allows public routes (login, signup, book, etc.)
7. **Header Injection**: Adds `x-tenant-subdomain` header for downstream use

**Key Implementation:**
```typescript
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';
  const subdomain = extractSubdomain(host);
  
  // Allow API routes and static files
  if (pathname.startsWith('/api') || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }
  
  // If no subdomain, handle root domain access
  if (!subdomain) {
    // Handle root domain redirects and route blocking
    return NextResponse.next();
  }
  
  // Verify tenant exists and is active
  const tenant = await verifyTenant(subdomain);
  if (!tenant) {
    return NextResponse.redirect(new URL('/tenant-not-found', request.url));
  }
  
  // Check subscription status
  if (!isSubscriptionRoute && !isPublicRoute) {
    const needsRedirect = await requiresSubscriptionRedirect(tenant._id);
    if (needsRedirect) {
      return NextResponse.redirect(new URL('/subscription', request.url));
    }
  }
  
  // Block admin routes from subdomains
  if (pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  
  // Add tenant subdomain to headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-subdomain', subdomain);
  
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}
```

### 3. Tenant Model (`models/Tenant.ts`)

Stores tenant information and configuration.

#### Schema Structure

```typescript
{
  _id: ObjectId;
  name: string;                    // Required, min 2 chars
  subdomain: string;               // Required, unique, lowercase
  displayName?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  settings?: {
    timezone?: string;             // Default: 'UTC'
    currency?: string;              // Default: 'PHP'
    dateFormat?: string;           // Default: 'MM/DD/YYYY'
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
  status: 'active' | 'inactive' | 'suspended';  // Default: 'active'
  subscription?: {
    plan?: string;
    status?: 'active' | 'cancelled' | 'expired';
    expiresAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

#### Subdomain Validation

- **Length**: 2-63 characters
- **Format**: Lowercase letters, numbers, and hyphens only
- **Pattern**: Must start and end with alphanumeric character
- **Reserved Words**: Cannot use: `www`, `api`, `admin`, `app`, `mail`, `ftp`, `localhost`, `staging`, `dev`, `test`, `demo`
- **Uniqueness**: Enforced at database level with unique index

#### Indexes

- Unique index on `subdomain`
- Index on `status` for active tenant queries
- Index on `subscription.status` for subscription checks
- Index on `createdAt` for sorting

### 4. Tenant Query Helpers (`lib/tenant-query.ts`)

Utilities for automatically scoping database queries to tenants.

#### `addTenantFilter(query: any): Promise<any>`

Automatically adds `tenantId` filter to queries. Handles backward compatibility for documents without `tenantId`.

**Implementation:**
```typescript
export async function addTenantFilter(query: any = {}): Promise<any> {
  const tenantId = await getTenantId();
  
  if (tenantId) {
    return {
      ...query,
      tenantId: new Types.ObjectId(tenantId),
    };
  }
  
  // Backward compatibility for documents without tenantId
  if (query.$or) {
    return {
      ...query,
      $or: [
        { tenantId: { $exists: false } },
        { tenantId: null },
        ...query.$or,
      ],
    };
  }
  
  return {
    ...query,
    $or: [
      { tenantId: { $exists: false } },
      { tenantId: null },
    ],
  };
}
```

#### `createTenantQuery(tenantId: string | null, baseQuery: any): any`

Creates a tenant-scoped query for a specific tenant. Useful for admin operations or cross-tenant queries.

#### `ensureTenantId(data: any): Promise<any>`

Ensures a document has `tenantId` set before saving. Used in pre-save hooks or before creating documents.

### 5. Application Layout (`app/(app)/layout.tsx`)

The main application layout includes tenant verification for subdomain requests. This is the **primary mechanism** currently used for tenant verification.

#### Tenant Verification Flow

1. Extracts subdomain from request headers using `extractSubdomain()`
2. If subdomain exists, retrieves tenant context using `getTenantContext()`
3. If subdomain detected but tenant not found, shows `TenantNotFound` component
4. Otherwise, renders normal application layout with navigation and providers

**Implementation:**
```typescript
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Check if we're on a subdomain
  const headersList = await headers();
  const host = headersList.get('host') || headersList.get('x-forwarded-host');
  const subdomain = extractSubdomain(host);
  
  // If subdomain exists, verify tenant
  if (subdomain) {
    const tenantContext = await getTenantContext();
    
    // If subdomain was detected but tenant not found, show error page
    if (!tenantContext.tenant && tenantContext.subdomain) {
      return <TenantNotFound subdomain={tenantContext.subdomain} />;
    }
  }
  
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <SidebarProvider>
          <Navigation />
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </SidebarProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
```

## Data Isolation

### Tenant-Scoped Models

The following models include `tenantId` for data isolation:

- **User** - Users are scoped to tenants (email uniqueness is per-tenant)
- **Patient** - Patients belong to a tenant
- **Appointment** - Appointments are tenant-scoped
- **Visit** - Visits are tenant-scoped
- **Prescription** - Prescriptions are tenant-scoped
- **Invoice** - Invoices are tenant-scoped
- **Document** - Documents are tenant-scoped
- **Queue** - Queue items are tenant-scoped
- **Staff** - Staff members are tenant-scoped
- **Doctor** - Doctors are tenant-scoped
- **Service** - Services are tenant-scoped
- **Inventory** - Inventory items are tenant-scoped
- **Role** - Roles are tenant-scoped
- **Permission** - Permissions are tenant-scoped
- **Settings** - Settings are tenant-scoped
- **AuditLog** - Audit logs are tenant-scoped

### Query Pattern

All tenant-scoped queries follow this pattern:

```typescript
// Get tenant context
const tenantContext = await getTenantContext();
const tenantId = session.tenantId || tenantContext.tenantId;

// Build query with tenant filter
let query: any = {};
if (tenantId) {
  query.tenantId = new Types.ObjectId(tenantId);
} else {
  // Backward compatibility for documents without tenantId
  query.$or = [
    { tenantId: { $exists: false } },
    { tenantId: null }
  ];
}

// Execute query
const results = await Model.find(query);
```

## Request Flow

```
┌─────────────────┐
│  Incoming Request │
└────────┬─────────┘
         │
         ▼
┌─────────────────────┐
│  Tenant Context      │
│  (Layout/API Route)  │
│  - Extract subdomain │
│  - Verify tenant     │
│  - Check subscription│
└────────┬─────────────┘
         │
         ├─── No subdomain ───► Root domain handling
         │
         ├─── Subdomain exists ───► Verify tenant
         │                           │
         │                           ├─── Not found ───► /tenant-not-found
         │                           │
         │                           ├─── Inactive ───► /tenant-not-found
         │                           │
         │                           └─── Active ───► Check subscription
         │                                                │
         │                                                ├─── Expired ───► /subscription
         │                                                │
         │                                                └─── Valid ───► Continue
         │
         └─── Continue to route handler
```

## API Route Implementation

### Example: Tenant-Scoped API Route

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { verifySession } from '@/app/lib/dal';
import Patient from '@/models/Patient';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
  // 1. Verify authentication
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // 2. Get tenant context
  const tenantContext = await getTenantContext();
  const tenantId = session.tenantId || tenantContext.tenantId;
  
  // 3. Build tenant-scoped query
  let query: any = {};
  if (tenantId) {
    query.tenantId = new Types.ObjectId(tenantId);
  } else {
    query.$or = [
      { tenantId: { $exists: false } },
      { tenantId: null }
    ];
  }
  
  // 4. Execute query
  const patients = await Patient.find(query);
  
  return NextResponse.json({ success: true, data: patients });
}
```

## Authentication & Authorization

### Tenant-Aware Authentication

- **Email Uniqueness**: Scoped per tenant (same email can exist in multiple tenants)
- **Session**: Includes `tenantId` for authorization checks
- **Login**: Automatically detects tenant from subdomain
- **Access Control**: Users can only access data from their tenant

### User Model Tenant Scoping

The User model uses a compound index for email uniqueness per tenant:

```typescript
// Compound index: { email: 1, tenantId: 1 }
// Allows same email in different tenants
// Enforces uniqueness within a tenant
```

## Public Routes

Routes that don't require tenant context:

- `/login` - User login
- `/signup` - User registration
- `/onboard` - Patient onboarding
- `/book` - Public appointment booking
- `/patient/login` - Patient portal login
- `/tenant-onboard` - Tenant onboarding
- `/subscription` - Subscription management
- `/tenant-not-found` - Tenant not found page

## Error Handling

### Tenant Not Found

When a subdomain is detected but tenant doesn't exist or is inactive:

1. Layout component shows `TenantNotFound` component
2. Component displays error message with the attempted subdomain

### Subscription Expired

When tenant subscription is expired:

1. Middleware checks subscription status
2. Redirects to `/subscription` for protected routes
3. Allows access to subscription page, login, and public routes

## Security Implementation

### 1. Tenant Isolation

- **Database Queries**: All queries must include `tenantId` filter
- **API Routes**: Must verify tenant context before returning data
- **Session Validation**: Sessions include `tenantId` to prevent cross-tenant access

### 2. Subdomain Validation

- **Format Validation**: Enforced at model level
- **Reserved Words**: Blocked at validation level
- **Uniqueness**: Enforced at database level
- **Case Sensitivity**: Subdomains are normalized to lowercase

### 3. Route Protection

- **Admin Routes**: Blocked from subdomains (root domain only)
- **Tenant Routes**: Blocked from root domain (except onboarding)
- **Public Routes**: Accessible from both root and subdomains

## Code References

### Key Files

- `lib/tenant.ts` - Core tenant utilities
- `lib/tenant-query.ts` - Tenant query helpers
- `proxy.ts` - Request middleware
- `models/Tenant.ts` - Tenant model
- `app/(app)/layout.tsx` - Application layout with tenant verification

### Example Implementations

- `app/api/patients/route.ts` - Patient API with tenant scoping
- `app/api/appointments/route.ts` - Appointment API with tenant scoping
- `app/api/visits/route.ts` - Visit API with tenant scoping
- `app/api/prescriptions/route.ts` - Prescription API with tenant scoping
