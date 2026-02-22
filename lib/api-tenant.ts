import { NextRequest, NextResponse } from 'next/server';
import { getTenantBySlug, getTenantFromHost, getTenantId } from './tenant';
import { getCurrentUser } from './auth';
import connectDB from './mongodb';

/**
 * Custom error class for tenant access violations
 * Includes the tenant slug for redirect purposes
 */
export class TenantAccessViolationError extends Error {
  tenantSlug: string;
  
  constructor(tenantSlug: string, message: string = 'Access denied to this tenant') {
    super(message);
    this.name = 'TenantAccessViolationError';
    this.tenantSlug = tenantSlug;
  }
}

/**
 * Get tenant ID from request
 * SECURITY: For authenticated requests, prioritizes the authenticated user's tenantId
 * to prevent cross-tenant data access. Only falls back to request parameters for unauthenticated requests.
 * 
 * Checks in order:
 * 1. Authenticated user's tenantId (if authenticated) - SECURITY: Prevents cross-tenant access
 * 2. Host header (subdomain/domain) - Most reliable for unauthenticated requests
 * 3. Referer header (for API calls from tenant pages)
 * 4. Query parameter or custom header (less secure, only for unauthenticated)
 * 5. Default tenant
 */
export async function getTenantIdFromRequest(request: NextRequest): Promise<string | null> {
  // SECURITY: For authenticated requests, use the user's tenantId first
  // This prevents users from accessing other tenants' data by manipulating request parameters
  try {
    const user = await getCurrentUser(request);
    if (user && user.tenantId) {
      // User is authenticated - use their tenantId and validate it matches request
      const requestTenantId = await getTenantIdFromRequestParams(request);
      
      // If request specifies a different tenant, reject it for security
      if (requestTenantId && requestTenantId !== user.tenantId) {
        console.warn(`Security: User ${user.userId} from tenant ${user.tenantId} attempted to access tenant ${requestTenantId}`);
        
        // Get the tenant slug for redirect - try to get it from the request first
        let tenantSlug = 'default';
        try {
          const requestedTenantSlug = await getTenantSlugFromRequest(request);
          if (requestedTenantSlug && requestedTenantSlug !== 'default') {
            tenantSlug = requestedTenantSlug;
          } else {
            // If we can't get the slug from request, get it from the tenant ID
            const Tenant = (await import('@/models/Tenant')).default;
            await connectDB();
            const tenant = await Tenant.findById(requestTenantId).select('slug').lean();
            if (tenant && tenant.slug) {
              tenantSlug = tenant.slug;
            }
          }
        } catch (e) {
          // If we can't get the slug, try to get it from the tenant ID
          try {
            const Tenant = (await import('@/models/Tenant')).default;
            await connectDB();
            const tenant = await Tenant.findById(requestTenantId).select('slug').lean();
            if (tenant && tenant.slug) {
              tenantSlug = tenant.slug;
            }
          } catch (err) {
            // Fallback to default - will redirect to /default/forbidden
          }
        }
        
        // Throw error that includes tenant slug for redirect
        throw new TenantAccessViolationError(
          tenantSlug,
          `Forbidden: Access denied to tenant ${tenantSlug}`
        );
      }
      
      // Return the authenticated user's tenantId (most secure)
      return user.tenantId;
    }
  } catch (error) {
    // Re-throw TenantAccessViolationError so it can be handled by the caller
    if (error instanceof TenantAccessViolationError) {
      throw error;
    }
    // If auth check fails for other reasons, continue to fallback methods
    console.debug('Auth check failed, using fallback tenant detection:', error);
  }
  
  // For unauthenticated requests, use fallback methods
  return await getTenantIdFromRequestParams(request);
}

/**
 * Get tenant ID from request parameters (query, headers, referer, host)
 * This is used as a fallback for unauthenticated requests or to validate against authenticated user's tenant
 */
async function getTenantIdFromRequestParams(request: NextRequest): Promise<string | null> {
  // Try from host header first (most reliable for subdomain routing)
  const host = request.headers.get('host') || '';
  const tenantFromHost = await getTenantFromHost(host);
  if (tenantFromHost) {
    return tenantFromHost._id;
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
  
  // Try query parameter (less secure, but needed for some unauthenticated endpoints)
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

/**
 * SECURITY: Get and validate tenant ID for authenticated requests
 * Ensures the authenticated user's tenant matches the request tenant
 * Throws TenantAccessViolationError if there's a tenant mismatch (which includes redirect info)
 * 
 * @param request - The Next.js request object
 * @returns Object with tenantId and user info, or throws error if unauthorized
 */
export async function requireTenantAccess(request: NextRequest): Promise<{
  tenantId: string;
  user: {
    userId: string;
    tenantId: string;
    email: string;
    role: string;
  };
}> {
  const user = await getCurrentUser(request);
  
  if (!user) {
    throw new Error('Unauthorized: Authentication required');
  }
  
  const requestTenantId = await getTenantIdFromRequestParams(request);
  
  // If request specifies a tenant, it must match the user's tenant
  if (requestTenantId && requestTenantId !== user.tenantId) {
    console.warn(`Security violation: User ${user.userId} from tenant ${user.tenantId} attempted to access tenant ${requestTenantId}`);
    
    // Get the tenant slug for redirect
    let tenantSlug = 'default';
    try {
      const Tenant = (await import('@/models/Tenant')).default;
      await connectDB();
      const tenant = await Tenant.findById(requestTenantId).select('slug').lean();
      if (tenant && tenant.slug) {
        tenantSlug = tenant.slug;
      }
    } catch (err) {
      // Fallback to default
    }
    
    throw new TenantAccessViolationError(
      tenantSlug,
      `Forbidden: Access denied to tenant ${tenantSlug}`
    );
  }
  
  // Return the authenticated user's tenantId (most secure)
  return {
    tenantId: user.tenantId,
    user,
  };
}

/**
 * Helper function to handle TenantAccessViolationError in API routes
 * Returns a NextResponse with 403 status and redirect information
 */
export function handleTenantAccessViolation(error: unknown, request: NextRequest): NextResponse { // eslint-disable-line @typescript-eslint/no-unused-vars
  if (error instanceof TenantAccessViolationError) {
    const redirectUrl = `/${error.tenantSlug}/forbidden`;
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        redirect: redirectUrl 
      },
      { 
        status: 403,
        headers: {
          'Location': redirectUrl
        }
      }
    );
  }
  throw error; // Re-throw if it's not a TenantAccessViolationError
}
