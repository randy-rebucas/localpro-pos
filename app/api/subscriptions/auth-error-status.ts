/**
 * requireTenantAccess throws rather than returning a response. Map its errors to
 * 401/403 so a signed-out or wrong-tenant request is not reported as a server fault.
 * A wrong-tenant TenantAccessViolationError carries `tenantSlug` and a "Forbidden" message.
 */
export function authErrorStatus(error: unknown): 401 | 403 | null {
  if (!(error instanceof Error)) return null;
  if ('tenantSlug' in error) return 403;
  if (error.message.startsWith('Unauthorized')) return 401;
  if (error.message.startsWith('Forbidden')) return 403;
  return null;
}
