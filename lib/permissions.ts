/**
 * Isomorphic permission registry — safe to import from both client ('use client')
 * and server code. No server-only dependencies (prisma, jwt, etc.) on purpose.
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

/**
 * One grantable action on a feature (a leaf in the Roles & Permissions tree).
 *
 * `key` is what routes and pages check. Older keys that already named a single
 * action (`transactions.edit`, `refunds.process`, …) were kept as-is, so a key
 * isn't always `${feature}.${action}` — read `feature` / `action` instead.
 */
export interface PermissionDef {
  key: string;
  /** English fallback for aria labels / audit context, e.g. "Products — Delete". */
  label: string;
  section: string;
  feature: string;
  action: string;
  /** Floor role that has this permission by default, absent any override. */
  defaultMinRole: Role;
  /**
   * The pre-split umbrella key this action came from (e.g. `products.manage`).
   * A tenant override stored on that old key still applies to this action until
   * the action gets its own override — so existing tenant settings keep working.
   */
  legacyKey?: string;
  /**
   * Always granted to every role and not overridable. Used for reads the POS
   * needs at checkout (product/category/customer lookups…): revoking them would
   * break selling, so the tree shows them as fixed instead of hiding them.
   */
  locked?: boolean;
}

export interface PermissionFeature {
  id: string;
  label: string;
  section: string;
  actions: PermissionDef[];
}

// English names below are fallbacks. The roles & permissions page reads
// dict.permissions.{sections,features,actions} first: add every new section,
// feature and action id to both en.json and es.json (enforced by
// __tests__/permission-dictionary.test.ts).
export const PERMISSION_SECTIONS: Record<string, string> = {
  overview: 'Overview',
  catalog: 'Catalog',
  sales: 'Sales',
  customers: 'Customers',
  operations: 'Operations',
  compliance: 'Compliance',
  configuration: 'Configuration',
};

export const PERMISSION_ACTIONS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  manage: 'Manage',
  restock: 'Restock',
  analytics: 'View analytics',
  receive: 'Receive',
  send: 'Send',
  x_reading: 'X-Reading report',
  z_reading: 'Z-Reading report',
  create_manual: 'Create manual sale',
  void: 'Edit / void',
  refund: 'Process refunds',
  seed_defaults: 'Seed default discounts',
  open_drawer: 'Open cash drawer',
  close: 'Close session',
  update_status: 'Update status',
  balance_payments: 'Balance payments',
  adjust: 'Adjust points',
  config: 'Configure program',
  send_reminders: 'Send reminders',
  track_time: 'Track job time',
  connect: 'Connect stores',
  sync: 'Sync & fulfil',
  disconnect: 'Disconnect stores',
  dispense: 'Dispense',
  export: 'Export (electronic journal)',
  change_plan: 'Change plan & billing',
};

type ActionSpec = {
  action: string;
  min: Role;
  /** Defaults to `${feature}.${action}`. */
  key?: string;
  legacy?: string;
  locked?: boolean;
};

function feature(id: string, label: string, section: string, actions: ActionSpec[]): PermissionFeature {
  return {
    id,
    label,
    section,
    actions: actions.map((a) => ({
      key: a.key ?? `${id}.${a.action}`,
      label: `${label} — ${PERMISSION_ACTIONS[a.action] ?? a.action}`,
      section,
      feature: id,
      action: a.action,
      defaultMinRole: a.min,
      ...(a.legacy ? { legacyKey: a.legacy } : {}),
      ...(a.locked ? { locked: true } : {}),
    })),
  };
}

// Reads the POS needs at checkout — see PermissionDef.locked.
const POS_READ = (min: Role = 'viewer'): ActionSpec => ({ action: 'view', min, locked: true });

/*
 * Default floors reproduce the access each route had before actions were split,
 * so no tenant's effective permissions change until an admin edits the tree.
 * Exception: reads that used to be open to any role while their admin page was
 * manager/admin-only (suppliers, CRM, customer groups, devices, prescriptions)
 * now default to that page's audience instead of "anyone".
 */
