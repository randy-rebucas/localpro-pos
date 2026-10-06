/**
 * Registry of every tenant-isolated table covered by the tenant
 * Backup / Restore / Reset tool (`/api/tenants/[slug]/reset-collections`).
 *
 * Pure data (no Prisma import) so both the admin page and the API route can
 * share it. `__tests__/backup-reset-collections.test.ts` parses
 * `prisma/schema.prisma` and fails when a tenant-scoped model is neither
 * covered here nor listed in `EXCLUDED_TENANT_MODELS`, when a cascade child
 * table is missing, or when `RESET_ORDER` / `blockedBy` disagree with the
 * schema's foreign keys. Update this file whenever a tenant model is added.
 */

export interface ChildSpec {
  /** Key used for this table's rows inside the backup JSON. */
  key: string;
  /** Prisma model name (PascalCase); the client delegate is its camelCase form. */
  model: string;
  /** Collection key or child key this table hangs off. */
  parent: string;
  /** Relation field on this model pointing at the parent (used for tenant scoping). */
  parentRelation: string;
  /** FK column holding the parent's id. */
  fk: string;
  /** True when the table also has its own `tenantId` column. */
  hasTenantId?: boolean;
}

export interface CollectionSpec {
  key: string;
  label: string;
  group: CollectionGroup;
  /** Prisma model name (PascalCase). */
  model: string;
  /**
   * Tables without their own selection that are deleted with this collection
   * (ON DELETE CASCADE) and therefore must be exported/restored with it.
   * Parents are listed before their own children.
   */
  children?: ChildSpec[];
  /**
   * Collections holding a required (ON DELETE RESTRICT) reference to this
   * one: this collection cannot be reset unless those are reset too.
   */
  blockedBy?: string[];
  /** Columns dropped on restore (circular references that can't be inserted). */
  stripOnRestore?: string[];
}

export type CollectionGroup =
  | 'catalog'
  | 'sales'
  | 'customers'
  | 'promotions'
  | 'inventory'
  | 'services'
  | 'staff'
  | 'accounting'
  | 'reports'
  | 'settings'
  | 'audit';

export const COLLECTION_GROUPS: { key: CollectionGroup; label: string }[] = [
  { key: 'catalog', label: 'Products & Catalog' },
  { key: 'sales', label: 'Sales & Transactions' },
  { key: 'customers', label: 'Customers' },
  { key: 'promotions', label: 'Discounts, Loyalty & Tax' },
  { key: 'inventory', label: 'Inventory & Purchasing' },
  { key: 'services', label: 'Orders & Services' },
  { key: 'staff', label: 'Staff, Branches & Cash' },
  { key: 'accounting', label: 'Accounting & Files' },
  { key: 'reports', label: 'Sales Summaries' },
  { key: 'settings', label: 'Store Settings' },
  { key: 'audit', label: 'Audit & Notifications' },
];

