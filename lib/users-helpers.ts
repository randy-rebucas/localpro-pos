/**
 * User Management Utilities
 * Role list, role ranks and role labels for the users page
 */

import { canManageUserAccount } from '@/lib/permissions';

export const USER_ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
] as const;

export type UserRole = typeof USER_ROLES[number]['value'];

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 1,
  cashier: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

/**
 * Roles assignable by an actor of the given role — mirrors the server-side
 * check in app/api/users routes (a user can't grant a role ranked above
 * their own). Used to keep the role picker from offering choices the write
 * endpoint will reject.
 */
export function assignableRoles(actingUserRole: string): typeof USER_ROLES[number][] {
  const actingRank = ROLE_RANK[actingUserRole as UserRole] ?? 0;
  return USER_ROLES.filter((r) => ROLE_RANK[r.value] <= actingRank);
}

/**
 * Whether an actor can modify (edit, deactivate, delete, open the sign-in badge
 * of) a user of the given target role. Same rule as the server
 * (canManageUserAccount): strictly lower rank, owners may manage co-owners,
 * and your own account is always yours.
 */
export function canManageRole(actingUserRole: string, targetRole: string, isSelf = false): boolean {
  return canManageUserAccount(actingUserRole, targetRole, isSelf);
}

type Dict = { admin?: Record<string, string | undefined> };

/** Display name for a user role. */
export function getRoleLabel(role: UserRole, dict?: Dict): string {
  const labels: Record<UserRole, string> = {
    viewer: dict?.admin?.viewer || 'Viewer',
    cashier: dict?.admin?.cashier || 'Cashier',
    manager: dict?.admin?.manager || 'Manager',
    admin: dict?.admin?.adminRole || 'Admin',
    owner: dict?.admin?.owner || 'Owner',
  };
  return labels[role] || role;
}
