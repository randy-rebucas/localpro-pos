/**
 * Postgres/Prisma equivalent of scripts/reset-collections.ts, for use once
 * the migration cutover repoints the app at Postgres.
 *
 * Unlike Mongo, Postgres enforces FK constraints, so wiping data isn't a
 * bare deleteMany per table:
 *   --all wipes every table with TRUNCATE ... CASCADE (single statement,
 *     no ordering to get right).
 *   --tenant=<slug> nulls the circular User<->Branch refs for that tenant,
 *     then deletes the Tenant row — nearly every table has
 *     onDelete: Cascade back to Tenant, so that one delete cascades through
 *     almost all tenant-scoped data automatically.
 *   --table=<name> issues TRUNCATE ... CASCADE on that table, which will
 *     also empty anything with a FK into it (e.g. --table=products also
 *     empties transaction_items, product_bundle_items, etc.) — this is
 *     called out explicitly before the confirmation prompt.
 *
 * Usage:
 *   npx tsx scripts/reset-tables-postgres.ts --all [--force]
 *   npx tsx scripts/reset-tables-postgres.ts --tenant=<slug> [--force]
 *   npx tsx scripts/reset-tables-postgres.ts --table=products,categories [--force]
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import readline from 'readline';
import prisma from '../lib/prisma';

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(query, (answer) => { rl.close(); res(answer); }));
}

// Every table Prisma manages, in db (snake_case) form, excluding the
// migration-only _migration_id_map table.
const ALL_TABLES = [
  'tenants', 'subscription_plans', 'tax_rules', 'feature_flag_overrides', 'addresses', 'files',
  'users', 'branches', 'devices', 'tables', 'super_admin_actions', 'audit_logs', 'archived_audit_logs',
  'categories', 'products', 'product_branch_stock', 'product_bundles', 'product_bundle_items',
  'product_channel_listings', 'discounts', 'coupons', 'loyalty_configs', 'campaigns',
  'tenant_ecommerce_integrations', 'customers', 'customer_otps', 'customer_balance_payments',
  'bookings', 'recurring_booking_templates', 'prescriptions', 'prescription_items', 'saved_carts',
  'cash_drawer_sessions', 'transactions', 'transaction_items', 'transaction_split_payments',
  'payments', 'invoices', 'stock_movements', 'expenses', 'offline_transactions', 'z_readings',
  'loyalty_transactions', 'billing_events', 'subscriptions', 'subscription_billing_history_entries',
  'attendances', 'counters', 'revoked_tokens', 'user_revocations', 'pos_sessions',
] as const;

async function resetAll() {
  console.log(`This will TRUNCATE CASCADE all ${ALL_TABLES.length} tables — every row in the database is deleted.`);
  const args = process.argv.slice(2);
  if (!args.includes('--force')) {
    const answer = await askQuestion('Are you sure? (yes/no): ');
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      return;
    }
  }
  const quoted = ALL_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE;`);
  console.log(`✓ Truncated ${ALL_TABLES.length} tables.`);
}

async function resetTenant(slug: string, force: boolean) {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error(`✗ Tenant "${slug}" not found`);
    process.exit(1);
  }

  const [userCount, productCount, txnCount] = await Promise.all([
    prisma.user.count({ where: { tenantId: tenant.id } }),
    prisma.product.count({ where: { tenantId: tenant.id } }),
    prisma.transaction.count({ where: { tenantId: tenant.id } }),
  ]);

  console.log(`Target tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`  ${userCount} users, ${productCount} products, ${txnCount} transactions will be deleted (cascade).`);

  if (!force) {
    const answer = await askQuestion('Are you sure you want to delete this tenant and all its data? (yes/no): ');
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      return;
    }
  }

  // Break the circular User<->Branch FK before the cascade delete.
  await prisma.branch.updateMany({ where: { tenantId: tenant.id }, data: { managerId: null } });
  await prisma.user.updateMany({ where: { tenantId: tenant.id }, data: { branchId: null } });

  await prisma.tenant.delete({ where: { id: tenant.id } });
  console.log(`✓ Deleted tenant "${slug}" and all cascaded data.`);
}

async function resetTables(tableNames: string[], force: boolean) {
  const valid = tableNames.filter((t) => (ALL_TABLES as readonly string[]).includes(t));
  const invalid = tableNames.filter((t) => !(ALL_TABLES as readonly string[]).includes(t));
  if (invalid.length) {
    console.error(`✗ Unknown table(s): ${invalid.join(', ')}`);
    console.log(`Available: ${ALL_TABLES.join(', ')}`);
    process.exit(1);
  }
  if (valid.length === 0) {
    console.error('✗ No valid tables specified');
    process.exit(1);
  }

  console.log(`This will TRUNCATE CASCADE: ${valid.join(', ')}`);
  console.log('CASCADE also empties any table with a foreign key into these — review before confirming.');

  if (!force) {
    const answer = await askQuestion('Are you sure? (yes/no): ');
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      return;
    }
  }

  const quoted = valid.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE;`);
  console.log(`✓ Truncated: ${valid.join(', ')}`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const all = args.includes('--all');
  const tenantSlug = args.find((a) => a.startsWith('--tenant='))?.split('=')[1];
  const tableArg = args.find((a) => a.startsWith('--table='))?.split('=')[1];

  if (all) {
    await resetAll();
  } else if (tenantSlug) {
    await resetTenant(tenantSlug, force);
  } else if (tableArg) {
    await resetTables(tableArg.split(',').map((t) => t.trim()), force);
  } else {
    console.error('✗ No action specified. Use --all, --tenant=<slug>, or --table=<name>[,<name>...]');
    console.log('\nExamples:');
    console.log('  npx tsx scripts/reset-tables-postgres.ts --all');
    console.log('  npx tsx scripts/reset-tables-postgres.ts --tenant=default');
    console.log('  npx tsx scripts/reset-tables-postgres.ts --table=transactions,products');
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('✗ Error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