export const PERMISSION_FEATURES: PermissionFeature[] = [
  // ── Overview ──────────────────────────────────────────────────────────────
  feature('dashboard', 'Dashboard', 'overview', [{ action: 'view', min: 'viewer' }]),
  feature('reports', 'Reports', 'overview', [
    { action: 'view', min: 'manager' },
    { action: 'x_reading', min: 'cashier' },
    { action: 'z_reading', min: 'manager' },
  ]),

  // ── Catalog ───────────────────────────────────────────────────────────────
  feature('products', 'Products', 'catalog', [
    POS_READ(),
    { action: 'create', min: 'manager', legacy: 'products.manage' },
    { action: 'edit', min: 'manager', legacy: 'products.manage' },
    { action: 'delete', min: 'manager', legacy: 'products.manage' },
    { action: 'restock', min: 'manager', legacy: 'products.manage' },
  ]),
  feature('categories', 'Categories', 'catalog', [
    POS_READ(),
    { action: 'create', min: 'manager', legacy: 'categories.manage' },
    { action: 'edit', min: 'manager', legacy: 'categories.manage' },
    { action: 'delete', min: 'manager', legacy: 'categories.manage' },
  ]),
  feature('bundles', 'Bundles', 'catalog', [
    POS_READ(),
    { action: 'create', min: 'manager', legacy: 'bundles.manage' },
    { action: 'edit', min: 'manager', legacy: 'bundles.manage' },
    { action: 'delete', min: 'manager', legacy: 'bundles.manage' },
    { action: 'analytics', min: 'manager', legacy: 'bundles.manage' },
  ]),
  feature('inventory', 'Inventory', 'catalog', [{ action: 'view', min: 'manager', legacy: 'inventory.manage' }]),
  feature('stock_movements', 'Stock Movements', 'catalog', [
    { action: 'view', min: 'manager', legacy: 'stock_movements.manage' },
  ]),
  feature('suppliers', 'Suppliers', 'catalog', [
    { action: 'view', min: 'manager' },
    { action: 'create', min: 'manager', legacy: 'suppliers.manage' },
    { action: 'edit', min: 'manager', legacy: 'suppliers.manage' },
    { action: 'delete', min: 'manager', legacy: 'suppliers.manage' },
  ]),
  feature('purchase_orders', 'Purchase Orders', 'catalog', [
    { action: 'view', min: 'cashier' },
    { action: 'create', min: 'manager', legacy: 'purchase_orders.manage' },
    { action: 'edit', min: 'manager', legacy: 'purchase_orders.manage' },
    { action: 'delete', min: 'manager', legacy: 'purchase_orders.manage' },
    { action: 'receive', min: 'manager', legacy: 'purchase_orders.manage' },
  ]),
  feature('stock_transfers', 'Stock Transfers', 'catalog', [
    { action: 'view', min: 'cashier' },
    { action: 'create', min: 'manager', legacy: 'stock_transfers.manage' },
    { action: 'edit', min: 'manager', legacy: 'stock_transfers.manage' },
    { action: 'delete', min: 'manager', legacy: 'stock_transfers.manage' },
    { action: 'send', min: 'manager', legacy: 'stock_transfers.manage' },
    { action: 'receive', min: 'manager', legacy: 'stock_transfers.manage' },
  ]),

  // ── Sales ─────────────────────────────────────────────────────────────────
  feature('transactions', 'Transactions', 'sales', [
    { action: 'view', min: 'cashier' },
    { action: 'create_manual', min: 'cashier' },
    { action: 'void', key: 'transactions.edit', min: 'manager' },
    { action: 'refund', key: 'refunds.process', min: 'manager' },
  ]),
  feature('discounts', 'Discounts', 'sales', [
    POS_READ(),
    { action: 'create', min: 'manager', legacy: 'discounts.manage' },
    { action: 'edit', min: 'manager', legacy: 'discounts.manage' },
    { action: 'delete', min: 'manager', legacy: 'discounts.manage' },
    { action: 'seed_defaults', min: 'cashier' },
  ]),
  feature('cash_drawer', 'Cash Drawer', 'sales', [
    { action: 'view', min: 'cashier', legacy: 'cash_drawer.manage' },
    { action: 'open_drawer', min: 'cashier', legacy: 'cash_drawer.manage' },
    { action: 'close', min: 'manager' },
  ]),
  feature('expenses', 'Expenses', 'sales', [
    { action: 'view', min: 'viewer' },
    { action: 'create', min: 'manager', legacy: 'expenses.manage' },
    { action: 'edit', min: 'manager', legacy: 'expenses.manage' },
    { action: 'delete', min: 'manager', legacy: 'expenses.manage' },
  ]),
  feature('ledger', 'Accounting Ledger', 'sales', [
    { action: 'view', min: 'manager' },
    { action: 'create', min: 'manager', legacy: 'ledger.manage' },
    { action: 'edit', min: 'manager', legacy: 'ledger.manage' },
    { action: 'delete', min: 'manager', legacy: 'ledger.manage' },
  ]),
  feature('invoices', 'Invoices', 'sales', [
    { action: 'view', min: 'cashier', legacy: 'invoices.manage' },
    { action: 'create', min: 'cashier', legacy: 'invoices.manage' },
    { action: 'update_status', min: 'manager' },
  ]),

  // ── Customers ─────────────────────────────────────────────────────────────
  feature('customers', 'Customers', 'customers', [
    POS_READ(),
    { action: 'create', min: 'cashier', legacy: 'customers.manage' },
    { action: 'edit', key: 'customers.update', min: 'manager', legacy: 'customers.edit' },
    { action: 'delete', min: 'manager', legacy: 'customers.edit' },
    { action: 'balance_payments', min: 'cashier' },
  ]),
  feature('loyalty', 'Loyalty', 'customers', [
    { action: 'view', min: 'cashier', legacy: 'loyalty.manage' },
    { action: 'adjust', min: 'manager' },
    { action: 'config', min: 'admin' },
  ]),
  feature('crm', 'CRM Campaigns', 'customers', [
    { action: 'view', min: 'manager' },
    { action: 'create', min: 'manager', legacy: 'crm.manage' },
    { action: 'send', min: 'manager', legacy: 'crm.manage' },
  ]),
  feature('customer_groups', 'Customer Groups', 'customers', [
    { action: 'view', min: 'manager' },
    { action: 'create', min: 'manager', legacy: 'customer_groups.manage' },
    { action: 'edit', min: 'manager', legacy: 'customer_groups.manage' },
    { action: 'delete', min: 'manager', legacy: 'customer_groups.manage' },
  ]),

  // ── Operations ────────────────────────────────────────────────────────────
  feature('bookings', 'Bookings', 'operations', [
    { action: 'view', min: 'cashier', legacy: 'bookings.manage' },
    { action: 'create', min: 'cashier', legacy: 'bookings.manage' },
    { action: 'edit', min: 'cashier', legacy: 'bookings.manage' },
    { action: 'delete', min: 'cashier', legacy: 'bookings.manage' },
    { action: 'send_reminders', min: 'manager' },
  ]),
  feature('delivery', 'Delivery & Riders', 'operations', [
    { action: 'view', min: 'cashier' },
    { action: 'create', min: 'cashier', legacy: 'delivery.manage' },
    { action: 'edit', min: 'cashier', legacy: 'delivery.manage' },
    { action: 'delete', min: 'cashier', legacy: 'delivery.manage' },
  ]),
  feature('work_orders', 'Job / Work Orders', 'operations', [
    { action: 'view', min: 'cashier' },
    { action: 'create', min: 'cashier', legacy: 'work_orders.manage' },
    { action: 'edit', min: 'cashier', legacy: 'work_orders.manage' },
    { action: 'delete', min: 'cashier', legacy: 'work_orders.manage' },
    { action: 'track_time', key: 'work_order_time.manage', min: 'cashier' },
  ]),
  feature('deposits', 'Deposits', 'operations', [
    { action: 'view', min: 'cashier' },
    { action: 'create', min: 'cashier', legacy: 'deposits.manage' },
    { action: 'edit', min: 'cashier', legacy: 'deposits.manage' },
    { action: 'delete', min: 'cashier', legacy: 'deposits.manage' },
    { action: 'refund', min: 'manager' },
  ]),
  feature('laundry_orders', 'Laundry Orders', 'operations', [
    { action: 'view', min: 'cashier' },
    { action: 'create', min: 'cashier', legacy: 'laundry_orders.manage' },
    { action: 'edit', min: 'cashier', legacy: 'laundry_orders.manage' },
    { action: 'delete', min: 'cashier', legacy: 'laundry_orders.manage' },
  ]),
  feature('kitchen_display', 'Kitchen Display', 'operations', [
    { action: 'view', min: 'cashier' },
    { action: 'create', min: 'cashier', legacy: 'kitchen_display.manage' },
    { action: 'update_status', min: 'cashier', legacy: 'kitchen_display.manage' },
    { action: 'delete', min: 'cashier', legacy: 'kitchen_display.manage' },
  ]),
  feature('tables', 'Tables', 'operations', [
    { action: 'view', min: 'cashier', legacy: 'tables.manage' },
    { action: 'update_status', min: 'cashier', legacy: 'tables.manage' },
    { action: 'create', min: 'manager', legacy: 'tables.configure' },
    { action: 'edit', min: 'manager', legacy: 'tables.configure' },
    { action: 'delete', min: 'manager', legacy: 'tables.configure' },
  ]),
  feature('attendance', 'Attendance', 'operations', [{ action: 'view', min: 'manager', legacy: 'attendance.manage' }]),
  feature('integrations', 'E-commerce Integrations & Channel Orders', 'operations', [
    { action: 'view', min: 'manager', legacy: 'integrations.manage' },
    { action: 'connect', min: 'manager', legacy: 'integrations.manage' },
    { action: 'sync', min: 'manager', legacy: 'integrations.manage' },
    { action: 'disconnect', min: 'admin' },
  ]),

  // ── Compliance ────────────────────────────────────────────────────────────
  feature('compliance', 'Compliance Status', 'compliance', [{ action: 'view', min: 'manager' }]),
  feature('business_permits', 'Business Permits', 'compliance', [{ action: 'edit', key: 'business_permits.manage', min: 'admin' }]),
  feature('bir_compliance', 'BIR Compliance', 'compliance', [{ action: 'edit', key: 'bir_compliance.manage', min: 'admin' }]),
  feature('restaurant_compliance', 'Restaurant Compliance', 'compliance', [
    { action: 'edit', key: 'restaurant_compliance.manage', min: 'admin' },
  ]),
  feature('retail_compliance', 'Retail Compliance', 'compliance', [{ action: 'edit', key: 'retail_compliance.manage', min: 'admin' }]),
  feature('laundry_compliance', 'Laundry Compliance', 'compliance', [{ action: 'edit', key: 'laundry_compliance.manage', min: 'admin' }]),
  feature('service_compliance', 'Service Compliance', 'compliance', [{ action: 'edit', key: 'service_compliance.manage', min: 'admin' }]),
  feature('pharmacy_compliance', 'Pharmacy Compliance', 'compliance', [
    { action: 'edit', key: 'pharmacy_compliance.manage', min: 'admin' },
  ]),
  feature('prescriptions', 'Prescriptions', 'compliance', [
    { action: 'view', min: 'cashier' },
    { action: 'create', min: 'cashier' },
    { action: 'edit', key: 'prescriptions.manage', min: 'manager' },
    { action: 'dispense', min: 'cashier' },
    { action: 'delete', min: 'admin' },
  ]),
  feature('expiry_tracking', 'Expiry Tracking', 'compliance', [{ action: 'view', key: 'expiry_tracking.manage', min: 'manager' }]),

  // ── Configuration ─────────────────────────────────────────────────────────
  feature('users', 'Users', 'configuration', [
    { action: 'view', min: 'manager', legacy: 'users.manage' },
    { action: 'create', min: 'manager', legacy: 'users.manage' },
    { action: 'edit', min: 'manager', legacy: 'users.manage' },
    { action: 'delete', min: 'admin' },
  ]),
  feature('branches', 'Branches', 'configuration', [
    POS_READ(),
    { action: 'create', min: 'manager', legacy: 'branches.manage' },
    { action: 'edit', min: 'manager', legacy: 'branches.manage' },
    { action: 'delete', min: 'admin' },
  ]),
  feature('devices', 'Registered Devices (Terminals)', 'configuration', [
    { action: 'view', min: 'admin' },
    { action: 'create', min: 'admin', legacy: 'devices.manage' },
    { action: 'edit', min: 'admin', legacy: 'devices.manage' },
    { action: 'delete', min: 'admin', legacy: 'devices.manage' },
  ]),
  feature('business_hours', 'Business Hours', 'configuration', [{ action: 'edit', key: 'business_hours.manage', min: 'manager' }]),
  feature('tax_rules', 'Tax Rules', 'configuration', [
    POS_READ(),
    { action: 'create', min: 'admin', legacy: 'tax_rules.manage' },
    { action: 'edit', min: 'admin', legacy: 'tax_rules.manage' },
    { action: 'delete', min: 'admin', legacy: 'tax_rules.manage' },
  ]),
  feature('notifications', 'Notification Templates', 'configuration', [{ action: 'edit', key: 'notifications.manage', min: 'manager' }]),
  feature('holidays', 'Holidays', 'configuration', [
    POS_READ(),
    { action: 'create', min: 'manager', legacy: 'holidays.manage' },
    { action: 'edit', min: 'manager', legacy: 'holidays.manage' },
    { action: 'delete', min: 'manager', legacy: 'holidays.manage' },
  ]),
  // Sections of the shared settings PUT that can be granted on their own — see
  // lib/settings-section-permissions.ts. Same default floor as settings.manage.
  feature('hardware', 'Hardware', 'configuration', [{ action: 'edit', key: 'hardware.manage', min: 'manager' }]),
  feature('branding', 'Branding', 'configuration', [{ action: 'edit', key: 'branding.manage', min: 'manager' }]),
  feature('multi_currency', 'Multi-Currency', 'configuration', [{ action: 'edit', key: 'multi_currency.manage', min: 'manager' }]),
  feature('feature_flags', 'Feature Flags', 'configuration', [{ action: 'edit', key: 'feature_flags.manage', min: 'manager' }]),
  feature('subscriptions', 'Subscriptions', 'configuration', [
    { action: 'view', min: 'admin', legacy: 'subscriptions.manage' },
    { action: 'change_plan', min: 'admin', legacy: 'subscriptions.manage' },
  ]),
  feature('audit_logs', 'Audit Logs', 'configuration', [
    { action: 'view', min: 'manager' },
    { action: 'export', min: 'admin' },
  ]),
  feature('sample_data', 'Sample Data', 'configuration', [{ action: 'manage', min: 'admin' }]),
  feature('api_docs', 'API Docs', 'configuration', [{ action: 'view', min: 'viewer' }]),
  feature('settings', 'General Settings', 'configuration', [{ action: 'edit', key: 'settings.manage', min: 'manager' }]),
  // Upload, list and delete tenant files. Uploading/listing is also allowed with
  // products.create/edit or settings.manage (product images, logos); deleting needs this key.
  feature('files', 'File Uploads', 'configuration', [{ action: 'manage', min: 'manager' }]),
  feature('receipt_templates', 'Receipt Templates', 'configuration', [
    { action: 'create', min: 'manager', legacy: 'receipt_templates.manage' },
    { action: 'edit', min: 'manager', legacy: 'receipt_templates.manage' },
    { action: 'delete', min: 'manager', legacy: 'receipt_templates.manage' },
  ]),
  feature('tenant_profile', 'Tenant Profile (name/domain/status)', 'configuration', [
    { action: 'edit', min: 'admin', legacy: 'tenant_profile.manage' },
    { action: 'delete', min: 'admin', legacy: 'tenant_profile.manage' },
  ]),
  feature('reset_collections', 'Reset Collections', 'configuration', [{ action: 'manage', min: 'admin' }]),
  feature('roles_permissions', 'Roles & Permissions', 'configuration', [{ action: 'manage', min: 'admin' }]),
];