export const BACKUP_COLLECTION_SPECS: CollectionSpec[] = [
  // Products & Catalog
  {
    key: 'products', label: 'Products', group: 'catalog', model: 'Product',
    blockedBy: ['stockMovements', 'productSalesSummaries', 'savedCarts', 'productBundles', 'productChannelListings', 'purchaseOrders', 'stockTransfers'],
    children: [
      { key: 'productVariations', model: 'ProductVariation', parent: 'products', parentRelation: 'product', fk: 'productId' },
      { key: 'productBranchStocks', model: 'ProductBranchStock', parent: 'products', parentRelation: 'product', fk: 'productId' },
      { key: 'productModifiers', model: 'ProductModifier', parent: 'products', parentRelation: 'product', fk: 'productId' },
      { key: 'productModifierOptions', model: 'ProductModifierOption', parent: 'productModifiers', parentRelation: 'modifier', fk: 'modifierId' },
      { key: 'productRestaurantDetails', model: 'ProductRestaurantDetails', parent: 'products', parentRelation: 'product', fk: 'productId' },
      { key: 'productLaundryDetails', model: 'ProductLaundryDetails', parent: 'products', parentRelation: 'product', fk: 'productId' },
      { key: 'productServiceDetails', model: 'ProductServiceDetails', parent: 'products', parentRelation: 'product', fk: 'productId' },
      { key: 'productPharmacyDetails', model: 'ProductPharmacyDetails', parent: 'products', parentRelation: 'product', fk: 'productId' },
    ],
  },
  {
    key: 'productBundles', label: 'Product Bundles', group: 'catalog', model: 'ProductBundle',
    children: [
      { key: 'productBundleItems', model: 'ProductBundleItem', parent: 'productBundles', parentRelation: 'bundle', fk: 'bundleId' },
    ],
  },
  { key: 'categories', label: 'Categories', group: 'catalog', model: 'Category' },
  { key: 'productChannelListings', label: 'Channel Listings', group: 'catalog', model: 'ProductChannelListing' },

  // Sales & Transactions
  {
    key: 'transactions', label: 'Transactions', group: 'sales', model: 'Transaction',
    blockedBy: ['payments', 'kitchenTickets'],
    children: [
      { key: 'transactionItems', model: 'TransactionItem', parent: 'transactions', parentRelation: 'transaction', fk: 'transactionId' },
      { key: 'transactionItemModifiers', model: 'TransactionItemModifier', parent: 'transactionItems', parentRelation: 'transactionItem', fk: 'transactionItemId' },
      { key: 'transactionSplitPayments', model: 'TransactionSplitPayment', parent: 'transactions', parentRelation: 'transaction', fk: 'transactionId' },
    ],
  },
  { key: 'payments', label: 'Payments', group: 'sales', model: 'Payment' },
  {
    key: 'invoices', label: 'Invoices', group: 'sales', model: 'Invoice',
    children: [
      { key: 'invoiceItems', model: 'InvoiceItem', parent: 'invoices', parentRelation: 'invoice', fk: 'invoiceId' },
    ],
  },
  {
    key: 'savedCarts', label: 'Saved Carts', group: 'sales', model: 'SavedCart',
    children: [
      { key: 'savedCartItems', model: 'SavedCartItem', parent: 'savedCarts', parentRelation: 'savedCart', fk: 'savedCartId' },
    ],
  },
  {
    key: 'offlineTransactions', label: 'Offline Transactions', group: 'sales', model: 'OfflineTransaction',
    children: [
      { key: 'offlineTransactionItems', model: 'OfflineTransactionItem', parent: 'offlineTransactions', parentRelation: 'offlineTransaction', fk: 'offlineTransactionId' },
    ],
  },
  { key: 'zReadings', label: 'Z-Readings', group: 'sales', model: 'ZReading' },

  // Customers
  {
    key: 'customers', label: 'Customers', group: 'customers', model: 'Customer',
    blockedBy: ['customerBalancePayments', 'loyaltyTransactions'],
    children: [
      { key: 'customerAddresses', model: 'CustomerAddress', parent: 'customers', parentRelation: 'customer', fk: 'customerId' },
    ],
  },
  {
    key: 'customerGroups', label: 'Customer Groups', group: 'customers', model: 'CustomerGroup',
    children: [
      { key: 'customerGroupMembers', model: 'CustomerGroupMember', parent: 'customerGroups', parentRelation: 'group', fk: 'groupId' },
    ],
  },
  { key: 'customerBalancePayments', label: 'Customer Balance Payments', group: 'customers', model: 'CustomerBalancePayment' },
  { key: 'customerOTPs', label: 'Customer OTPs', group: 'customers', model: 'CustomerOTP' },
  { key: 'campaigns', label: 'Campaigns', group: 'customers', model: 'Campaign' },

  // Discounts, Loyalty & Tax
  { key: 'discounts', label: 'Discounts', group: 'promotions', model: 'Discount' },
  { key: 'loyaltyConfigs', label: 'Loyalty Program Config', group: 'promotions', model: 'LoyaltyConfig' },
  { key: 'loyaltyTransactions', label: 'Loyalty Transactions', group: 'promotions', model: 'LoyaltyTransaction' },
  {
    key: 'taxRules', label: 'Tax Rules', group: 'promotions', model: 'TaxRule',
    children: [
      { key: 'taxRuleCategories', model: 'TaxRuleCategory', parent: 'taxRules', parentRelation: 'taxRule', fk: 'taxRuleId' },
      { key: 'taxRuleProducts', model: 'TaxRuleProduct', parent: 'taxRules', parentRelation: 'taxRule', fk: 'taxRuleId' },
    ],
  },

  // Inventory & Purchasing
  { key: 'stockMovements', label: 'Stock Movements', group: 'inventory', model: 'StockMovement' },
  {
    key: 'stockTransfers', label: 'Stock Transfers', group: 'inventory', model: 'StockTransfer',
    children: [
      { key: 'stockTransferItems', model: 'StockTransferItem', parent: 'stockTransfers', parentRelation: 'stockTransfer', fk: 'stockTransferId' },
    ],
  },
  { key: 'suppliers', label: 'Suppliers', group: 'inventory', model: 'Supplier', blockedBy: ['purchaseOrders'] },
  {
    key: 'purchaseOrders', label: 'Purchase Orders', group: 'inventory', model: 'PurchaseOrder',
    children: [
      { key: 'purchaseOrderItems', model: 'PurchaseOrderItem', parent: 'purchaseOrders', parentRelation: 'purchaseOrder', fk: 'purchaseOrderId' },
    ],
  },

  // Orders & Services
  { key: 'bookings', label: 'Bookings', group: 'services', model: 'Booking' },
  { key: 'recurringBookingTemplates', label: 'Recurring Booking Templates', group: 'services', model: 'RecurringBookingTemplate' },
  { key: 'deposits', label: 'Deposits', group: 'services', model: 'Deposit' },
  {
    key: 'kitchenTickets', label: 'Kitchen Tickets', group: 'services', model: 'KitchenTicket',
    children: [
      { key: 'kitchenTicketItems', model: 'KitchenTicketItem', parent: 'kitchenTickets', parentRelation: 'kitchenTicket', fk: 'kitchenTicketId', hasTenantId: true },
    ],
  },
  // currentOrderId points back at transactions (which point at tables), so it
  // can't be inserted in either order; an open-order pointer is transient.
  { key: 'posTables', label: 'Restaurant Tables', group: 'services', model: 'PosTable', stripOnRestore: ['currentOrderId'] },
  { key: 'deliveryOrders', label: 'Delivery Orders', group: 'services', model: 'DeliveryOrder' },
  {
    key: 'laundryOrders', label: 'Laundry Orders', group: 'services', model: 'LaundryOrder',
    children: [
      { key: 'laundryOrderItems', model: 'LaundryOrderItem', parent: 'laundryOrders', parentRelation: 'laundryOrder', fk: 'laundryOrderId' },
    ],
  },
  {
    key: 'workOrders', label: 'Work Orders', group: 'services', model: 'WorkOrder',
    children: [
      { key: 'workOrderItems', model: 'WorkOrderItem', parent: 'workOrders', parentRelation: 'workOrder', fk: 'workOrderId' },
      { key: 'workOrderTimeEntries', model: 'WorkOrderTimeEntry', parent: 'workOrders', parentRelation: 'workOrder', fk: 'workOrderId', hasTenantId: true },
    ],
  },
  {
    key: 'prescriptions', label: 'Prescriptions', group: 'services', model: 'Prescription',
    children: [
      { key: 'prescriptionItems', model: 'PrescriptionItem', parent: 'prescriptions', parentRelation: 'prescription', fk: 'prescriptionId' },
    ],
  },

  // Staff, Branches & Cash
  { key: 'branches', label: 'Branches', group: 'staff', model: 'Branch', blockedBy: ['devices', 'stockTransfers', 'branchSalesSummaries'] },
  { key: 'devices', label: 'Devices', group: 'staff', model: 'Device' },
  { key: 'attendance', label: 'Attendance Records', group: 'staff', model: 'Attendance' },
  { key: 'cashDrawerSessions', label: 'Cash Drawer Sessions', group: 'staff', model: 'CashDrawerSession' },
  { key: 'expenses', label: 'Expenses', group: 'staff', model: 'Expense' },
  { key: 'addresses', label: 'User Addresses', group: 'staff', model: 'Address' },

  // Accounting & Files
  { key: 'ledgerAccounts', label: 'Ledger Accounts', group: 'accounting', model: 'LedgerAccount', blockedBy: ['journalEntries'] },
  {
    key: 'journalEntries', label: 'Journal Entries', group: 'accounting', model: 'JournalEntry',
    children: [
      { key: 'journalLines', model: 'JournalLine', parent: 'journalEntries', parentRelation: 'journalEntry', fk: 'journalEntryId' },
    ],
  },
  { key: 'files', label: 'Uploaded File Records', group: 'accounting', model: 'File' },

  // Sales Summaries
  { key: 'dailySalesSummaries', label: 'Daily Sales Summaries', group: 'reports', model: 'DailySalesSummary' },
  { key: 'monthlySalesSummaries', label: 'Monthly Sales Summaries', group: 'reports', model: 'MonthlySalesSummary' },
  { key: 'productSalesSummaries', label: 'Product Sales Summaries', group: 'reports', model: 'ProductSalesSummary' },
  { key: 'branchSalesSummaries', label: 'Branch Sales Summaries', group: 'reports', model: 'BranchSalesSummary' },
  { key: 'cashierSalesSummaries', label: 'Cashier Sales Summaries', group: 'reports', model: 'CashierSalesSummary' },

  // Store Settings
  {
    key: 'businessHours', label: 'Business Hours', group: 'settings', model: 'TenantBusinessHour',
    children: [
      { key: 'businessHourBreaks', model: 'TenantBusinessHourBreak', parent: 'businessHours', parentRelation: 'businessHour', fk: 'businessHourId' },
    ],
  },
  { key: 'specialHours', label: 'Special Hours', group: 'settings', model: 'TenantSpecialHours' },
  { key: 'holidays', label: 'Holidays', group: 'settings', model: 'TenantHoliday' },
  { key: 'exchangeRates', label: 'Exchange Rates', group: 'settings', model: 'TenantExchangeRate' },
  { key: 'receiptTemplates', label: 'Receipt Templates', group: 'settings', model: 'TenantReceiptTemplate' },
  { key: 'themeVariables', label: 'Theme Variables', group: 'settings', model: 'TenantThemeVariable' },
  { key: 'practitionerLicenses', label: 'Practitioner Licenses', group: 'settings', model: 'TenantPractitionerLicense' },

  // Audit & Notifications
  { key: 'auditLogs', label: 'Audit Logs', group: 'audit', model: 'AuditLog' },
  { key: 'archivedAuditLogs', label: 'Archived Audit Logs', group: 'audit', model: 'ArchivedAuditLog' },
  { key: 'notifications', label: 'Notifications', group: 'audit', model: 'Notification' },
];

