import { NextRequest } from 'next/server';
import { getTenantBySlug, getTenantFromHost, getTenantId } from './tenant';

/**
 * Get tenant ID from request
 * Checks in order: query param, custom header, referer header, subdomain from host header
 */
export async function getTenantIdFromRequest(request: NextRequest): Promise<string | null> {
  // Try query parameter first
  const tenantSlug = request.nextUrl.searchParams.get('tenant');
  if (tenantSlug) {
    return await getTenantId(tenantSlug);
  }
  
  // Try custom header (if client sends it)
  const tenantHeader = request.headers.get('x-tenant-slug') || request.headers.get('x-tenant-id');
  if (tenantHeader) {
    // If it's already an ID (ObjectId format), return it
    if (/^[0-9a-fA-F]{24}$/.test(tenantHeader)) {
      return tenantHeader;
    }
    // Otherwise treat it as a slug
    const tenantId = await getTenantId(tenantHeader);
    if (tenantId) {
      return tenantId;
    }
  }
  
  // Try from referer header (for API calls from tenant pages)
  // This is the most reliable way for client-side API calls
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererPathParts = refererUrl.pathname.split('/').filter(Boolean);
      if (refererPathParts.length > 0) {
        const refererTenantSlug = refererPathParts[0];
        // Skip common paths that aren't tenant slugs
        if (refererTenantSlug !== 'api' && 
            refererTenantSlug !== 'admin' && 
            refererTenantSlug !== 'login' &&
            refererTenantSlug !== 'signup' &&
            !refererTenantSlug.startsWith('_')) {
          const tenantId = await getTenantId(refererTenantSlug);
          if (tenantId) {
            return tenantId;
          }
        }
      }
    } catch (e) {
      // Invalid referer URL, continue
    }
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
  // Try query parameter first
  const tenantSlug = request.nextUrl.searchParams.get('tenant');
  if (tenantSlug) {
    const tenant = await getTenantBySlug(tenantSlug);
    if (tenant) return tenant.slug;
  }
  
  // Try from referer header (for API calls from tenant pages)
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererPathParts = refererUrl.pathname.split('/').filter(Boolean);
      if (refererPathParts.length > 0) {
        const refererTenantSlug = refererPathParts[0];
        // Skip common paths that aren't tenant slugs
        if (refererTenantSlug !== 'api' && 
            refererTenantSlug !== 'admin' && 
            refererTenantSlug !== 'login' &&
            refererTenantSlug !== 'signup' &&
            !refererTenantSlug.startsWith('_')) {
          const tenant = await getTenantBySlug(refererTenantSlug);
          if (tenant) return tenant.slug;
        }
      }
    } catch (e) {
      // Invalid referer URL, continue
    }
  }
  
  // Try from host header (subdomain/domain)
  const host = request.headers.get('host') || '';
  const tenantFromHost = await getTenantFromHost(host);
  if (tenantFromHost) {
    return tenantFromHost.slug;
  }
  
  return 'default';
}

