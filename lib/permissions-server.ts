import Tenant from '@/models/Tenant';
import { hasPermission, isAlwaysAllowedRole } from '@/lib/permissions';

/**
 * Server-side effective permission check — loads the tenant's configured
 * role-permission overrides and combines them with the permission's default
 * role floor. Owner/admin/super_admin always pass without a DB lookup.
 */
export async function hasTenantPermission(
  role: string | undefined,
  tenantId: string,
  key: string
): Promise<boolean> {
  if (isAlwaysAllowedRole(role)) return true;
  if (!role) return false;

  const tenant = await Tenant.findById(tenantId).select('settings.rolePermissionOverrides').lean();
  return hasPermission(role, key, tenant?.settings?.rolePermissionOverrides);
}
