import mongoose from 'mongoose';
import Transaction from '@/models/Transaction';
import { logger } from '@/lib/logger';

let indexesEnsured = false;

const LEGACY_RECEIPT_INDEX = 'receiptNumber_1';
const CHANNEL_SYNC_INDEX = 'tenantId_1_channelSyncKey_1';
const IDEMPOTENCY_INDEX = 'tenantId_1_idempotencyKey_1';

const MIGRATION_ID = 'transaction-indexes-v2';

/**
 * Reconcile transaction indexes:
 * - Drop legacy global unique receiptNumber_1
 * - Replace sparse channelSyncKey index (null dupes) with partial-filter unique
 * - syncIndexes() for current schema definitions
 *
 * Not run at connect time (the cleanup scans the whole collection) — called from
 * scripts/sync-indexes.ts and scripts/fix-transaction-receipt-index.ts.
 */
export async function ensureTransactionIndexes(): Promise<void> {
  if (indexesEnsured || mongoose.connection.readyState !== 1) {
    return;
  }

  await reconcileLegacyTransactionIndexes();
  await Transaction.syncIndexes();
  indexesEnsured = true;
}

/**
 * One-time cleanup of legacy transaction data/indexes. Recorded in the
 * `app_migrations` collection so the full-collection updateMany scans run once.
 * Pass `force` to run it again regardless of the marker.
 */
export async function reconcileLegacyTransactionIndexes(force = false): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const migrations = db.collection<{ _id: string; appliedAt: Date }>('app_migrations');
  if (!force && await migrations.findOne({ _id: MIGRATION_ID })) {
    return;
  }

  const collection = mongoose.connection.collection('transactions');

  // Sparse unique indexes still index explicit nulls — POS rows must omit the field.
  const cleanup = await collection.updateMany(
    { $or: [{ channelSyncKey: null }, { channelSyncKey: '' }] },
    { $unset: { channelSyncKey: '' } }
  );
  if (cleanup.modifiedCount > 0) {
    logger.info('Unset empty channelSyncKey on transactions', { count: cleanup.modifiedCount });
  }

  const idempotencyCleanup = await collection.updateMany(
    { $or: [{ idempotencyKey: null }, { idempotencyKey: '' }] },
    { $unset: { idempotencyKey: '' } }
  );
  if (idempotencyCleanup.modifiedCount > 0) {
    logger.info('Unset empty idempotencyKey on transactions', { count: idempotencyCleanup.modifiedCount });
  }

  const indexes = await collection.indexes();

  const legacyReceipt = indexes.find((idx) => idx.name === LEGACY_RECEIPT_INDEX);
  if (legacyReceipt) {
    await collection.dropIndex(LEGACY_RECEIPT_INDEX);
    logger.info(
      'Dropped legacy transactions.receiptNumber_1 index (use tenantId + receiptNumber compound unique)'
    );
  }

  const channelSyncIdx = indexes.find((idx) => idx.name === CHANNEL_SYNC_INDEX);
  const pfe = channelSyncIdx?.partialFilterExpression as Record<string, unknown> | undefined;
  const channelSyncKeyFilter = pfe?.channelSyncKey as Record<string, unknown> | undefined;
  const needsRebuild =
    channelSyncIdx &&
    (!pfe || '$ne' in (channelSyncKeyFilter ?? {}));
  if (needsRebuild) {
    await collection.dropIndex(CHANNEL_SYNC_INDEX);
    logger.info(
      'Dropped legacy transactions channelSyncKey index (recreating with partial filter)'
    );
  }

  const idempotencyIdx = indexes.find((idx) => idx.name === IDEMPOTENCY_INDEX);
  if (idempotencyIdx?.sparse && !idempotencyIdx.partialFilterExpression) {
    await collection.dropIndex(IDEMPOTENCY_INDEX);
    logger.info(
      'Dropped legacy transactions idempotencyKey sparse index (recreating with partial filter)'
    );
  }

  await migrations.updateOne(
    { _id: MIGRATION_ID },
    { $set: { appliedAt: new Date() } },
    { upsert: true }
  );
}

/** @deprecated Use ensureTransactionIndexes */
export const ensureTransactionReceiptIndexes = ensureTransactionIndexes;
