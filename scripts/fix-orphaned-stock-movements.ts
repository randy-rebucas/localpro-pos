/**
 * One-time fix: find and remove StockMovement records that reference a
 * productId which no longer exists (e.g. the product/SKU was deleted but
 * its stock movement history was left behind), causing inventory reports
 * to show entries for products that don't exist anymore.
 *
 * Usage:
 *   npx tsx scripts/fix-orphaned-stock-movements.ts           # dry run, reports only
 *   npx tsx scripts/fix-orphaned-stock-movements.ts --apply   # actually deletes
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

async function main() {
  // Loaded dynamically after dotenv.config() above: tsx runs .ts files as ESM,
  // which hoists static imports above this file's top-level statements — a static
  // import of lib/mongodb here would read process.env.MONGODB_URI before dotenv
  // populates it and silently fall back to localhost.
  const { default: connectDB } = await import('../lib/mongodb');
  const { default: StockMovement } = await import('../models/StockMovement');
  const { default: Product } = await import('../models/Product');
  const mongoose = (await import('mongoose')).default;

  const apply = process.argv.includes('--apply');
  await connectDB();

  const orphans = await StockMovement.aggregate([
    {
      $lookup: {
        from: Product.collection.name,
        localField: 'productId',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $match: { product: { $size: 0 } } },
    {
      $group: {
        _id: '$productId',
        count: { $sum: 1 },
        tenantIds: { $addToSet: '$tenantId' },
      },
    },
  ]);

  if (orphans.length === 0) {
    console.log('No orphaned stock movements found. Inventory is consistent with existing products.');
    await mongoose.disconnect();
    return;
  }

  const totalMovements = orphans.reduce((sum, o) => sum + o.count, 0);
  console.log(`Found ${orphans.length} deleted product(s) with ${totalMovements} orphaned stock movement record(s):`);
  for (const o of orphans) {
    console.log(`  productId=${o._id} tenantIds=${o.tenantIds.join(', ')} movements=${o.count}`);
  }

  if (apply) {
    const orphanProductIds = orphans.map((o) => o._id);
    const result = await StockMovement.deleteMany({ productId: { $in: orphanProductIds } });
    console.log(`\nDeleted ${result.deletedCount} orphaned stock movement record(s).`);
  } else {
    console.log('\nDry run only — re-run with --apply to delete these orphaned records.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
