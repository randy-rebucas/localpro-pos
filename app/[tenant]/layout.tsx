import { ReactNode } from 'react';
import { getTenantBySlug } from '@/lib/tenant';
import { notFound, redirect } from 'next/navigation';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { verifyToken } from '@/lib/auth';
import { cookies, headers } from 'next/headers';

export async function generateStaticParams() {
  // For static generation, you can return common tenants
  // In production, you might want to fetch from database
  return [
    { tenant: 'default' },
  ];
}

async function ensureDefaultTenant() {
  await connectDB();
  const existing = await Tenant.findOne({ slug: 'default' });
  
  if (!existing) {
    try {
      // Create default tenant if it doesn't exist
      await Tenant.create({
        slug: 'default',
        name: 'Default Store',
        settings: {
          currency: 'USD',
          timezone: 'Asia/Manila',
          language: 'en',
          primaryColor: '#35979c',
        },
        isActive: true,
      });
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      // If duplicate key error (11000), another parallel process already created it
      // This can happen during build/prerendering when multiple pages are generated in parallel
      // It's safe to ignore this error and continue
      if (error.code !== 11000) {
        // Re-throw if it's a different error
        throw error;
      }
    }
  }
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  // IMPORTANT: The forbidden route at app/[tenant]/forbidden.tsx must bypass tenant checks,
  // otherwise a legitimately-forbidden user landing there would redirect-loop back to itself.
  // proxy.ts (Next.js middleware) sets x-pathname from request.nextUrl.pathname on every page
  // request, overwriting any client-supplied value, so this can't be spoofed the way sniffing
  // the client-controlled Referer header previously could be.
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';
  const isForbiddenRoute = pathname === `/${tenantSlug}/forbidden`;
  
  // If it's the default tenant and doesn't exist, create it
  if (tenantSlug === 'default') {
    await ensureDefaultTenant();
  }
  
  // Verify tenant exists and is active
  const tenant = await getTenantBySlug(tenantSlug);
  
  if (!tenant) {
    notFound();
  }
  
  // Get full tenant details including domain/subdomain for domain ownership check
  await connectDB();
  const requestedTenant = await Tenant.findById(tenant._id)
    .select('_id slug domain subdomain')
    .lean();
  
  if (!requestedTenant) {
    notFound();
  }
  
  // SECURITY: Check domain ownership - verify authenticated user's tenant matches requested tenant domain
  // This ensures users can only access tenants they own, and domain matches tenant ownership
  // IMPORTANT: Skip this check if we're on the forbidden route to prevent redirect loops
  // The forbidden route at app/[tenant]/forbidden.tsx should be accessible without tenant checks
  if (!isForbiddenRoute) {
    try {
      const cookieStore = await cookies();
      const authToken = cookieStore.get('auth-token');
      const host = headersList.get('host') || '';
      
      if (authToken?.value) {
        // Verify token and get user's tenant ID
        const payload = verifyToken(authToken.value);
        
        if (payload && payload.tenantId) {
          // Get user's tenant with domain/subdomain info
          const userTenant = await Tenant.findById(payload.tenantId)
            .select('_id slug domain subdomain')
            .lean();
          
          if (userTenant) {
            const userTenantId = userTenant._id.toString();
            const requestedTenantId = requestedTenant._id.toString();
            
            // PRIMARY CHECK: User's tenant ID must match requested tenant ID
            if (userTenantId !== requestedTenantId) {
              // User is trying to access a tenant they don't belong to
              redirect(`/${tenantSlug}/forbidden`);
            }
            
            // DOMAIN OWNERSHIP CHECK: Verify the host matches the requested tenant's domain/subdomain
            // This ensures users can only access their tenant via the correct domain
            if (host && (requestedTenant.subdomain || requestedTenant.domain)) {
              const hostLower = host.toLowerCase();
              
              // Check subdomain match (e.g., store1.example.com matches subdomain "store1")
              const isSubdomainMatch = requestedTenant.subdomain && 
                hostLower.startsWith(requestedTenant.subdomain.toLowerCase() + '.');
              
              // Check full domain match (e.g., store1.example.com matches domain "store1.example.com")
              const isDomainMatch = requestedTenant.domain && 
                hostLower === requestedTenant.domain.toLowerCase();
              
              // If tenant has domain/subdomain configured, host must match
              // This prevents accessing tenant via wrong domain (domain ownership verification)
              if (!isSubdomainMatch && !isDomainMatch) {
                // Host doesn't match tenant's configured domain/subdomain
                // User is trying to access tenant via incorrect domain - redirect to forbidden
                redirect(`/${tenantSlug}/forbidden`);
              }
            }
          }
        }
      }
    } catch (error) {
      // If auth check fails, allow access (might be unauthenticated user or invalid token)
      // They'll be redirected by ProtectedRoute if needed
      // Silently continue - don't log to avoid noise
    }
  }
  
  return <>{children}</>;
}

