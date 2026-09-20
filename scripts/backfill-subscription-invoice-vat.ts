#!/usr/bin/env tsx
/**
 * 1POS — Backfill VAT on auto-generated subscription invoices
 *
 * lib/automations/subscription-billing.ts used to hardcode taxAmount: 0 on
 * subscription invoices it generates. That's fixed now (12% VAT on
 * subtotal), but invoices created before the fix still have taxAmount: 0.
 * This recomputes those, and the matching billingEvent's `amount`, to match.
 *
 * Skips invoices with status 'paid' — those are already reconciled against
 * an actual amount paid; changing the invoice total after the fact would
 * misrepresent what was collected. Flagged in the output instead.
 *
 * Usage:
 *   npx tsx scripts/backfill-subscription-invoice-vat.ts --dry-run
 *   npx tsx scripts/backfill-subscription-invoice-vat.ts
 */

import '../lib/script-runtime';

import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import prisma from '../lib/db';

const VAT_RATE = 0.12;

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const invoices = await prisma.invoice.findMany({
    where: {
      notes: 'Auto-generated subscription billing invoice',
      taxAmount: 0,
    },
  });

  console.log(`Found ${invoices.length} subscription invoice(s) with taxAmount: 0.\n`);

  let updated = 0;
  let skippedPaid = 0;

  for (const inv of invoices) {
    if (inv.status === 'paid') {
      skippedPaid++;
      console.log(`SKIP (already paid): ${inv.invoiceNumber} — subtotal ${inv.subtotal}, paidAmount ${inv.paidAmount}`);
      continue;
    }

    const subtotal = Number(inv.subtotal);
    const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
    const newTotal = subtotal + vatAmount;

    console.log(`${dryRun ? '[dry-run] ' : ''}${inv.invoiceNumber}: subtotal ${subtotal} -> taxAmount ${vatAmount}, total ${inv.total} -> ${newTotal}`);

    if (!dryRun) {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { taxAmount: vatAmount, total: newTotal },
      });

      // Keep the linked billing event's amount consistent with the new total.
      const event = await prisma.billingEvent.findFirst({
        where: { tenantId: inv.tenantId, invoiceUrl: `/invoices/${inv.id}` },
      });
      if (event) {
        await prisma.billingEvent.update({
          where: { id: event.id },
          data: { amount: newTotal },
        });
      }
    }

    updated++;
  }

  console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${updated} invoice(s). Skipped ${skippedPaid} already-paid invoice(s).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
