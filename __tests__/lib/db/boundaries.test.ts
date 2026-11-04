/**
 * Models whose domain has moved to the repository layer (lib/db) may only be
 * imported by the Mongo repository implementation, or by the call sites
 * listed here that belong to a later domain. When a later domain is
 * converted, its entries are removed. A new direct import fails this test.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SCANNED_DIRS = ['app', 'lib', 'components', 'contexts', 'hooks'];

/** Model → files still allowed to import it, with the domain that will convert them. */
const MIGRATED: Record<string, string[]> = {
  Category: [
    'app/api/tenants/[slug]/reset-collections/route.ts', // tenant tooling (Phase 9 rewrite)
    'app/api/tenants/[slug]/seed-sample-data/route.ts', // tenant tooling
  ],
  Branch: [
    'app/api/tenants/[slug]/reset-collections/route.ts',
  ],
  Device: [],
  Table: [],
  Expense: [
    'app/api/transactions/stats/route.ts', // analytics
    'lib/analytics.ts', // analytics
    'app/api/tenants/[slug]/reset-collections/route.ts',
  ],
  Discount: [
    'app/api/tenants/[slug]/reset-collections/route.ts',
    'app/api/tenants/[slug]/seed-sample-data/route.ts',
  ],
  Coupon: [],
  FeatureFlagOverride: [],
  LoyaltyConfig: [
    'app/api/tenants/[slug]/reset-collections/route.ts',
  ],

  // Domain 2 (identity)
  Tenant: [
    'app/api/super-admin/analytics/route.ts', // aggregate (analytics)
    'app/api/tenants/[slug]/reset-collections/route.ts',
    'app/api/tenants/[slug]/seed-sample-data/route.ts',
    // Tenant.find({ status: 'active' }) matches no tenants (Tenant has no status
    // field), so these automations only run with an explicit tenantId. Kept as-is
    // until the product decision in docs/postgres-migration.md is made.
    'lib/automations/customer-lifetime-value.ts',
    'lib/automations/dynamic-pricing.ts',
    'lib/automations/low-stock-alerts.ts',
    'lib/automations/multi-branch-sync.ts',
    'lib/automations/predictive-stock.ts',
    'lib/automations/product-performance.ts',
    'lib/automations/purchase-orders.ts',
    'lib/automations/sales-trend-analysis.ts',
    'lib/automations/stock-transfer.ts',
  ],
  User: [],
  CustomerOTP: ['app/api/tenants/[slug]/reset-collections/route.ts'],
  Address: ['app/api/tenants/[slug]/reset-collections/route.ts'],

  // Domain 3 (billing)
  Subscription: ['app/api/super-admin/analytics/route.ts'], // MRR / status aggregates (analytics)
  SubscriptionPlan: [],
  BillingEvent: [],

  // Domain 4 (catalog)
  Product: [
    'lib/analytics.ts', // analytics
    'app/api/tenants/[slug]/reset-collections/route.ts',
    'app/api/tenants/[slug]/seed-sample-data/route.ts',
  ],
  ProductBundle: [
    'app/api/tenants/[slug]/reset-collections/route.ts',
  ],
  ProductChannelListing: [],
  TaxRule: ['app/api/tenants/[slug]/reset-collections/route.ts'],

  // Domain 5 (customers and CRM)
  Customer: [
    'app/api/tenants/[slug]/reset-collections/route.ts',
    'app/api/tenants/[slug]/seed-sample-data/route.ts',
  ],
  CustomerBalancePayment: [],
  LoyaltyTransaction: [
    'app/api/tenants/[slug]/reset-collections/route.ts',
  ],
  Campaign: [],

  // Domain 6 (operations)
  Booking: ['app/api/tenants/[slug]/reset-collections/route.ts'],
  RecurringBookingTemplate: [],
  Attendance: ['app/api/tenants/[slug]/reset-collections/route.ts'],
  CashDrawerSession: [
    'lib/analytics.ts', // analytics
    'app/api/tenants/[slug]/reset-collections/route.ts',
  ],
  ZReading: [],

  // Domain 7 (sales core)
  Transaction: [
    // Reporting aggregates (analytics)
    'app/api/crm/campaigns/[id]/send/route.ts',
    'app/api/crm/segments/route.ts',
    'app/api/customers/[id]/profile/route.ts',
    'app/api/insights/upsell/route.ts',
    'app/api/super-admin/analytics/route.ts',
    'app/api/transactions/stats/route.ts',
    'lib/analytics.ts',
    'lib/automations/abandoned-carts.ts',
    'lib/automations/break-detection.ts',
    'lib/automations/cash-drawer-closure.ts',
    'lib/automations/customer-lifetime-value.ts',
    'lib/automations/predictive-stock.ts',
    'lib/automations/product-performance.ts',
    'lib/automations/sales-trend-analysis.ts',
    'lib/automations/suspicious-activity.ts',
    'lib/transaction-indexes.ts', // Mongo index maintenance, removed with Mongoose
    'app/api/tenants/[slug]/reset-collections/route.ts',
  ],
  Payment: ['app/api/tenants/[slug]/reset-collections/route.ts'],
  Invoice: ['app/api/tenants/[slug]/reset-collections/route.ts'],
  OfflineTransaction: [],
  SavedCart: ['app/api/tenants/[slug]/reset-collections/route.ts'],
  PosSession: [],
  StockMovement: [
    'app/api/insights/stock-predictions/route.ts', // aggregate (analytics)
    // Writes 'transfer-out'/'transfer-in', which the enum rejects. Kept as-is until
    // the bug in docs/postgres-migration.md (domain 4) is decided.
    'lib/automations/stock-transfer.ts',
    'app/api/tenants/[slug]/reset-collections/route.ts',
  ],
  Prescription: [],
  TenantEcommerceIntegration: [],

  // Domain 8 (audit)
  AuditLog: ['app/api/tenants/[slug]/reset-collections/route.ts'],
  ArchivedAuditLog: [],
  SuperAdminAction: [],
  File: [],
};

const REPO_IMPL = /^lib\/db\/mongo\//;

function sourceFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

const files = SCANNED_DIRS.flatMap(sourceFiles);

function importers(model: string): string[] {
  // Also bare `import '@/models/X'` (registers a schema for populate()) and dynamic import()
  const pattern = new RegExp(`(from |import |import\\()['"]@/models/${model}['"]`);
  return files.filter((f) => {
    if (REPO_IMPL.test(f)) return false;
    // Type-only imports (ITenantSettings) and bare `import '@/models/X'` lines,
    // which only register a schema for another domain's populate(), can't query
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    return lines.some(
      (line) => pattern.test(line) && !/^\s*import\s+type\s/.test(line) && !/^\s*import\s+['"]/.test(line)
    );
  });
}

describe('repository boundaries', () => {
  it.each(Object.keys(MIGRATED))('%s is only imported by lib/db or listed call sites', (model) => {
    expect(importers(model).sort()).toEqual([...MIGRATED[model]].sort());
  });
});
