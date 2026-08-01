/**
 * Isomorphic permission registry — safe to import from both client ('use client')
 * and server code. No server-only dependencies (mongoose, jwt, etc.) on purpose.
 *
 * Roles are hierarchical: viewer < cashier < manager < admin < owner < super_admin.
 * Only viewer/cashier/manager can be overridden per-tenant (see Tenant.settings.rolePermissionOverrides) —
 * admin/owner/super_admin always have full access to every permission and are never restricted.
 */

export type OverridableRole = 'viewer' | 'cashier' | 'manager';
export type Role = OverridableRole | 'admin' | 'owner' | 'super_admin';

export const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 1,
  cashier: 2,
  manager: 3,
  admin: 4,
  owner: 5,
  super_admin: 6,
};

export const OVERRIDABLE_ROLES: OverridableRole[] = ['viewer', 'cashier', 'manager'];

export function roleAtLeast(role: string | undefined, floor: string): boolean {
  return (ROLE_HIERARCHY[role || ''] || 0) >= (ROLE_HIERARCHY[floor] || 0);
}

/** Roles that always have full access and can never be restricted by an override. */
export function isAlwaysAllowedRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'owner' || role === 'super_admin';
}

export interface PermissionDef {
  key: string;
  label: string;
  section: string;
  /** Floor role that has this permission by default, absent any override. */
  defaultMinRole: Role;
}

export const PERMISSION_SECTIONS: Record<string, string> = {
  overview: 'Overview',
  catalog: 'Catalog',
  sales: 'Sales',
  customers: 'Customers',
  operations: 'Operations',
  compliance: 'Compliance',
  configuration: 'Configuration',
};