/**
 * Tenant-scoped models intentionally NOT exposed to tenant backup/reset.
 * Each needs a reason; the coverage test fails on any tenant model that is in
 * neither list.
 */
export const EXCLUDED_TENANT_MODELS: Record<string, string> = {
  Tenant: 'The tenant record itself.',
  TenantSettings: 'Core store configuration; managed in Settings, and the tenant cannot run without it.',
  User: 'Staff accounts and password hashes; resetting would lock the tenant out and backups must not carry credentials.',
  Subscription: 'Billing state owned by the platform (super-admin).',
  BillingEvent: 'Billing history owned by the platform (super-admin).',
  FeatureFlagOverride: 'Granted by super-admin, not tenant data.',
  TenantRolePermissionOverride: 'Security configuration; managed in Roles & Permissions.',
  TenantEcommerceIntegration: 'Holds third-party API credentials that must not be exported to a file.',
  Counter: 'Receipt/invoice number sequences must never restart (BIR: no reused OR numbers).',
};

/** FK-safe delete order: every table appears before the tables it references. Restore runs in reverse. */
export const RESET_ORDER: string[] = [
  'auditLogs', 'archivedAuditLogs', 'notifications',
  'payments', 'kitchenTickets', 'customerBalancePayments', 'loyaltyTransactions', 'stockMovements',
  'productSalesSummaries', 'branchSalesSummaries', 'dailySalesSummaries', 'monthlySalesSummaries', 'cashierSalesSummaries',
  'deposits',
  'invoices', 'prescriptions', 'offlineTransactions', 'laundryOrders', 'deliveryOrders', 'workOrders', 'zReadings',
  'transactions',
  'posTables', 'devices',
  'savedCarts', 'productBundles', 'productChannelListings', 'purchaseOrders', 'stockTransfers', 'taxRules',
  'products',
  'suppliers', 'categories',
  'discounts', 'campaigns', 'customerOTPs', 'customerGroups', 'addresses',
  'customers',
  'journalEntries', 'ledgerAccounts',
  'cashDrawerSessions', 'expenses', 'files', 'attendance', 'recurringBookingTemplates', 'bookings',
  'branches',
  'loyaltyConfigs', 'businessHours', 'specialHours', 'holidays', 'exchangeRates', 'receiptTemplates', 'themeVariables', 'practitionerLicenses',
];

