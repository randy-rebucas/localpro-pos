export type CollectionGroup = 'stock' | 'sales' | 'customers' | 'promos' | 'loyalty' | 'store' | 'staff' | 'records';

export interface CollectionOption {
  key: string;
  /** English name; the page looks up `backupReset.collection_<key>` first. */
  label: string;
  group: CollectionGroup;
  /** Can be backed up but never cleared or restored (the server refuses it too). */
  backupOnly?: boolean;
}

/** Groups in the order the page lists them, with English names (`backupReset.group_<key>`). */
export const COLLECTION_GROUPS: { key: CollectionGroup; label: string }[] = [
  { key: 'stock', label: 'Products & stock' },
  { key: 'sales', label: 'Sales' },
  { key: 'customers', label: 'Customers' },
  { key: 'promos', label: 'Discounts & carts' },
  { key: 'loyalty', label: 'Loyalty' },
  { key: 'store', label: 'Store setup' },
  { key: 'staff', label: 'Staff & bookings' },
  { key: 'records', label: 'Records' },
];

/** Must match COLLECTION_MODELS in app/api/tenants/[slug]/reset-collections/route.ts. */
export const BACKUP_RESET_COLLECTIONS: CollectionOption[] = [
  { key: 'products', label: 'Products', group: 'stock' },
  { key: 'productBundles', label: 'Product Bundles', group: 'stock' },
  { key: 'categories', label: 'Categories', group: 'stock' },
  { key: 'stockMovements', label: 'Stock Movements', group: 'stock' },

  { key: 'transactions', label: 'Transactions', group: 'sales' },
  { key: 'payments', label: 'Payments', group: 'sales' },
  { key: 'invoices', label: 'Invoices', group: 'sales' },
  { key: 'cashDrawerSessions', label: 'Cash Drawer Sessions', group: 'sales' },
  { key: 'expenses', label: 'Expenses', group: 'sales' },

  { key: 'customers', label: 'Customers', group: 'customers' },
  { key: 'addresses', label: 'Customer Addresses', group: 'customers' },
  { key: 'customerOTPs', label: 'Customer OTPs', group: 'customers' },

  { key: 'discounts', label: 'Discounts', group: 'promos' },
  { key: 'savedCarts', label: 'Saved Carts', group: 'promos' },

  { key: 'loyaltyConfigs', label: 'Loyalty Program Config', group: 'loyalty' },
  { key: 'loyaltyTransactions', label: 'Loyalty Transactions', group: 'loyalty' },

  { key: 'taxRules', label: 'Tax Rules', group: 'store' },
  { key: 'branches', label: 'Branches', group: 'store' },

  { key: 'attendance', label: 'Attendance Records', group: 'staff' },
  { key: 'bookings', label: 'Bookings', group: 'staff' },

  { key: 'auditLogs', label: 'Audit Logs', group: 'records', backupOnly: true },
];

/** Keys that may be cleared: everything except backup-only collections. */
export function clearableKeys(keys: string[]): string[] {
  return keys.filter((key) => !BACKUP_RESET_COLLECTIONS.find((col) => col.key === key)?.backupOnly);
}

/** File size in KB with two decimals. */
export function formatFileSize(bytes: number): string {
  return (bytes / 1024).toFixed(2);
}
