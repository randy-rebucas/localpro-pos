/**
 * One-time cleanup for a retired business type. The code for the type
 * (models, routes, pages, plan features, permission keys) was removed; this
 * strips the now-orphaned data it left behind:
 *
 *   1. Tenants on the retired type are moved to its replacement type
 *      (pharmacy -> retail; laundry, service, restaurant -> general, since
 *      their catalogs hold 'service' products and SKU-less items that
 *      retail's product validation rejects)
 *   2. The type's tenant settings keys are unset
 *   3. The type's permission keys are dropped from settings.rolePermissionOverrides
 *   4. The type's product fields are unset
 *   5. The type's transaction item fields are unset
 *   6. The type's subscription plan feature group is unset
 *   7. The type's feature-flag overrides are deleted
 *   8. The type's product indexes and collections are dropped
 *
 * Audit logs and stock movements written by the old routes are kept — they are
 * historical records.
 *
 * Run `pnpm db:backup` first.
 *
 * Usage:
 *   npx tsx scripts/remove-business-type.ts --type=laundry           # dry run, reports only
 *   npx tsx scripts/remove-business-type.ts --type=laundry --apply   # actually writes
 *
 * Earlier versions of this script moved every retired tenant to 'retail'.
 * To repair tenants moved that way:
 *   npx tsx scripts/remove-business-type.ts --repair-retail           # dry run
 *   npx tsx scripts/remove-business-type.ts --repair-retail --apply
 * Retail tenants holding 'service' products are moved to 'general'; retail
 * tenants with SKU-less products are only listed, for manual review.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

interface RetiredType {
  targetType: 'retail' | 'general';
  settingsKeys: string[];
  permissionKeys: string[];
  productFields: string[];
  transactionItemFields: string[];
  planFeatureGroups: string[];
  featureFlags: string[];
  productIndexes: string[][]; // index key field lists, e.g. ['tenantId', 'expiryDate']
  collections: string[];
}

const RETIRED_TYPES: Record<string, RetiredType> = {
  pharmacy: {
    targetType: 'retail',
    settingsKeys: ['pharmacyCompliance', 'trackExpiry', 'requirePrescriptionForRx', 'expiryAlertDays'],
    permissionKeys: [
      'pharmacy_compliance.manage', 'prescriptions.manage', 'prescriptions.create',
      'prescriptions.dispense', 'prescriptions.delete', 'expiry_tracking.manage',
    ],
    productFields: [
      'genericName', 'manufacturer', 'prn', 'batchNumber', 'expiryDate', 'drugSchedule',
      'requiresPrescription', 'storageConditions', 'activeIngredient', 'dosageStrength', 'dosageForm',
    ],
    transactionItemFields: ['prescriptionId'],
    planFeatureGroups: ['pharmacyCompliance'],
    featureFlags: ['enablePharmacyCompliance', 'prescriptionManagement', 'expiryTracking', 'pdeaReporting'],
    productIndexes: [['tenantId', 'expiryDate']],
    collections: ['prescriptions'],
  },
  laundry: {
    targetType: 'general',
    settingsKeys: ['laundryCompliance'],
    permissionKeys: ['laundry_compliance.manage'],
    productFields: ['serviceType', 'weightBased', 'pickupDelivery', 'estimatedDuration'],
    transactionItemFields: [],
    planFeatureGroups: [],
    featureFlags: [],
    productIndexes: [],
    collections: [],
  },
  service: {
    targetType: 'general',
    settingsKeys: ['serviceCompliance'],
    permissionKeys: ['service_compliance.manage'],
    productFields: ['serviceDuration', 'staffRequired', 'equipmentRequired'],
    transactionItemFields: [],
    planFeatureGroups: [],
    featureFlags: [],
    productIndexes: [],
    collections: [],
  },
  restaurant: {
    // enableTableManagement was both a tenant toggle and a plan feature.
    // Restaurant transaction fields (orderType, tableNumber, tableId, items.modifiers)
    // are deliberately kept: they are historical financial records.
    targetType: 'general',
    settingsKeys: ['restaurantCompliance', 'enableTableManagement'],
    permissionKeys: ['tables.manage', 'tables.configure', 'restaurant_compliance.manage'],
    productFields: ['modifiers', 'allergens', 'nutritionInfo'],
    transactionItemFields: [],
    planFeatureGroups: ['features.enableTableManagement'],
    featureFlags: ['enableTableManagement'],
    productIndexes: [],
    collections: ['tables'],
  },
};

const anyFieldExists = (fields: string[]) => ({ $or: fields.map((f) => ({ [f]: { $exists: true } })) });
const unsetAll = (fields: string[]) => ({ $unset: Object.fromEntries(fields.map((f) => [f, ''])) });

async function main() {
  const typeArg = process.argv.find((a) => a.startsWith('--type='))?.split('=')[1];
  const retired = typeArg ? RETIRED_TYPES[typeArg] : undefined;
  const repairRetail = process.argv.includes('--repair-retail');
  if (!repairRetail && (!typeArg || !retired)) {
    console.error(`Usage: --type=<${Object.keys(RETIRED_TYPES).join('|')}> [--apply]  |  --repair-retail [--apply]`);
    process.exit(1);
  }

  // Loaded dynamically after dotenv.config() above: tsx runs .ts files as ESM,
  // which hoists static imports above this file's top-level statements — a static
  // import of lib/mongodb here would read process.env.MONGODB_URI before dotenv
  // populates it and silently fall back to localhost.
  const { default: connectDB } = await import('../lib/mongodb');
  const { default: Tenant } = await import('../models/Tenant');
  const { default: Product } = await import('../models/Product');
  const { default: Transaction } = await import('../models/Transaction');
  const { default: SubscriptionPlan } = await import('../models/SubscriptionPlan');
  const { default: FeatureFlagOverride } = await import('../models/FeatureFlagOverride');
  const mongoose = (await import('mongoose')).default;

  const apply = process.argv.includes('--apply');
  await connectDB();
  const db = mongoose.connection.db!;

  // Raw collections: the retired fields are no longer in the schemas, so
  // Mongoose strict mode would strip them from filters and updates.
  const tenants = Tenant.collection;
  const products = Product.collection;
  const transactions = Transaction.collection;
  const plans = SubscriptionPlan.collection;
  const overrides = FeatureFlagOverride.collection;

  if (repairRetail) {
    console.log(`Repairing tenants moved to 'retail'${apply ? '' : ' (dry run)'}\n`);
    const retailTenants = await tenants
      .find({ 'settings.businessType': 'retail' }, { projection: { slug: 1 } })
      .toArray();
    const retailIds = retailTenants.map((t) => t._id);
    const slugOf = new Map(retailTenants.map((t) => [String(t._id), t.slug as string]));

    // Retail never allowed 'service' products, so a retail tenant holding them
    // was moved here from laundry/service/restaurant — and can't edit them.
    const serviceTenantIds: unknown[] = await products.distinct('tenantId', {
      tenantId: { $in: retailIds },
      productType: 'service',
    });
    console.log(`Retail tenants with 'service' products: ${serviceTenantIds.length} (-> 'general')`);
    for (const id of serviceTenantIds) console.log(`  ${slugOf.get(String(id))}`);
    if (apply && serviceTenantIds.length) {
      const r = await tenants.updateMany(
        { _id: { $in: serviceTenantIds as typeof retailIds }, 'settings.businessType': 'retail' },
        { $set: { 'settings.businessType': 'general' } }
      );
      console.log(`  -> moved ${r.modifiedCount} tenant(s) to 'general'`);
    }

    // SKU-less products also fail retail validation on edit, but genuine
    // retail tenants can have them too — list for review, don't move.
    const skuless = await products
      .aggregate<{ _id: unknown; count: number }>([
        {
          $match: {
            tenantId: { $in: retailIds },
            productType: { $ne: 'service' },
            $or: [{ sku: { $exists: false } }, { sku: null }, { sku: '' }],
          },
        },
        { $group: { _id: '$tenantId', count: { $sum: 1 } } },
      ])
      .toArray();
    const skulessToReview = skuless.filter((s) => !serviceTenantIds.some((id) => String(id) === String(s._id)));
    console.log(`Retail tenants with SKU-less products (review manually): ${skulessToReview.length}`);
    for (const s of skulessToReview) console.log(`  ${slugOf.get(String(s._id))}: ${s.count} product(s)`);

    if (!apply) console.log('\nDry run only — re-run with --apply to write these changes.');
    await mongoose.disconnect();
    return;
  }

  if (!retired) throw new Error('unreachable: --type was validated above');

  console.log(`Removing business type '${typeArg}'${apply ? '' : ' (dry run)'}\n`);

  // 1. Tenants -> replacement type
  const typeFilter = { 'settings.businessType': typeArg };
  const typeTenants = await tenants.find(typeFilter, { projection: { slug: 1 } }).toArray();
  console.log(`Tenants with businessType '${typeArg}': ${typeTenants.length} (-> '${retired.targetType}')`);
  for (const t of typeTenants) console.log(`  ${t.slug}`);
  if (apply && typeTenants.length) {
    const r = await tenants.updateMany(typeFilter, { $set: { 'settings.businessType': retired.targetType } });
    console.log(`  -> moved ${r.modifiedCount} tenant(s) to '${retired.targetType}'`);
  }

  // 2. Settings keys
  if (retired.settingsKeys.length) {
    const paths = retired.settingsKeys.map((k) => `settings.${k}`);
    const filter = anyFieldExists(paths);
    console.log(`Tenants with ${typeArg} settings: ${await tenants.countDocuments(filter)}`);
    if (apply) {
      const r = await tenants.updateMany(filter, unsetAll(paths));
      console.log(`  -> cleaned ${r.modifiedCount} tenant(s)`);
    }
  }

  // 3. Permission overrides. Keys contain dots, so they can't be $unset by
  // path — rewrite each tenant's override map instead.
  if (retired.permissionKeys.length) {
    const withOverrides = await tenants
      .find({ 'settings.rolePermissionOverrides': { $exists: true } }, { projection: { slug: 1, 'settings.rolePermissionOverrides': 1 } })
      .toArray();
    let overrideTenants = 0;
    for (const t of withOverrides) {
      const map = (t.settings?.rolePermissionOverrides ?? {}) as Record<string, Record<string, boolean>>;
      let changed = false;
      const cleaned: Record<string, Record<string, boolean>> = {};
      for (const [role, perms] of Object.entries(map)) {
        cleaned[role] = {};
        for (const [key, value] of Object.entries(perms ?? {})) {
          if (retired.permissionKeys.includes(key)) changed = true;
          else cleaned[role][key] = value;
        }
      }
      if (!changed) continue;
      overrideTenants++;
      console.log(`  ${t.slug}: ${typeArg} permission overrides present`);
      if (apply) await tenants.updateOne({ _id: t._id }, { $set: { 'settings.rolePermissionOverrides': cleaned } });
    }
    console.log(`Tenants with ${typeArg} permission overrides: ${overrideTenants}`);
  }

  // 4. Product fields
  if (retired.productFields.length) {
    const filter = anyFieldExists(retired.productFields);
    console.log(`Products with ${typeArg} fields: ${await products.countDocuments(filter)}`);
    if (apply) {
      const r = await products.updateMany(filter, unsetAll(retired.productFields));
      console.log(`  -> cleaned ${r.modifiedCount} product(s)`);
    }
  }

  // 5. Transaction item fields
  if (retired.transactionItemFields.length) {
    const filter = anyFieldExists(retired.transactionItemFields.map((f) => `items.${f}`));
    console.log(`Transactions with ${typeArg} item fields: ${await transactions.countDocuments(filter)}`);
    if (apply) {
      const r = await transactions.updateMany(filter, unsetAll(retired.transactionItemFields.map((f) => `items.$[].${f}`)));
      console.log(`  -> cleaned ${r.modifiedCount} transaction(s)`);
    }
  }

  // 6. Subscription plan feature groups
  if (retired.planFeatureGroups.length) {
    const filter = anyFieldExists(retired.planFeatureGroups);
    console.log(`Subscription plans with ${typeArg} features: ${await plans.countDocuments(filter)}`);
    if (apply) {
      const r = await plans.updateMany(filter, unsetAll(retired.planFeatureGroups));
      console.log(`  -> cleaned ${r.modifiedCount} plan(s)`);
    }
  }

  // 7. Feature flag overrides
  if (retired.featureFlags.length) {
    const filter = { feature: { $in: retired.featureFlags } };
    console.log(`${typeArg} feature-flag overrides: ${await overrides.countDocuments(filter)}`);
    if (apply) {
      const r = await overrides.deleteMany(filter);
      console.log(`  -> deleted ${r.deletedCount} override(s)`);
    }
  }

  // 8. Indexes and collections
  if (retired.productIndexes.length) {
    const existing = await products.indexes();
    for (const fields of retired.productIndexes) {
      const index = existing.find((i) => Object.keys(i.key).join(',') === fields.join(','));
      console.log(`Products {${fields.join(', ')}} index: ${index ? index.name : 'not present'}`);
      if (apply && index?.name) {
        await products.dropIndex(index.name);
        console.log('  -> dropped');
      }
    }
  }

  for (const name of retired.collections) {
    const [found] = await db.listCollections({ name }).toArray();
    const count = found ? await db.collection(name).countDocuments() : 0;
    console.log(`${name} collection: ${found ? `${count} document(s)` : 'not present'}`);
    if (apply && found) {
      await db.dropCollection(name);
      console.log('  -> dropped');
    }
  }

  if (!apply) console.log('\nDry run only — re-run with --apply to write these changes.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