const SPEC_BY_KEY = new Map(BACKUP_COLLECTION_SPECS.map((s) => [s.key, s]));

export function getCollectionSpec(key: string): CollectionSpec | undefined {
  return SPEC_BY_KEY.get(key);
}

export function isCollectionKey(key: string): boolean {
  return SPEC_BY_KEY.has(key);
}

/** Prisma client delegate name for a model (`ProductVariation` -> `productVariation`). */
export function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

export function orderForReset(collections: string[]): string[] {
  const set = new Set(collections);
  return RESET_ORDER.filter((c) => set.has(c));
}

/**
 * For each selected collection that can't be deleted on its own, the
 * unselected collections still referencing it. Empty when the selection is
 * safe to reset.
 */
export function getMissingResetDependencies(selected: string[]): { collection: string; missing: string[] }[] {
  const set = new Set(selected);
  const out: { collection: string; missing: string[] }[] = [];
  for (const key of selected) {
    const missing = (SPEC_BY_KEY.get(key)?.blockedBy || []).filter((b) => !set.has(b));
    if (missing.length > 0) out.push({ collection: key, missing });
  }
  return out;
}

/** The selection plus every collection needed to reset it (transitively). */
export function withResetDependencies(selected: string[]): string[] {
  const result = new Set(selected);
  const queue = [...selected];
  while (queue.length > 0) {
    const key = queue.shift()!;
    for (const dep of SPEC_BY_KEY.get(key)?.blockedBy || []) {
      if (!result.has(dep)) {
        result.add(dep);
        queue.push(dep);
      }
    }
  }
  return BACKUP_COLLECTION_SPECS.map((s) => s.key).filter((k) => result.has(k));
}

export function collectionLabel(key: string): string {
  return SPEC_BY_KEY.get(key)?.label || key;
}
