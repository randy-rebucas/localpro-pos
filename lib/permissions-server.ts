import prisma from '@/lib/prisma';
import { hasPermission, isAlwaysAllowedRole } from '@/lib/permissions';
import type { ITenantSettings } from '@/types/tenant';

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

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = tenant?.settings as ITenantSettings | undefined;
  return hasPermission(role, key, settings?.rolePermissionOverrides);
}
