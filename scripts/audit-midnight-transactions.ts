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

import mongoose from 'mongoose';
import Tenant from '../models/Tenant';
import Transaction from '../models/Transaction';
import OfflineTransaction from '../models/OfflineTransaction';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pos-system';

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

  await mongoose.connect(MONGODB_URI);
  console.log(`Connected. Auditing tenant "${slug}" over the last ${days} days.\n`);

  const tenant = await Tenant.findOne({ slug }).lean();
  if (!tenant) {
    console.error(`Tenant "${slug}" not found.`);
    process.exit(1);
  }

  const tz = (tenant as any).settings?.timezone || '(not set — falls back to Asia/Manila in formatDate)';
  console.log(`Tenant: ${(tenant as any).name || slug}`);
  console.log(`Configured timezone: ${tz}`);
  console.log('');

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const txns = await Transaction.find({
    tenantId: (tenant as any)._id,
    createdAt: { $gte: since },
  })
    .select('_id createdAt total status receiptNumber userId')
    .sort({ createdAt: 1 })
    .lean();

  console.log(`Total transactions in window: ${txns.length}`);

  // Bucket by UTC hour to see if there's a suspicious spike at any hour
  const hourCounts: Record<number, number> = {};
  for (const t of txns) {
    const h = new Date((t as any).createdAt).getUTCHours();
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
  const nearMidnightUTC = txns.filter(t => {
    const d = new Date((t as any).createdAt);
    return d.getUTCHours() === 0 || d.getUTCHours() === 23;
  });

  console.log(`\nTransactions with createdAt between 23:00-01:00 UTC: ${nearMidnightUTC.length}`);
  for (const t of nearMidnightUTC.slice(0, 20)) {
    const d = new Date((t as any).createdAt);
    const localStr = tenant && (tenant as any).settings?.timezone
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: (tenant as any).settings.timezone,
          dateStyle: 'medium',
          timeStyle: 'medium',
        }).format(d)
      : '(no tenant timezone configured)';
    console.log(`  ${(t as any).receiptNumber || (t as any)._id}  UTC=${d.toISOString()}  tenant-local=${localStr}  total=${(t as any).total}  status=${(t as any).status}`);
  }

  // Cross-check against OfflineTransaction: any synced transaction whose
  // createdAt (sync time) diverges significantly from offlineCreatedAt
  // (actual sale time on the device)?
  const offlineSynced = await OfflineTransaction.find({
    tenantId: (tenant as any)._id,
    syncStatus: 'synced',
    syncedTransactionId: { $exists: true },
    createdAt: { $gte: since },
  })
    .select('_id offlineCreatedAt syncedTransactionId')
    .lean();

  if (offlineSynced.length) {
    console.log(`\nOffline-synced transactions in window: ${offlineSynced.length}`);
    const txnIds = offlineSynced.map((o: any) => o.syncedTransactionId);
    const relatedTxns = await Transaction.find({ _id: { $in: txnIds } }).select('_id createdAt').lean();
    const txnById = new Map(relatedTxns.map((t: any) => [t._id.toString(), t.createdAt]));

    let mismatches = 0;
    for (const o of offlineSynced as any[]) {
      const realCreatedAt = txnById.get(o.syncedTransactionId.toString());
      if (!realCreatedAt) continue;
      const diffMs = Math.abs(new Date(realCreatedAt).getTime() - new Date(o.offlineCreatedAt).getTime());
      if (diffMs > 5 * 60 * 1000) {
        mismatches++;
        console.log(`  MISMATCH: offline sale at ${new Date(o.offlineCreatedAt).toISOString()}, but Transaction.createdAt (sync time) = ${new Date(realCreatedAt).toISOString()} (diff ${(diffMs / 60000).toFixed(1)} min)`);
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
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
