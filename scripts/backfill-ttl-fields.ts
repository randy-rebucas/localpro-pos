#!/usr/bin/env tsx
/**
 * 1POS — Backfill TTL fields on rows created before the TTL indexes existed.
 *
 * TTL indexes only expire documents that have the indexed Date field, so rows
 * written before these fields were introduced would otherwise live forever:
 *
 *   - Counter (lib/receipt.ts): daily keys "REC-YYYYMMDD-<tenantId>" /
 *     "INV-YYYYMMDD-<tenantId>" get expiresAt = key day (UTC) + 8 days.
 *     Counters for days more than 8 days ago are then removed by the TTL monitor;
 *     today's counter always gets an expiresAt in the future.
 *   - OfflineTransaction: syncStatus 'synced' rows get syncedAt = updatedAt.
 *   - UserRevocation: expiresAt = revokedBefore + max JWT lifetime.
 *
 * PosSession (TTL on updatedAt) and SavedCart (TTL on updatedAt, isActive:false)
 * already have updatedAt via timestamps and need no backfill.
 *
 * Idempotent: only touches rows where the field is missing. Scoped per tenant.
 * Requires MongoDB 5.0+ ($dateAdd). Run `pnpm db:sync-indexes --apply` too.
 *
 * Usage:
 *   npx tsx scripts/backfill-ttl-fields.ts --dry-run
 *   npx tsx scripts/backfill-ttl-fields.ts
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import connectDB from '../lib/mongodb';
import Tenant from '../models/Tenant';
import Counter, { DAILY_COUNTER_RETENTION_DAYS } from '../models/Counter';
import OfflineTransaction from '../models/OfflineTransaction';
import { maxUserJwtLifetimeSeconds } from '../lib/token-blacklist';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDB();

  const tenants = await Tenant.find({}).select('_id slug').lean();
  let counterTotal = 0;
  let offlineTotal = 0;

  for (const tenant of tenants) {
    const tenantId = tenant._id.toString();

    // Daily counters for this tenant without expiresAt.
    const counterFilter = {
      _id: { $regex: `^(REC|INV)-\\d{8}-${escapeRegex(tenantId)}$` },
      expiresAt: { $exists: false },
    };
    // Offline rows for this tenant that were synced before syncedAt existed.
    const offlineFilter = {
      tenantId: tenant._id,
      syncStatus: 'synced',
      syncedAt: { $exists: false },
    };

    const [counterCount, offlineCount] = await Promise.all([
      Counter.collection.countDocuments(counterFilter as Record<string, unknown>),
      OfflineTransaction.collection.countDocuments(offlineFilter),
    ]);
    if (!counterCount && !offlineCount) continue;

    console.log(`${tenant.slug ?? tenantId}: counters=${counterCount} offlineSynced=${offlineCount}`);
    counterTotal += counterCount;
    offlineTotal += offlineCount;
    if (dryRun) continue;

    if (counterCount) {
      // Key layout: PREFIX(3) '-' YYYYMMDD(8) '-' tenantId  -> date at byte offset 4.
      await Counter.collection.updateMany(counterFilter as Record<string, unknown>, [
        {
          $set: {
            expiresAt: {
              $dateAdd: {
                startDate: {
                  $dateFromString: {
                    dateString: { $substrBytes: ['$_id', 4, 8] },
                    format: '%Y%m%d',
                    timezone: 'UTC',
                  },
                },
                unit: 'day',
                amount: DAILY_COUNTER_RETENTION_DAYS,
              },
            },
          },
        },
      ]);
    }

    if (offlineCount) {
      await OfflineTransaction.collection.updateMany(offlineFilter, [
        { $set: { syncedAt: { $ifNull: ['$updatedAt', '$$NOW'] } } },
      ]);
    }
  }

  // UserRevocation (lib/token-blacklist.ts) is keyed by userId, not tenant:
  // rows written before expiresAt existed get revokedBefore + max JWT lifetime.
  const revocations = mongoose.connection.collection('userrevocations');
  const revocationFilter = { expiresAt: { $exists: false } };
  const revocationCount = await revocations.countDocuments(revocationFilter);
  console.log(`userRevocations without expiresAt: ${revocationCount}`);
  if (revocationCount && !dryRun) {
    await revocations.updateMany(revocationFilter, [
      {
        $set: {
          expiresAt: {
            $dateAdd: { startDate: '$revokedBefore', unit: 'second', amount: maxUserJwtLifetimeSeconds() },
          },
        },
      },
    ]);
  }

  console.log(`\nTotal: counters=${counterTotal} offlineSynced=${offlineTotal} userRevocations=${revocationCount}`);
  if (dryRun) console.log('--dry-run: no changes written.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
