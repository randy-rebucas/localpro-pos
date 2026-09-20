/**
 * Find and resolve duplicate products (same tenant + same name, case-insensitive)
 * that arose from re-scanning/re-importing an item that didn't match an existing
 * SKU/barcode and got created as a brand-new product instead of being reused.
 *
 * For each duplicate group:
 *   - Picks a survivor: prefers an active product, then the one with the most
 *     transaction/stock-movement history, then the most stock.
 *   - Folds every loser's stock into the survivor via updateStock() (so it's a
 *     logged 'adjustment', not a silent field edit).
 *   - If a loser has stock movements, transactions, or saved-cart references,
 *     it's deactivated (isActive: false) rather than deleted, so that history
 *     stays intact.
 *   - If a loser has zero history and zero stock, it's deleted outright.
 *
 * Usage:
 *   npx tsx scripts/fix-duplicate-products.ts --tenant <slug>              # dry run
 *   npx tsx scripts/fix-duplicate-products.ts --tenant <slug> --apply      # applies
 */

import '../lib/script-runtime';

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import prisma from '../lib/db';
import { updateStock } from '../lib/stock';

async function main() {
  const apply = process.argv.includes('--apply');
  const tenantFlagIndex = process.argv.indexOf('--tenant');
  const tenantSlug = tenantFlagIndex !== -1 ? process.argv[tenantFlagIndex + 1] : undefined;

  if (!tenantSlug) {
    console.error('Usage: npx tsx scripts/fix-duplicate-products.ts --tenant <slug> [--apply]');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug } });
  if (!tenant) {
    console.error(`Tenant not found: ${tenantSlug}`);
    process.exit(1);
  }
  const tenantId = tenant.id;

  const products = await prisma.product.findMany({
    where: { tenantId, hasVariations: { not: true } },
    select: { id: true, name: true, sku: true, stock: true, isActive: true },
  });

  const groups = new Map<string, typeof products>();
  for (const p of products) {
    const key = p.name.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const duplicateGroups = [...groups.entries()].filter(([, docs]) => {
    if (docs.length < 2) return false;
    // Skip groups already resolved by a previous run: exactly one doc still holds
    // stock/is active, and the rest are deactivated with zero stock (kept only for history).
    const unresolved = docs.filter((d) => d.isActive !== false || (d.stock || 0) > 0);
    return unresolved.length > 1;
  });

  if (duplicateGroups.length === 0) {
    console.log(`No duplicate-named products found for tenant "${tenantSlug}".`);
    return;
  }

  console.log(`Found ${duplicateGroups.length} duplicate-named product group(s) for "${tenantSlug}".\n`);

  for (const [name, docs] of duplicateGroups) {
    const withHistory = await Promise.all(
      docs.map(async (p) => {
        const [movements, txns, carts] = await Promise.all([
          prisma.stockMovement.count({ where: { productId: p.id } }),
          prisma.transactionItem.count({ where: { productId: p.id } }),
          prisma.savedCartItem.count({ where: { productId: p.id } }),
        ]);
        return { ...p, historyCount: movements + txns + carts };
      })
    );

    // Survivor: prefer active, then most history, then most stock.
    const survivor = [...withHistory].sort((a, b) => {
      if (a.isActive !== false && b.isActive === false) return -1;
      if (a.isActive === false && b.isActive !== false) return 1;
      if (b.historyCount !== a.historyCount) return b.historyCount - a.historyCount;
      return (b.stock || 0) - (a.stock || 0);
    })[0];

    const losers = withHistory.filter((p) => p.id !== survivor.id);

    console.log(`"${name}": keeping ${survivor.sku || survivor.id} (stock=${survivor.stock}, active=${survivor.isActive !== false}, history=${survivor.historyCount})`);

    for (const loser of losers) {
      const action = loser.historyCount > 0 ? 'deactivate' : 'delete';
      console.log(
        `  -> ${action} ${loser.sku || loser.id} (stock=${loser.stock}, active=${loser.isActive !== false}, history=${loser.historyCount})`
      );

      if (!apply) continue;

      if (loser.stock && loser.stock > 0) {
        await updateStock(
          survivor.id,
          tenantId,
          loser.stock,
          'adjustment',
          { reason: `Merged duplicate product ${loser.sku || loser.id}` }
        );
        await updateStock(
          loser.id,
          tenantId,
          -loser.stock,
          'adjustment',
          { reason: `Stock merged into ${survivor.sku || survivor.id}` }
        );
      }

      if (action === 'deactivate') {
        await prisma.product.update({ where: { id: loser.id }, data: { isActive: false } });
      } else {
        await prisma.product.delete({ where: { id: loser.id } });
      }
    }
    console.log('');
  }

  if (!apply) {
    console.log('Dry run only — re-run with --apply to merge and clean up these duplicates.');
  } else {
    console.log('Duplicate products merged.');
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
