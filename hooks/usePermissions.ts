'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { hasPermission, isAlwaysAllowedRole } from '@/lib/permissions';

/**
 * Effective per-tenant permission check: owner/admin/super_admin always pass;
 * otherwise combines the tenant's configured overrides (Settings → Roles & Permissions)
 * with each permission's default role floor.
 */
export function usePermissions() {
  const { user } = useAuth();
  const { settings } = useTenantSettings();

  const canAccess = (permissionKey: string): boolean =>
    hasPermission(user?.role, permissionKey, settings?.rolePermissionOverrides);

  const isAlwaysAllowed = isAlwaysAllowedRole(user?.role);

  return { canAccess, isAlwaysAllowed };
}
