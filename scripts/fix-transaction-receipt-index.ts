/**
 * One-time fix: reconcile transaction indexes (receiptNumber, channelSyncKey).
 *
 * Usage: npx tsx scripts/fix-transaction-receipt-index.ts
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.local file (Next.js convention)
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
// Also try .env as fallback
dotenv.config({ path: resolve(process.cwd(), '.env') });

import connectDB from '../lib/mongodb';
import { ensureTransactionIndexes } from '../lib/transaction-indexes';
import mongoose from 'mongoose';

async function main() {
  await connectDB();
  await ensureTransactionIndexes();
  const indexes = await mongoose.connection.collection('transactions').indexes();
  console.log('transactions indexes:', indexes.map((i) => i.name).join(', '));
  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
