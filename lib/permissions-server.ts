import { hasPermission, isAlwaysAllowedRole } from '@/lib/permissions';
import { getTenantAuthInfo } from '@/lib/tenant';

/**
 * Server-side effective permission check — loads the tenant's configured
 * role-permission overrides and combines them with the permission's default
 * role floor. Owner/admin/super_admin always pass without a DB lookup.
 * Overrides come from the same 60s cache getCurrentUser uses for the tenant's
 * active flag, so a permission check usually costs no extra read.
 */
export async function hasTenantPermission(
  role: string | undefined,
  tenantId: string,
  key: string
): Promise<boolean> {
  if (isAlwaysAllowedRole(role)) return true;
  if (!role) return false;

  const tenant = await getTenantAuthInfo(tenantId);
  return hasPermission(role, key, tenant?.rolePermissionOverrides);
}
