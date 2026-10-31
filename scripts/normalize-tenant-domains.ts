/**
 * One-off: normalize existing Tenant.domain / Tenant.subdomain values to the
 * form the schema now enforces (trim + lowercase; domain also drops any port
 * and trailing dot) so host lookups in lib/tenant.ts getTenantFromHost match.
 *
 * Dry run by default — prints planned changes and collisions only.
 *   pnpm db:normalize-tenant-domains            # dry run
 *   pnpm db:normalize-tenant-domains --apply    # write changes
 *
 * Tenants whose normalized value would collide with another tenant's (the
 * partial unique indexes on domain/subdomain would reject the write) are
 * reported and left untouched — resolve those manually.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { normalizeHost } from '../lib/host';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

type Field = 'domain' | 'subdomain';

interface RawTenant {
  _id: mongoose.Types.ObjectId;
  slug?: string;
  domain?: unknown;
  subdomain?: unknown;
}

function normalizeValue(field: Field, value: string): string {
  return field === 'domain' ? normalizeHost(value) : value.trim().toLowerCase();
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set (.env.local)');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB — ${APPLY ? 'APPLY mode' : 'dry run (pass --apply to write)'}`);

  // Raw collection access: read stored values as-is, bypassing schema setters.
  const coll = mongoose.connection.collection('tenants');
  const tenants = (await coll
    .find(
      { $or: [{ domain: { $type: 'string' } }, { subdomain: { $type: 'string' } }] },
      { projection: { _id: 1, slug: 1, domain: 1, subdomain: 1 } }
    )
    .toArray()) as unknown as RawTenant[];

  let changed = 0;
  let skipped = 0;

  for (const field of ['domain', 'subdomain'] as Field[]) {
    // normalized value → tenants holding it (after normalization)
    const owners = new Map<string, RawTenant[]>();
    for (const t of tenants) {
      const raw = t[field];
      if (typeof raw !== 'string') continue;
      const norm = normalizeValue(field, raw);
      if (!norm) continue;
      const list = owners.get(norm) ?? [];
      list.push(t);
      owners.set(norm, list);
    }

    for (const t of tenants) {
      const raw = t[field];
      if (typeof raw !== 'string') continue;
      const norm = normalizeValue(field, raw);
      if (norm === raw) continue;

      const holders = owners.get(norm) ?? [];
      if (norm && holders.length > 1) {
        skipped++;
        console.warn(
          `COLLISION ${field}: "${raw}" (tenant ${t.slug ?? t._id}) normalizes to "${norm}", ` +
            `also held by: ${holders.filter((h) => !h._id.equals(t._id)).map((h) => `${h.slug ?? h._id} ("${h[field]}")`).join(', ')} — skipped`
        );
        continue;
      }

      changed++;
      // An all-whitespace value normalizes to '' — store null, matching how
      // the API clears domain/subdomain (partial unique index ignores it).
      const next = norm || null;
      console.log(`${APPLY ? 'UPDATE' : 'WOULD UPDATE'} ${field}: tenant ${t.slug ?? t._id}: "${raw}" → ${next === null ? 'null' : `"${next}"`}`);
      if (APPLY) {
        await coll.updateOne({ _id: t._id }, { $set: { [field]: next } });
      }
    }
  }

  console.log(`\nDone. ${APPLY ? 'Updated' : 'Would update'}: ${changed}; collisions skipped: ${skipped}.`);
  await mongoose.disconnect();
  if (skipped > 0) process.exitCode = 2;
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