/** Every grantable action, flattened (tree order). */
export const PERMISSIONS: PermissionDef[] = PERMISSION_FEATURES.flatMap((f) => f.actions);

const PERMISSIONS_BY_KEY: Record<string, PermissionDef> = Object.fromEntries(
  PERMISSIONS.map((p) => [p.key, p])
);

/**
 * Pre-split umbrella keys → the action keys they were split into. These keys
 * are no longer grantable on their own, but still resolve (as "any of its
 * actions") so a page or nav link checking "can the user manage X at all" works.
 */
export const LEGACY_PERMISSION_ALIASES: Record<string, string[]> = PERMISSIONS.reduce<Record<string, string[]>>(
  (acc, p) => {
    if (p.legacyKey && !PERMISSIONS_BY_KEY[p.legacyKey]) (acc[p.legacyKey] ??= []).push(p.key);
    return acc;
  },
  {}
);

export function getPermissionDef(key: string): PermissionDef | undefined {
  return PERMISSIONS_BY_KEY[key];
}

/** True for any key `hasPermission` understands: an action key or a legacy umbrella alias. */
export function isKnownPermissionKey(key: string): boolean {
  return key in PERMISSIONS_BY_KEY || key in LEGACY_PERMISSION_ALIASES;
}

export type RolePermissionOverrides = {
  [role: string]: { [permissionKey: string]: boolean };
};