export const PERMISSIONS: PermissionDef[] = [
  { key: 'dashboard.view', label: 'Dashboard', section: 'overview', defaultMinRole: 'viewer' },
  { key: 'reports.view', label: 'Reports', section: 'overview', defaultMinRole: 'manager' },
  { key: 'reports.x_reading', label: 'X-Reading Report', section: 'overview', defaultMinRole: 'cashier' },
  { key: 'reports.z_reading', label: 'Z-Reading Report', section: 'overview', defaultMinRole: 'manager' },

  { key: 'products.manage', label: 'Products', section: 'catalog', defaultMinRole: 'manager' },
  { key: 'categories.manage', label: 'Categories', section: 'catalog', defaultMinRole: 'manager' },
  { key: 'bundles.manage', label: 'Bundles', section: 'catalog', defaultMinRole: 'manager' },
  { key: 'inventory.manage', label: 'Inventory', section: 'catalog', defaultMinRole: 'manager' },
  { key: 'stock_movements.manage', label: 'Stock Movements', section: 'catalog', defaultMinRole: 'manager' },

  { key: 'transactions.view', label: 'Transactions', section: 'sales', defaultMinRole: 'cashier' },
  { key: 'transactions.edit', label: 'Edit/Void Transactions', section: 'sales', defaultMinRole: 'manager' },
  { key: 'transactions.create_manual', label: 'Create Manual Sale', section: 'sales', defaultMinRole: 'cashier' },
  { key: 'refunds.process', label: 'Process Refunds', section: 'sales', defaultMinRole: 'manager' },
  { key: 'discounts.manage', label: 'Discounts', section: 'sales', defaultMinRole: 'manager' },
  { key: 'discounts.seed_defaults', label: 'Seed Default Discounts', section: 'sales', defaultMinRole: 'cashier' },
  { key: 'cash_drawer.manage', label: 'Cash Drawer', section: 'sales', defaultMinRole: 'cashier' },
  { key: 'cash_drawer.close', label: 'Close Cash Drawer Session', section: 'sales', defaultMinRole: 'manager' },
  { key: 'expenses.manage', label: 'Expenses', section: 'sales', defaultMinRole: 'manager' },
  { key: 'invoices.manage', label: 'Invoices', section: 'sales', defaultMinRole: 'cashier' },
  { key: 'invoices.update_status', label: 'Update Invoice Status', section: 'sales', defaultMinRole: 'manager' },

  { key: 'customers.manage', label: 'Customers', section: 'customers', defaultMinRole: 'cashier' },
  { key: 'customers.edit', label: 'Edit/Delete Customers', section: 'customers', defaultMinRole: 'manager' },
  { key: 'customers.balance_payments', label: 'Customer Balance Payments', section: 'customers', defaultMinRole: 'cashier' },
  { key: 'loyalty.manage', label: 'Loyalty', section: 'customers', defaultMinRole: 'cashier' },
  { key: 'loyalty.adjust', label: 'Adjust Loyalty Points', section: 'customers', defaultMinRole: 'manager' },
  { key: 'loyalty.config', label: 'Configure Loyalty Program', section: 'customers', defaultMinRole: 'admin' },
  { key: 'crm.manage', label: 'CRM Campaigns', section: 'customers', defaultMinRole: 'manager' },

  { key: 'bookings.manage', label: 'Bookings', section: 'operations', defaultMinRole: 'cashier' },
  { key: 'bookings.send_reminders', label: 'Send Booking Reminders', section: 'operations', defaultMinRole: 'manager' },
  { key: 'tables.manage', label: 'Tables', section: 'operations', defaultMinRole: 'cashier' },
  { key: 'tables.configure', label: 'Configure Floor Plan', section: 'operations', defaultMinRole: 'manager' },
  { key: 'attendance.manage', label: 'Attendance', section: 'operations', defaultMinRole: 'manager' },
  { key: 'channel_orders.manage', label: 'Channel Orders', section: 'operations', defaultMinRole: 'manager' },
  { key: 'integrations.manage', label: 'E-commerce Integrations', section: 'operations', defaultMinRole: 'manager' },
  { key: 'integrations.disconnect', label: 'Disconnect Integrations', section: 'operations', defaultMinRole: 'admin' },

  { key: 'compliance.view', label: 'Compliance Status', section: 'compliance', defaultMinRole: 'manager' },
  { key: 'business_permits.manage', label: 'Business Permits', section: 'compliance', defaultMinRole: 'admin' },
  { key: 'bir_compliance.manage', label: 'BIR Compliance', section: 'compliance', defaultMinRole: 'admin' },
  { key: 'restaurant_compliance.manage', label: 'Restaurant Compliance', section: 'compliance', defaultMinRole: 'admin' },
  { key: 'retail_compliance.manage', label: 'Retail Compliance', section: 'compliance', defaultMinRole: 'admin' },
  { key: 'laundry_compliance.manage', label: 'Laundry Compliance', section: 'compliance', defaultMinRole: 'admin' },
  { key: 'service_compliance.manage', label: 'Service Compliance', section: 'compliance', defaultMinRole: 'admin' },
  { key: 'pharmacy_compliance.manage', label: 'Pharmacy Compliance', section: 'compliance', defaultMinRole: 'admin' },
  { key: 'prescriptions.manage', label: 'Prescriptions', section: 'compliance', defaultMinRole: 'manager' },
  { key: 'prescriptions.create', label: 'Create Prescriptions', section: 'compliance', defaultMinRole: 'cashier' },
  { key: 'prescriptions.dispense', label: 'Dispense Prescriptions', section: 'compliance', defaultMinRole: 'cashier' },
  { key: 'prescriptions.delete', label: 'Delete Prescriptions', section: 'compliance', defaultMinRole: 'admin' },
  { key: 'expiry_tracking.manage', label: 'Expiry Tracking', section: 'compliance', defaultMinRole: 'manager' },

  { key: 'users.manage', label: 'Users', section: 'configuration', defaultMinRole: 'manager' },
  { key: 'users.delete', label: 'Delete Users', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'branches.manage', label: 'Branches', section: 'configuration', defaultMinRole: 'manager' },
  { key: 'devices.manage', label: 'Registered Devices (Terminals)', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'branches.delete', label: 'Delete Branches', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'business_types.manage', label: 'Business Type', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'business_hours.manage', label: 'Business Hours', section: 'configuration', defaultMinRole: 'manager' },
  { key: 'tax_rules.manage', label: 'Tax Rules', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'subscriptions.manage', label: 'Subscriptions', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'hardware.manage', label: 'Hardware', section: 'configuration', defaultMinRole: 'manager' },
  { key: 'notifications.manage', label: 'Notification Templates', section: 'configuration', defaultMinRole: 'manager' },
  { key: 'branding.manage', label: 'Branding', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'multi_currency.manage', label: 'Multi-Currency', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'holidays.manage', label: 'Holidays', section: 'configuration', defaultMinRole: 'manager' },
  { key: 'feature_flags.manage', label: 'Feature Flags', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'audit_logs.view', label: 'Audit Logs', section: 'configuration', defaultMinRole: 'manager' },
  { key: 'audit_logs.export', label: 'Export Audit Logs (Electronic Journal)', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'backup_reset.manage', label: 'Backup & Reset', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'sample_data.manage', label: 'Sample Data', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'api_docs.view', label: 'API Docs', section: 'configuration', defaultMinRole: 'viewer' },
  { key: 'settings.manage', label: 'Settings', section: 'configuration', defaultMinRole: 'manager' },
  { key: 'receipt_templates.manage', label: 'Receipt Templates', section: 'configuration', defaultMinRole: 'manager' },
  { key: 'tenant_profile.manage', label: 'Tenant Profile (name/domain/status)', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'reset_collections.manage', label: 'Reset Collections', section: 'configuration', defaultMinRole: 'admin' },
  { key: 'roles_permissions.manage', label: 'Roles & Permissions', section: 'configuration', defaultMinRole: 'admin' },
];

const PERMISSIONS_BY_KEY: Record<string, PermissionDef> = Object.fromEntries(
  PERMISSIONS.map((p) => [p.key, p])
);

export function getPermissionDef(key: string): PermissionDef | undefined {
  return PERMISSIONS_BY_KEY[key];
}

export type RolePermissionOverrides = {
  [role: string]: { [permissionKey: string]: boolean };
};

/**
 * Effective permission check: owner/admin/super_admin always pass. Otherwise an explicit
 * tenant override wins; falling back to the permission's default hierarchy floor.
 */
export function hasPermission(
  role: string | undefined,
  key: string,
  overrides: RolePermissionOverrides | undefined | null
): boolean {
  if (isAlwaysAllowedRole(role)) return true;
  if (!role) return false;

  const override = overrides?.[role]?.[key];
  if (typeof override === 'boolean') return override;

  const def = getPermissionDef(key);
  if (!def) return false;
  return roleAtLeast(role, def.defaultMinRole);
}
