/**
 * One-time fix: find and remove StockMovement records that reference a
 * productId which no longer exists (e.g. the product/SKU was deleted but
 * its stock movement history was left behind), causing inventory reports
 * to show entries for products that don't exist anymore.
 *
 * Note: under Postgres/Prisma, StockMovement.productId is a required
 * foreign key to Product (see prisma/schema.prisma), so this situation
 * should no longer be reachable through normal application code — Postgres
 * enforces referential integrity, unlike Mongo's Mongoose refs. This script
 * is kept as a defensive check in case rows were ever written around the
 * FK (e.g. a raw SQL import, or a pre-migration Mongo carryover), using a
 * LEFT JOIN rather than assuming orphans are even possible.
 *
 * Usage:
 *   npx tsx scripts/fix-orphaned-stock-movements.ts           # dry run, reports only
 *   npx tsx scripts/fix-orphaned-stock-movements.ts --apply   # actually deletes
 */

import '../lib/script-runtime';

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import prisma from '../lib/db';

interface OrphanRow {
  productId: string;
  count: bigint;
  tenant_ids: string[];
}

async function main() {
  const apply = process.argv.includes('--apply');

  const orphans = await prisma.$queryRaw<OrphanRow[]>`
    SELECT sm."productId" AS "productId",
           COUNT(*) AS count,
           ARRAY_AGG(DISTINCT sm."tenantId") AS tenant_ids
    FROM stock_movements sm
    LEFT JOIN products p ON p.id = sm."productId"
    WHERE p.id IS NULL
    GROUP BY sm."productId"
  `;

  if (orphans.length === 0) {
    console.log('No orphaned stock movements found. Inventory is consistent with existing products.');
    return;
  }

  const totalMovements = orphans.reduce((sum, o) => sum + Number(o.count), 0);
  console.log(`Found ${orphans.length} deleted product(s) with ${totalMovements} orphaned stock movement record(s):`);
  for (const o of orphans) {
    console.log(`  productId=${o.productId} tenantIds=${o.tenant_ids.join(', ')} movements=${o.count}`);
  }

  if (apply) {
    const orphanProductIds = orphans.map((o) => o.productId);
    const result = await prisma.stockMovement.deleteMany({ where: { productId: { in: orphanProductIds } } });
    console.log(`\nDeleted ${result.count} orphaned stock movement record(s).`);
  } else {
    console.log('\nDry run only — re-run with --apply to delete these orphaned records.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