/** The value a role gets for an action with no override at all. */
export function defaultPermission(role: string, def: PermissionDef): boolean {
  return def.locked === true || roleAtLeast(role, def.defaultMinRole);
}

function resolveDef(role: string, def: PermissionDef, overrides: RolePermissionOverrides | undefined | null): boolean {
  if (def.locked) return true;
  const own = overrides?.[role]?.[def.key];
  if (typeof own === 'boolean') return own;
  const inherited = def.legacyKey ? overrides?.[role]?.[def.legacyKey] : undefined;
  if (typeof inherited === 'boolean') return inherited;
  return roleAtLeast(role, def.defaultMinRole);
}

/**
 * Effective permission check: owner/admin/super_admin always pass. Otherwise an
 * explicit override on the action wins, then one stored on its pre-split
 * umbrella key, then the action's default floor. A legacy umbrella key resolves
 * to true if the role holds any of the actions it was split into.
 */
export function hasPermission(
  role: string | undefined,
  key: string,
  overrides: RolePermissionOverrides | undefined | null
): boolean {
  if (isAlwaysAllowedRole(role)) return true;
  if (!role) return false;

  const def = getPermissionDef(key);
  if (def) return resolveDef(role, def, overrides);

  const aliasOf = LEGACY_PERMISSION_ALIASES[key];
  if (aliasOf) return aliasOf.some((k) => resolveDef(role, PERMISSIONS_BY_KEY[k], overrides));
  return false;
}

/**
 * Rewrite stored overrides in terms of the current action keys: overrides on a
 * legacy umbrella key are copied onto each of its actions that has no override
 * of its own (only where that differs from the action's default), then the
 * umbrella key is dropped. Unknown keys, locked actions and non-overridable
 * roles are removed. The effective permissions are unchanged.
 */
export function normalizeOverrides(overrides: RolePermissionOverrides | undefined | null): RolePermissionOverrides {
  const out: RolePermissionOverrides = {};
  for (const role of OVERRIDABLE_ROLES) {
    const stored = overrides?.[role];
    if (!stored || typeof stored !== 'object') continue;
    const clean: Record<string, boolean> = {};
    for (const def of PERMISSIONS) {
      if (def.locked) continue;
      const own = stored[def.key];
      if (typeof own === 'boolean') {
        clean[def.key] = own;
        continue;
      }
      const inherited = def.legacyKey ? stored[def.legacyKey] : undefined;
      if (typeof inherited === 'boolean' && inherited !== defaultPermission(role, def)) clean[def.key] = inherited;
    }
    if (Object.keys(clean).length > 0) out[role] = clean;
  }
  return out;
}
