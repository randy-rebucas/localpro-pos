#!/usr/bin/env tsx
/**
 * 1POS — Midnight Transaction Audit (read-only)
 *
 * Investigates transactions whose stored `createdAt` (UTC) falls near local
 * midnight for a tenant, to distinguish:
 *   (a) a display/timezone bug (raw UTC shown instead of tenant-local time)
 *   (b) a real anomaly (e.g. offline-sync writing sync-time instead of sale-time)
 *   (c) a genuine late-night/early-morning sale
 *
 * Usage:
 *   npx tsx scripts/audit-midnight-transactions.ts --tenant=botika-ng-wise
 *   npx tsx scripts/audit-midnight-transactions.ts --tenant=botika-ng-wise --days=30
 *
 * This script performs NO writes.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import prisma from '../lib/db';

function arg(name: string, fallback?: string): string | undefined {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
}

async function main() {
  const slug = arg('tenant');
  const days = Number(arg('days', '30'));

  if (!slug) {
    console.error('Usage: npx tsx scripts/audit-midnight-transactions.ts --tenant=<slug> [--days=30]');
    process.exit(1);
  }

  console.log(`Auditing tenant "${slug}" over the last ${days} days.\n`);

  const tenant = await prisma.tenant.findFirst({ where: { slug }, include: { settings: true } });
  if (!tenant) {
    console.error(`Tenant "${slug}" not found.`);
    process.exit(1);
  }

  const tz = tenant.settings?.timezone || '(not set — falls back to Asia/Manila in formatDate)';
  console.log(`Tenant: ${tenant.name || slug}`);
  console.log(`Configured timezone: ${tz}`);
  console.log('');

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const txns = await prisma.transaction.findMany({
    where: { tenantId: tenant.id, createdAt: { gte: since } },
    select: { id: true, createdAt: true, total: true, status: true, receiptNumber: true, userId: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Total transactions in window: ${txns.length}`);

  // Bucket by UTC hour to see if there's a suspicious spike at any hour
  const hourCounts: Record<number, number> = {};
  for (const t of txns) {
    const h = t.createdAt.getUTCHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  }
  console.log('\nUTC-hour distribution (createdAt.getUTCHours()):');
  for (let h = 0; h < 24; h++) {
    if (hourCounts[h]) {
      console.log(`  ${String(h).padStart(2, '0')}:00 UTC  ->  ${hourCounts[h]}`);
    }
  }

  // Flag transactions whose UTC time is within :00-:30 of the hour — i.e.
  // near-midnight-looking in *some* timezone, then show what local time
  // that actually is under the tenant's configured tz.
  const nearMidnightUTC = txns.filter(t => t.createdAt.getUTCHours() === 0 || t.createdAt.getUTCHours() === 23);

  console.log(`\nTransactions with createdAt between 23:00-01:00 UTC: ${nearMidnightUTC.length}`);
  for (const t of nearMidnightUTC.slice(0, 20)) {
    const d = t.createdAt;
    const localStr = tenant.settings?.timezone
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: tenant.settings.timezone,
          dateStyle: 'medium',
          timeStyle: 'medium',
        }).format(d)
      : '(no tenant timezone configured)';
    console.log(`  ${t.receiptNumber || t.id}  UTC=${d.toISOString()}  tenant-local=${localStr}  total=${t.total}  status=${t.status}`);
  }

  // Cross-check against OfflineTransaction: any synced transaction whose
  // createdAt (sync time) diverges significantly from offlineCreatedAt
  // (actual sale time on the device)?
  const offlineSynced = await prisma.offlineTransaction.findMany({
    where: {
      tenantId: tenant.id,
      syncStatus: 'synced',
      syncedTransactionId: { not: null },
      createdAt: { gte: since },
    },
    select: { id: true, offlineCreatedAt: true, syncedTransactionId: true },
  });

  if (offlineSynced.length) {
    console.log(`\nOffline-synced transactions in window: ${offlineSynced.length}`);
    const txnIds = offlineSynced.map((o) => o.syncedTransactionId as string);
    const relatedTxns = await prisma.transaction.findMany({
      where: { id: { in: txnIds } },
      select: { id: true, createdAt: true },
    });
    const txnById = new Map(relatedTxns.map((t) => [t.id, t.createdAt]));

    let mismatches = 0;
    for (const o of offlineSynced) {
      const realCreatedAt = txnById.get(o.syncedTransactionId as string);
      if (!realCreatedAt) continue;
      const diffMs = Math.abs(realCreatedAt.getTime() - o.offlineCreatedAt.getTime());
      if (diffMs > 5 * 60 * 1000) {
        mismatches++;
        console.log(`  MISMATCH: offline sale at ${o.offlineCreatedAt.toISOString()}, but Transaction.createdAt (sync time) = ${realCreatedAt.toISOString()} (diff ${(diffMs / 60000).toFixed(1)} min)`);
      }
    }
    if (!mismatches) {
      console.log('  No significant offline-sync timestamp mismatches found.');
    } else {
      console.log(`\n  ⚠ ${mismatches} offline-synced transaction(s) have createdAt set to SYNC time, not SALE time.`);
      console.log('    This is a real bug: lib/automations/offline-sync.ts creates the Transaction');
      console.log('    without passing offlineCreatedAt through, so createdAt defaults to "now" at sync time.');
    }
  } else {
    console.log('\nNo offline-synced transactions found in window (rules out the offline-sync timestamp bug).');
  }

  console.log('\nDone.');
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
