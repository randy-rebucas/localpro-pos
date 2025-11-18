import { NextRequest } from 'next/server';
import { getTenantBySlug, getTenantFromHost, getTenantId } from './tenant';

/**
 * Get tenant ID from request
 * Checks in order: query param, subdomain from host header
 */
export async function getTenantIdFromRequest(request: NextRequest): Promise<string | null> {
  // Try query parameter first
  const tenantSlug = request.nextUrl.searchParams.get('tenant');
  if (tenantSlug) {
    return await getTenantId(tenantSlug);
  }
  
  // Try from host header (subdomain/domain)
  const host = request.headers.get('host') || '';
  const tenantFromHost = await getTenantFromHost(host);
  if (tenantFromHost) {
    return tenantFromHost._id;
  }
  
  // Default tenant
  return await getTenantId('default');
}

/**
 * Get tenant slug from request
 */
export async function getTenantSlugFromRequest(request: NextRequest): Promise<string> {
  const tenantSlug = request.nextUrl.searchParams.get('tenant');
  if (tenantSlug) {
    const tenant = await getTenantBySlug(tenantSlug);
    if (tenant) return tenant.slug;
  }
  
  const host = request.headers.get('host') || '';
  const tenantFromHost = await getTenantFromHost(host);
  if (tenantFromHost) {
    return tenantFromHost.slug;
  }
  
  return 'default';
}

