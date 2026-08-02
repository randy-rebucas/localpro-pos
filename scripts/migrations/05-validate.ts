/**
 * Validates the Postgres import against the MongoDB export: row-count
 * parity (accounting for known/logged skips), financial-total spot checks,
 * and referential/uniqueness sanity. Run after 03-transform-import.ts.
 *
 * Usage:
 *   npx tsx scripts/migrations/05-validate.ts
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import prisma from '../../lib/prisma';
import { loadCollection } from './lib/helpers';

let failures = 0;

function check(label: string, pass: boolean, detail?: string) {
  const status = pass ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!pass) failures++;
}

async function rowCountParity() {
  console.log('\n--- Row count parity (Mongo export -> Postgres) ---');

  const simple: Array<[string, () => Promise<number>, number]> = [
    ['tenants', () => prisma.tenant.count(), 0],
    ['subscriptionplans', () => prisma.subscriptionPlan.count(), 0],
    ['users', () => prisma.user.count(), 0],
    ['tables', () => prisma.table.count(), 0],
    ['files', () => prisma.file.count(), 0],
    ['auditlogs', () => prisma.auditLog.count(), 0],
    ['superadminactions', () => prisma.superAdminAction.count(), 0],
    ['categories', () => prisma.category.count(), 0],
    ['productbundles', () => prisma.productBundle.count(), 0],
    ['discounts', () => prisma.discount.count(), 0],
    ['customers', () => prisma.customer.count(), 0],
    ['savedcarts', () => prisma.savedCart.count(), 0],
    ['cashdrawersessions', () => prisma.cashDrawerSession.count(), 0],
    ['payments', () => prisma.payment.count(), 0],
    ['invoices', () => prisma.invoice.count(), 0],
    ['expenses', () => prisma.expense.count(), 0],
    ['subscriptions', () => prisma.subscription.count(), 0],
    ['billingevents', () => prisma.billingEvent.count(), 0],
    ['counters', () => prisma.counter.count(), 0],
    ['revokedtokens', () => prisma.revokedToken.count(), 0],
    ['userrevocations', () => prisma.userRevocation.count(), 0],
    ['possessions', () => prisma.posSession.count(), 0], // PosSession
  ];

  for (const [collection, countFn, knownSkips] of simple) {
    const mongoDocs = await loadCollection(collection);
    const pgCount = await countFn();
    const expected = mongoDocs.length - knownSkips;
    check(`${collection}: ${pgCount} rows (expected ${expected})`, pgCount === expected);
  }

  // Known-skip cases (documented, not silent)
  const products = await loadCollection('products');
  const productCount = await prisma.product.count();
  check(`products: ${productCount} rows (expected ${products.length - 1}, 1 known orphan without tenantId)`, productCount === products.length - 1);

  const transactions = await loadCollection('transactions');
  const txnCount = await prisma.transaction.count();
  check(`transactions: ${txnCount} rows (expected ${transactions.length - 1}, 1 known orphan)`, txnCount === transactions.length - 1);

  const stockMovements = await loadCollection('stockmovements');
  const smCount = await prisma.stockMovement.count();
  check(`stockmovements: ${smCount} rows (expected <= ${stockMovements.length}, some reference the orphaned product)`, smCount <= stockMovements.length && smCount > 0);

  // 1-to-many expansions: sum of embedded array lengths must equal child-table row counts
  // (excluding the known orphan transaction, which was skipped entirely)
  const txnItemsExpected = (transactions as any[])
    .filter((t) => t.tenantId && t.subtotal != null)
    .reduce((sum, t) => sum + (t.items?.length ?? 0), 0);
  const txnItemsActual = await prisma.transactionItem.count();
  check(`transaction_items: ${txnItemsActual} rows (expected ${txnItemsExpected} from embedded items[], excluding orphan)`, txnItemsActual === txnItemsExpected);

  const bundles = await loadCollection('productbundles');
  const bundleItemsExpected = (bundles as any[]).reduce((sum, b) => sum + (b.items?.length ?? 0), 0);
  const bundleItemsActual = await prisma.productBundleItem.count();
  check(`product_bundle_items: ${bundleItemsActual} rows (expected ${bundleItemsExpected})`, bundleItemsActual === bundleItemsExpected);

  const subs = await loadCollection('subscriptions');
  const billingHistoryExpected = (subs as any[]).reduce((sum, s) => sum + (s.billingHistory?.length ?? 0), 0);
  const billingHistoryActual = await prisma.subscriptionBillingHistoryEntry.count();
  check(`subscription_billing_history_entries: ${billingHistoryActual} rows (expected ${billingHistoryExpected})`, billingHistoryActual === billingHistoryExpected);
}

async function financialTotals() {
  console.log('\n--- Financial total spot checks ---');

  const transactions = await loadCollection('transactions');
  const mongoTotalSum = (transactions as any[])
    .filter((t) => t.tenantId && t.subtotal != null) // exclude the known orphan
    .reduce((sum, t) => sum + (t.total ?? 0), 0);

  const pgTxns = await prisma.transaction.findMany({ select: { total: true } });
  const pgTotalSum = pgTxns.reduce((sum, t) => sum + Number(t.total), 0);

  const diff = Math.abs(mongoTotalSum - pgTotalSum);
  check(
    `Sum of Transaction.total: Mongo=${mongoTotalSum.toFixed(2)} Postgres=${pgTotalSum.toFixed(2)} (diff ${diff.toFixed(4)})`,
    diff < 0.01
  );

  const payments = await loadCollection('payments');
  const mongoPaymentSum = (payments as any[]).reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const pgPayments = await prisma.payment.findMany({ select: { amount: true } });
  const pgPaymentSum = pgPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const paymentDiff = Math.abs(mongoPaymentSum - pgPaymentSum);
  check(
    `Sum of Payment.amount: Mongo=${mongoPaymentSum.toFixed(2)} Postgres=${pgPaymentSum.toFixed(2)} (diff ${paymentDiff.toFixed(4)})`,
    paymentDiff < 0.01
  );
}

async function uniquenessAndIntegrity() {
  console.log('\n--- Uniqueness & referential sanity ---');

  const dupEmails = await prisma.$queryRaw<{ tenant_id: string; email: string; c: bigint }[]>`
    SELECT tenant_id, email, count(*) c FROM users GROUP BY tenant_id, email HAVING count(*) > 1
  `;
  check(`No duplicate (tenantId, email) in users`, dupEmails.length === 0, `${dupEmails.length} dupes`);

  const dupReceipts = await prisma.$queryRaw<{ tenant_id: string; receipt_number: string; c: bigint }[]>`
    SELECT tenant_id, receipt_number, count(*) c FROM transactions WHERE receipt_number IS NOT NULL GROUP BY tenant_id, receipt_number HAVING count(*) > 1
  `;
  check(`No duplicate (tenantId, receiptNumber) in transactions`, dupReceipts.length === 0, `${dupReceipts.length} dupes`);

  // Auth smoke test: sample users, confirm password hash strings weren't mangled in transform (same length/prefix as bcrypt hashes).
  const sampleUsers = await prisma.user.findMany({ take: 5, select: { email: true, password: true } });
  const allBcrypt = sampleUsers.every((u) => /^\$2[aby]\$/.test(u.password));
  check(`Sampled user passwords look like intact bcrypt hashes`, allBcrypt, `${sampleUsers.length} sampled`);

  // Orphan FK scan: every non-null Transaction.customerId must resolve to a real Customer (Postgres FK already guarantees this at insert time, but re-check post-hoc in case of raw SQL tampering).
  const orphanTxnCustomers = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT count(*) c FROM transactions t
    LEFT JOIN customers c2 ON c2.id = t.customer_id
    WHERE t.customer_id IS NOT NULL AND c2.id IS NULL
  `;
  check(`No orphaned Transaction.customerId`, Number(orphanTxnCustomers[0].c) === 0);
}

async function main() {
  await rowCountParity();
  await financialTotals();
  await uniquenessAndIntegrity();

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Validation script crashed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
