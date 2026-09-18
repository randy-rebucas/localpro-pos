#!/usr/bin/env tsx
/**
 * 1POS — Fix Tenant Timezone
 *
 * Corrects a tenant's settings.timezone (used by lib/formatting.ts to render
 * transaction/report dates). See scripts/audit-midnight-transactions.ts —
 * a tenant with the wrong timezone will show sale times shifted by the UTC
 * offset (e.g. real 8am Manila sales rendering as "12am").
 *
 * Usage:
 *   npx tsx scripts/fix-tenant-timezone.ts --tenant=botika-ng-wise --timezone=Asia/Manila
 *   npx tsx scripts/fix-tenant-timezone.ts --tenant=botika-ng-wise --timezone=Asia/Manila --dry-run
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import Tenant from '../models/Tenant';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pos-system';

function arg(name: string, fallback?: string): string | undefined {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
}

async function main() {
  const slug = arg('tenant');
  const timezone = arg('timezone');
  const dryRun = process.argv.includes('--dry-run');

  if (!slug || !timezone) {
    console.error('Usage: npx tsx scripts/fix-tenant-timezone.ts --tenant=<slug> --timezone=<IANA tz> [--dry-run]');
    process.exit(1);
  }

  // Basic sanity check that it's a real IANA timezone name.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    console.error(`"${timezone}" is not a valid IANA timezone.`);
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);

  const tenant = await Tenant.findOne({ slug });
  if (!tenant) {
    console.error(`Tenant "${slug}" not found.`);
    process.exit(1);
  }

  const before = (tenant as any).settings?.timezone;
  console.log(`Tenant: ${(tenant as any).name} (${slug})`);
  console.log(`Current settings.timezone: ${before ?? '(unset)'}`);
  console.log(`New settings.timezone:     ${timezone}`);

  if (before === timezone) {
    console.log('\nNo change needed — already set to the target timezone.');
    await mongoose.disconnect();
    return;
  }

  if (dryRun) {
    console.log('\n--dry-run: no changes written.');
    await mongoose.disconnect();
    return;
  }

  (tenant as any).settings.timezone = timezone;
  await tenant.save();

  console.log('\nUpdated. Existing transaction createdAt values are untouched (they are correct UTC instants) — only the display timezone changed.');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
