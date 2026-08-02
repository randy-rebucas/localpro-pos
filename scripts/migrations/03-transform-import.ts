/**
 * Transforms exported MongoDB documents (from 01-export.ts) into Postgres
 * rows using the id-map (from 02-id-map.ts) and imports them via Prisma, in
 * FK-dependency order. Idempotent: re-running skips rows that already exist
 * (createMany({ skipDuplicates: true })) or upserts by the migrated id, so a
 * failed run can simply be re-executed.
 *
 * Usage:
 *   npx tsx scripts/migrations/03-transform-import.ts
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import prisma from '../../lib/prisma';
import { loadCollection, loadIdMap, resolveId, resolveIdOrNull, toDate, toDateRequired, emptyToNull, num } from './lib/helpers';

type IdMap = Map<string, string>;

// ─── Phase 2: foundation ─────────────────────────────────────────────────

async function transformTenants(idMap: IdMap) {
  const docs = await loadCollection('tenants');
  for (const d of docs as any[]) {
    await prisma.tenant.upsert({
      where: { id: resolveId(idMap, 'tenants', d._id)! },
      create: {
        id: resolveId(idMap, 'tenants', d._id)!,
        slug: d.slug,
        name: d.name,
        domain: d.domain ?? null,
        subdomain: d.subdomain ?? null,
        settings: d.settings ?? {},
        isActive: d.isActive ?? true,
        onboardingStatus: d.onboardingStatus ?? 'not_started',
        notes: d.notes ?? null,
        grandTotalSales: num(d.grandTotalSales, 0)!,
        grandTotalTransactionCount: num(d.grandTotalTransactionCount, 0)!,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`Tenants: ${docs.length}`);
}

async function transformSubscriptionPlans(idMap: IdMap) {
  const docs = await loadCollection('subscriptionplans');
  for (const d of docs as any[]) {
    await prisma.subscriptionPlan.upsert({
      where: { id: resolveId(idMap, 'subscriptionplans', d._id)! },
      create: {
        id: resolveId(idMap, 'subscriptionplans', d._id)!,
        name: d.name,
        tier: d.tier,
        description: d.description ?? null,
        priceMonthly: num(d.price?.monthly, 0)!,
        priceSetupFee: num(d.price?.setupFee, 0)!,
        priceCurrency: d.price?.currency ?? 'PHP',
        reactivationFee: num(d.reactivationFee, 500)!,
        features: d.features ?? {},
        birCompliance: d.birCompliance ?? {},
        pharmacyCompliance: d.pharmacyCompliance ?? {},
        isActive: d.isActive ?? true,
        isCustom: d.isCustom ?? false,
        availableToNewTenants: d.availableToNewTenants ?? true,
        yearlyDiscount: num(d.yearlyDiscount, 0)!,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`SubscriptionPlans: ${docs.length}`);
}

// ─── Phase 3: auth / tenant core ─────────────────────────────────────────

async function transformUsers(idMap: IdMap) {
  const docs = await loadCollection('users');
  let skipped = 0;
  for (const d of docs as any[]) {
    const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
    if (d.role !== 'super_admin' && !tenantUuid) {
      console.warn(`Skipping user ${d._id} (${d.email}): no tenantId and not super_admin`);
      skipped++;
      continue;
    }
    await prisma.user.upsert({
      where: { id: resolveId(idMap, 'users', d._id)! },
      create: {
        id: resolveId(idMap, 'users', d._id)!,
        email: d.email,
        password: d.password,
        name: d.name,
        role: d.role,
        tenantId: tenantUuid,
        branchId: null, // backfilled after Branch import
        isActive: d.isActive ?? true,
        lastLogin: toDate(d.lastLogin),
        qrToken: d.qrToken ?? null,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
    // Note: `pin` field found in production data isn't referenced anywhere in
    // the codebase (dead field from a removed/unshipped feature) — intentionally dropped.
  }
  console.log(`Users: ${docs.length - skipped} (skipped ${skipped})`);
}

async function transformBranches(idMap: IdMap) {
  const docs = await loadCollection('branches');
  for (const d of docs as any[]) {
    await prisma.branch.upsert({
      where: { id: resolveId(idMap, 'branches', d._id)! },
      create: {
        id: resolveId(idMap, 'branches', d._id)!,
        tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
        name: d.name,
        code: d.code ?? null,
        address: d.address ?? null,
        phone: d.phone ?? null,
        email: d.email ?? null,
        managerId: resolveIdOrNull(idMap, 'users', d.managerId),
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`Branches: ${docs.length}`);
}

async function backfillUserBranchIds(idMap: IdMap) {
  const docs = (await loadCollection('users')).filter((d: any) => d.branchId);
  for (const d of docs as any[]) {
    await prisma.user.update({
      where: { id: resolveId(idMap, 'users', d._id)! },
      data: { branchId: resolveIdOrNull(idMap, 'branches', d.branchId) },
    });
  }
  if (docs.length) console.log(`Backfilled branchId on ${docs.length} users`);
}

async function backfillTenantCreatedBy(idMap: IdMap) {
  const docs = (await loadCollection('tenants')).filter((d: any) => d.createdBy);
  for (const d of docs as any[]) {
    await prisma.tenant.update({
      where: { id: resolveId(idMap, 'tenants', d._id)! },
      data: { createdBy: resolveIdOrNull(idMap, 'users', d.createdBy) },
    });
  }
  if (docs.length) console.log(`Backfilled createdBy on ${docs.length} tenants`);
}

async function transformDevices(idMap: IdMap) {
  const docs = await loadCollection('devices');
  for (const d of docs as any[]) {
    await prisma.device.upsert({
      where: { id: resolveId(idMap, 'devices', d._id)! },
      create: {
        id: resolveId(idMap, 'devices', d._id)!,
        tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
        branchId: resolveIdOrNull(idMap, 'branches', d.branchId),
        label: d.label,
        serialNumber: d.serialNumber,
        terminalId: d.terminalId,
        ptuNumber: d.ptuNumber ?? null,
        ptuStatus: d.ptuStatus ?? 'pending',
        isActive: d.isActive ?? true,
        registeredBy: resolveId(idMap, 'users', d.registeredBy)!,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`Devices: ${docs.length}`);
}

async function transformTables(idMap: IdMap) {
  const docs = await loadCollection('tables');
  for (const d of docs as any[]) {
    await prisma.table.upsert({
      where: { id: resolveId(idMap, 'tables', d._id)! },
      create: {
        id: resolveId(idMap, 'tables', d._id)!,
        tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
        branchId: resolveIdOrNull(idMap, 'branches', d.branchId),
        name: d.name,
        capacity: d.capacity ?? null,
        status: d.status ?? 'open',
        currentOrderId: null, // backfilled after Transaction import
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`Tables: ${docs.length}`);
}

async function backfillTableCurrentOrder(idMap: IdMap) {
  const docs = (await loadCollection('tables')).filter((d: any) => d.currentOrderId);
  for (const d of docs as any[]) {
    await prisma.table.update({
      where: { id: resolveId(idMap, 'tables', d._id)! },
      data: { currentOrderId: resolveIdOrNull(idMap, 'transactions', d.currentOrderId) },
    });
  }
  if (docs.length) console.log(`Backfilled currentOrderId on ${docs.length} tables`);
}

async function transformTaxRules(idMap: IdMap) {
  const docs = await loadCollection('taxrules');
  for (const d of docs as any[]) {
    await prisma.taxRule.upsert({
      where: { id: resolveId(idMap, 'taxrules', d._id)! },
      create: {
        id: resolveId(idMap, 'taxrules', d._id)!,
        tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
        name: d.name,
        rate: num(d.rate, 0)!,
        label: d.label ?? 'Tax',
        appliesTo: d.appliesTo ?? 'all',
        categoryIds: (d.categoryIds ?? []).map((c: unknown) => resolveIdOrNull(idMap, 'categories', c)).filter(Boolean),
        productIds: (d.productIds ?? []).map((p: unknown) => resolveIdOrNull(idMap, 'products', p)).filter(Boolean),
        region: d.region ?? null,
        priority: d.priority ?? 0,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`TaxRules: ${docs.length}`);
}

async function transformFeatureFlagOverrides(idMap: IdMap) {
  const docs = await loadCollection('featureflagoverrides');
  for (const d of docs as any[]) {
    await prisma.featureFlagOverride.upsert({
      where: { id: resolveId(idMap, 'featureflagoverrides', d._id)! },
      create: {
        id: resolveId(idMap, 'featureflagoverrides', d._id)!,
        tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
        feature: d.feature,
        enabled: d.enabled,
        reason: d.reason ?? null,
        expiresAt: toDate(d.expiresAt),
        grantedBy: resolveId(idMap, 'users', d.grantedBy)!,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`FeatureFlagOverrides: ${docs.length}`);
}

async function transformAddresses(idMap: IdMap) {
  const docs = await loadCollection('addresses');
  for (const d of docs as any[]) {
    const userUuid = resolveIdOrNull(idMap, 'users', d.userId);
    if (!userUuid) { console.warn(`Skipping address ${d._id}: unresolved userId`); continue; }
    await prisma.address.upsert({
      where: { id: resolveId(idMap, 'addresses', d._id)! },
      create: {
        id: resolveId(idMap, 'addresses', d._id)!,
        userId: userUuid,
        tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
        label: d.label ?? 'Home',
        street: d.street,
        city: d.city,
        state: d.state ?? null,
        zipCode: d.zipCode ?? null,
        country: d.country,
        isDefault: d.isDefault ?? false,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`Addresses: ${docs.length}`);
}

async function transformFiles(idMap: IdMap) {
  const docs = await loadCollection('files');
  for (const d of docs as any[]) {
    const uploadedByUuid = resolveIdOrNull(idMap, 'users', d.uploadedBy);
    if (!uploadedByUuid) { console.warn(`Skipping file ${d._id}: unresolved uploadedBy`); continue; }
    await prisma.file.upsert({
      where: { id: resolveId(idMap, 'files', d._id)! },
      create: {
        id: resolveId(idMap, 'files', d._id)!,
        tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
        name: d.name,
        filename: d.filename,
        size: d.size,
        type: d.type,
        url: d.url,
        uploadedBy: uploadedByUuid,
        uploadedAt: toDateRequired(d.uploadedAt),
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`Files: ${docs.length}`);
}

async function transformAuditLogs(idMap: IdMap) {
  const docs = await loadCollection('auditlogs');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      if (!tenantUuid) return null;
      return {
        id: resolveId(idMap, 'auditlogs', d._id)!,
        tenantId: tenantUuid,
        userId: resolveIdOrNull(idMap, 'users', d.userId),
        action: d.action,
        entityType: d.entityType,
        entityId: d.entityId ?? null,
        changes: d.changes ?? null,
        ipAddress: d.ipAddress ?? null,
        userAgent: d.userAgent ?? null,
        metadata: d.metadata ?? null,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt ?? d.createdAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.auditLog.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
  }
  console.log(`AuditLogs: ${rows.length} (skipped ${docs.length - rows.length})`);
}

async function transformArchivedAuditLogs(idMap: IdMap) {
  const docs = await loadCollection('archivedauditlogs');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      if (!tenantUuid) return null;
      return {
        id: resolveId(idMap, 'archivedauditlogs', d._id)!,
        tenantId: tenantUuid,
        userId: resolveIdOrNull(idMap, 'users', d.userId),
        action: d.action,
        entityType: d.entityType,
        entityId: d.entityId ?? null,
        changes: d.changes ?? null,
        ipAddress: d.ipAddress ?? null,
        userAgent: d.userAgent ?? null,
        metadata: d.metadata ?? null,
        archivedAt: toDateRequired(d.archivedAt),
        createdAt: toDateRequired(d.createdAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.archivedAuditLog.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
  }
  console.log(`ArchivedAuditLogs: ${rows.length}`);
}

async function transformSuperAdminActions(idMap: IdMap) {
  const docs = await loadCollection('superadminactions');
  const rows = (docs as any[]).map((d) => ({
    id: resolveId(idMap, 'superadminactions', d._id)!,
    adminUserId: resolveId(idMap, 'users', d.adminUserId)!,
    action: d.action,
    targetType: d.targetType ?? null,
    targetId: d.targetId ?? null,
    description: d.description ?? null,
    changes: d.changes ?? null,
    ipAddress: d.ipAddress ?? null,
    userAgent: d.userAgent ?? null,
    metadata: d.metadata ?? null,
    createdAt: toDateRequired(d.createdAt),
  }));
  await prisma.superAdminAction.createMany({ data: rows, skipDuplicates: true });
  console.log(`SuperAdminActions: ${rows.length}`);
}

// ─── Phase 4: catalog / config ───────────────────────────────────────────

async function transformCategories(idMap: IdMap) {
  const docs = await loadCollection('categories');
  for (const d of docs as any[]) {
    await prisma.category.upsert({
      where: { id: resolveId(idMap, 'categories', d._id)! },
      create: {
        id: resolveId(idMap, 'categories', d._id)!,
        tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
        name: d.name,
        description: d.description ?? null,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`Categories: ${docs.length}`);
}

async function transformProducts(idMap: IdMap) {
  const docs = await loadCollection('products');
  let skipped = 0;
  let dedupedBarcodes = 0;
  // Real production data has 4 (tenantId, barcode) pairs shared by two
  // different products — Mongo's unique index wasn't strictly enforced.
  // Postgres will reject the duplicate outright, so null the barcode on the
  // 2nd+ occurrence rather than inventing fake uniqueness or blocking the run.
  const seenBarcodes = new Set<string>();
  for (const d of docs as any[]) {
    const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
    if (!tenantUuid) { skipped++; continue; }
    const productId = resolveId(idMap, 'products', d._id)!;

    let barcode = d.barcode ?? null;
    if (barcode) {
      const key = `${tenantUuid}:${barcode}`;
      if (seenBarcodes.has(key)) {
        console.warn(`Product ${d._id} (${d.name}): duplicate barcode "${barcode}" within tenant — clearing barcode on this row (needs manual review)`);
        barcode = null;
        dedupedBarcodes++;
      } else {
        seenBarcodes.add(key);
      }
    }

    await prisma.product.upsert({
      where: { id: productId },
      create: {
        id: productId,
        tenantId: tenantUuid,
        name: d.name,
        description: d.description ?? null,
        price: num(d.price, 0)!,
        stock: BigInt(Math.trunc(num(d.stock, 0)!)),
        sku: d.sku ?? null,
        barcode,
        category: d.category ?? null,
        categoryId: resolveIdOrNull(idMap, 'categories', d.categoryId),
        image: d.image ?? null,
        productType: d.productType ?? 'regular',
        hasVariations: d.hasVariations ?? false,
        variations: d.variations ?? null,
        modifiers: d.modifiers ?? null,
        allergens: d.allergens ?? [],
        nutritionInfo: d.nutritionInfo ?? null,
        taxExempt: d.taxExempt ?? false,
        zeroRated: d.zeroRated ?? false,
        trackInventory: d.trackInventory ?? true,
        allowOutOfStockSales: d.allowOutOfStockSales ?? false,
        lowStockThreshold: d.lowStockThreshold ?? null,
        pinned: d.pinned ?? false,
        serviceType: d.serviceType ?? null,
        weightBased: d.weightBased ?? false,
        pickupDelivery: d.pickupDelivery ?? false,
        estimatedDuration: d.estimatedDuration ?? null,
        serviceDuration: d.serviceDuration ?? null,
        staffRequired: d.staffRequired ?? 1,
        equipmentRequired: d.equipmentRequired ?? [],
        genericName: d.genericName ?? null,
        manufacturer: d.manufacturer ?? null,
        prn: d.prn ?? null,
        batchNumber: d.batchNumber ?? null,
        expiryDate: toDate(d.expiryDate),
        drugSchedule: d.drugSchedule ?? null,
        requiresPrescription: d.requiresPrescription ?? false,
        storageConditions: d.storageConditions ?? null,
        activeIngredient: d.activeIngredient ?? null,
        dosageStrength: d.dosageStrength ?? null,
        dosageForm: d.dosageForm ?? null,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });

    if (d.branchStock?.length) {
      const existing = await prisma.productBranchStock.findMany({ where: { productId }, select: { id: true } });
      if (existing.length === 0) {
        for (const bs of d.branchStock) {
          const branchUuid = resolveIdOrNull(idMap, 'branches', bs.branchId);
          if (!branchUuid) continue;
          await prisma.productBranchStock.create({
            data: { productId, branchId: branchUuid, stock: bs.stock ?? 0 },
          });
        }
      }
    }
  }
  console.log(`Products: ${docs.length - skipped} (skipped ${skipped}, deduped barcodes ${dedupedBarcodes})`);
}

async function transformProductBundles(idMap: IdMap) {
  const docs = await loadCollection('productbundles');
  for (const d of docs as any[]) {
    const bundleId = resolveId(idMap, 'productbundles', d._id)!;
    await prisma.productBundle.upsert({
      where: { id: bundleId },
      create: {
        id: bundleId,
        tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
        name: d.name,
        description: d.description ?? null,
        price: num(d.price, 0)!,
        sku: d.sku ?? null,
        categoryId: resolveIdOrNull(idMap, 'categories', d.categoryId),
        image: d.image ?? null,
        trackInventory: d.trackInventory ?? true,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });

    const existing = await prisma.productBundleItem.findMany({ where: { bundleId }, select: { id: true } });
    if (existing.length === 0) {
      for (const item of d.items ?? []) {
        const productUuid = resolveIdOrNull(idMap, 'products', item.productId);
        if (!productUuid) continue;
        await prisma.productBundleItem.create({
          data: {
            bundleId,
            productId: productUuid,
            productName: item.productName,
            quantity: item.quantity,
            variation: item.variation ?? null,
          },
        });
      }
    }
  }
  console.log(`ProductBundles: ${docs.length}`);
}

async function transformProductChannelListings(idMap: IdMap) {
  const docs = await loadCollection('productchannellistings');
  for (const d of docs as any[]) {
    const productUuid = resolveIdOrNull(idMap, 'products', d.productId);
    if (!productUuid) continue;
    await prisma.productChannelListing.upsert({
      where: { id: resolveId(idMap, 'productchannellistings', d._id)! },
      create: {
        id: resolveId(idMap, 'productchannellistings', d._id)!,
        tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
        productId: productUuid,
        provider: d.provider,
        externalProductId: d.externalProductId,
        externalVariantId: d.externalVariantId,
        inventoryItemId: d.inventoryItemId ?? null,
        sku: d.sku ?? null,
        variation: d.variation ?? null,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`ProductChannelListings: ${docs.length}`);
}

async function transformDiscounts(idMap: IdMap) {
  const docs = await loadCollection('discounts');
  const rows = (docs as any[]).map((d) => ({
    id: resolveId(idMap, 'discounts', d._id)!,
    tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
    code: d.code,
    name: d.name ?? null,
    description: d.description ?? null,
    type: d.type,
    value: num(d.value, 0)!,
    category: d.category ?? 'general',
    requiresIdVerification: d.requiresIdVerification ?? false,
    minPurchaseAmount: num(d.minPurchaseAmount),
    maxDiscountAmount: num(d.maxDiscountAmount),
    validFrom: toDateRequired(d.validFrom),
    validUntil: toDateRequired(d.validUntil),
    usageLimit: d.usageLimit ?? null,
    usageCount: d.usageCount ?? 0,
    isActive: d.isActive ?? true,
    createdAt: toDateRequired(d.createdAt),
    updatedAt: toDateRequired(d.updatedAt),
  }));
  await prisma.discount.createMany({ data: rows, skipDuplicates: true });
  console.log(`Discounts: ${rows.length}`);
}

async function transformCoupons(idMap: IdMap) {
  const docs = await loadCollection('coupons');
  for (const d of docs as any[]) {
    const createdByUuid = resolveIdOrNull(idMap, 'users', d.createdBy);
    if (!createdByUuid) { console.warn(`Skipping coupon ${d._id}: unresolved createdBy`); continue; }
    await prisma.coupon.upsert({
      where: { id: resolveId(idMap, 'coupons', d._id)! },
      create: {
        id: resolveId(idMap, 'coupons', d._id)!,
        code: d.code,
        description: d.description ?? null,
        discountType: d.discountType,
        discountValue: num(d.discountValue, 0)!,
        appliesTo: d.appliesTo ?? 'all_plans',
        planIds: (d.planIds ?? []).map((p: unknown) => resolveIdOrNull(idMap, 'subscriptionplans', p)).filter(Boolean),
        maxUses: d.maxUses ?? null,
        usedCount: d.usedCount ?? 0,
        validFrom: toDateRequired(d.validFrom),
        validUntil: toDate(d.validUntil),
        isActive: d.isActive ?? true,
        createdBy: createdByUuid,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`Coupons: ${docs.length}`);
}

async function transformLoyaltyConfigs(idMap: IdMap) {
  const docs = await loadCollection('loyaltyconfigs');
  for (const d of docs as any[]) {
    const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
    if (!tenantUuid) continue;
    await prisma.loyaltyConfig.upsert({
      where: { tenantId: tenantUuid },
      create: {
        id: resolveId(idMap, 'loyaltyconfigs', d._id)!,
        tenantId: tenantUuid,
        pointsPerPeso: num(d.pointsPerPeso, 1)!,
        pesoPerPoint: num(d.pesoPerPoint, 0.1)!,
        minRedemption: d.minRedemption ?? 100,
        isEnabled: d.isEnabled ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`LoyaltyConfigs: ${docs.length}`);
}

async function transformCampaigns(idMap: IdMap) {
  const docs = await loadCollection('campaigns');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      if (!tenantUuid) return null;
      return {
        id: resolveId(idMap, 'campaigns', d._id)!,
        tenantId: tenantUuid,
        name: d.name,
        channel: d.channel,
        segment: d.segment,
        subject: d.subject ?? null,
        body: d.body,
        status: d.status ?? 'draft',
        sentCount: d.sentCount ?? 0,
        sentAt: toDate(d.sentAt),
        createdBy: resolveIdOrNull(idMap, 'users', d.createdBy),
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.campaign.createMany({ data: rows, skipDuplicates: true });
  console.log(`Campaigns: ${rows.length}`);
}

async function transformTenantEcommerceIntegrations(idMap: IdMap) {
  const docs = await loadCollection('tenantecommerceintegrations');
  for (const d of docs as any[]) {
    await prisma.tenantEcommerceIntegration.upsert({
      where: { id: resolveId(idMap, 'tenantecommerceintegrations', d._id)! },
      create: {
        id: resolveId(idMap, 'tenantecommerceintegrations', d._id)!,
        tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
        provider: d.provider,
        shopDomain: d.shopDomain ?? null,
        siteUrl: d.siteUrl ?? null,
        credentialsEncrypted: d.credentialsEncrypted,
        webhookSecretEncrypted: d.webhookSecretEncrypted ?? null,
        scopes: d.scopes ?? [],
        shopifyLocationId: d.shopifyLocationId ?? null,
        isActive: d.isActive ?? true,
        lastSyncAt: toDate(d.lastSyncAt),
        lastError: d.lastError ?? null,
        defaultBranchId: resolveIdOrNull(idMap, 'branches', d.defaultBranchId),
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`TenantEcommerceIntegrations: ${docs.length}`);
}

// ─── Phase 5: transactional / POS core ───────────────────────────────────

async function transformCustomers(idMap: IdMap) {
  const docs = await loadCollection('customers');
  for (const d of docs as any[]) {
    await prisma.customer.upsert({
      where: { id: resolveId(idMap, 'customers', d._id)! },
      create: {
        id: resolveId(idMap, 'customers', d._id)!,
        tenantId: resolveId(idMap, 'tenants', d.tenantId)!,
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email ?? null,
        phone: d.phone ?? null,
        addresses: d.addresses ?? [],
        dateOfBirth: toDate(d.dateOfBirth),
        notes: d.notes ?? null,
        tags: d.tags ?? [],
        totalSpent: num(d.totalSpent, 0)!,
        lastPurchaseDate: toDate(d.lastPurchaseDate),
        loyaltyPointsBalance: d.loyaltyPointsBalance ?? 0,
        accountBalance: num(d.accountBalance, 0)!,
        creditLimit: num(d.creditLimit),
        shopifyCustomerId: d.shopifyCustomerId ?? null,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });
  }
  console.log(`Customers: ${docs.length}`);
}

async function transformCustomerOTPs(idMap: IdMap) {
  const docs = await loadCollection('customerotps');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      if (!tenantUuid) return null;
      return {
        id: resolveId(idMap, 'customerotps', d._id)!,
        tenantId: tenantUuid,
        phone: d.phone,
        otp: d.otp,
        expiresAt: toDateRequired(d.expiresAt),
        verified: d.verified ?? false,
        attempts: d.attempts ?? 0,
        createdAt: toDateRequired(d.createdAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.customerOTP.createMany({ data: rows, skipDuplicates: true });
  console.log(`CustomerOTPs: ${rows.length}`);
}

async function transformCustomerBalancePayments(idMap: IdMap) {
  const docs = await loadCollection('customerbalancepayments');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      const customerUuid = resolveIdOrNull(idMap, 'customers', d.customerId);
      if (!tenantUuid || !customerUuid) return null;
      return {
        id: resolveId(idMap, 'customerbalancepayments', d._id)!,
        tenantId: tenantUuid,
        customerId: customerUuid,
        amount: num(d.amount, 0)!,
        method: d.method,
        notes: d.notes ?? null,
        recordedBy: resolveIdOrNull(idMap, 'users', d.recordedBy),
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.customerBalancePayment.createMany({ data: rows, skipDuplicates: true });
  console.log(`CustomerBalancePayments: ${rows.length}`);
}

async function transformBookings(idMap: IdMap) {
  const docs = await loadCollection('bookings');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      if (!tenantUuid) return null;
      return {
        id: resolveId(idMap, 'bookings', d._id)!,
        tenantId: tenantUuid,
        customerName: d.customerName,
        customerEmail: d.customerEmail ?? null,
        customerPhone: d.customerPhone ?? null,
        serviceName: d.serviceName,
        serviceDescription: d.serviceDescription ?? null,
        startTime: toDateRequired(d.startTime),
        endTime: toDateRequired(d.endTime),
        duration: d.duration,
        status: d.status ?? 'pending',
        staffId: resolveIdOrNull(idMap, 'users', d.staffId),
        staffName: d.staffName ?? null,
        notes: d.notes ?? null,
        reminderSent: d.reminderSent ?? false,
        confirmationSent: d.confirmationSent ?? false,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.booking.createMany({ data: rows, skipDuplicates: true });
  console.log(`Bookings: ${rows.length}`);
}

async function transformRecurringBookingTemplates(idMap: IdMap) {
  const docs = await loadCollection('recurringbookingtemplates');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      if (!tenantUuid) return null;
      return {
        id: resolveId(idMap, 'recurringbookingtemplates', d._id)!,
        tenantId: tenantUuid,
        customerName: d.customerName,
        customerEmail: d.customerEmail ?? null,
        customerPhone: d.customerPhone ?? null,
        serviceName: d.serviceName,
        serviceDescription: d.serviceDescription ?? null,
        staffId: resolveIdOrNull(idMap, 'users', d.staffId),
        staffName: d.staffName ?? null,
        duration: d.duration,
        startTimeHour: d.startTimeHour,
        startTimeMinute: d.startTimeMinute,
        recurrenceType: d.recurrenceType,
        daysOfWeek: d.daysOfWeek ?? [],
        dayOfMonth: d.dayOfMonth ?? null,
        effectiveFrom: toDateRequired(d.effectiveFrom),
        effectiveTo: toDate(d.effectiveTo),
        notes: d.notes ?? null,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.recurringBookingTemplate.createMany({ data: rows, skipDuplicates: true });
  console.log(`RecurringBookingTemplates: ${rows.length}`);
}

async function transformSavedCarts(idMap: IdMap) {
  const docs = await loadCollection('savedcarts');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      const userUuid = resolveIdOrNull(idMap, 'users', d.userId);
      if (!tenantUuid || !userUuid) return null;
      // Remap embedded productId refs inside the jsonb items blob so they stay
      // valid after Product ids change from ObjectId to UUID.
      const items = (d.items ?? []).map((item: any) => ({
        ...item,
        productId: resolveIdOrNull(idMap, 'products', item.productId) ?? item.productId,
      }));
      return {
        id: resolveId(idMap, 'savedcarts', d._id)!,
        tenantId: tenantUuid,
        name: d.name ?? 'Saved Cart',
        items,
        subtotal: num(d.subtotal, 0)!,
        discountCode: d.discountCode ?? null,
        discountAmount: num(d.discountAmount),
        total: num(d.total, 0)!,
        userId: userUuid,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.savedCart.createMany({ data: rows, skipDuplicates: true });
  console.log(`SavedCarts: ${rows.length}`);
}

async function transformCashDrawerSessions(idMap: IdMap) {
  const docs = await loadCollection('cashdrawersessions');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      const userUuid = resolveIdOrNull(idMap, 'users', d.userId);
      if (!tenantUuid || !userUuid) return null;
      return {
        id: resolveId(idMap, 'cashdrawersessions', d._id)!,
        tenantId: tenantUuid,
        userId: userUuid,
        openingAmount: num(d.openingAmount, 0)!,
        closingAmount: num(d.closingAmount),
        expectedAmount: num(d.expectedAmount),
        shortage: num(d.shortage),
        overage: num(d.overage),
        openingTime: toDateRequired(d.openingTime),
        closingTime: toDate(d.closingTime),
        status: d.status ?? 'open',
        notes: d.notes ?? null,
        totalVAT: num(d.totalVAT, 0)!,
        totalDiscounts: num(d.totalDiscounts, 0)!,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  // Import sequentially (not createMany) so a stray double-"open" row from
  // dirty data hits the partial unique index as a clear per-row error rather
  // than aborting the whole batch.
  let imported = 0;
  for (const row of rows) {
    try {
      await prisma.cashDrawerSession.upsert({ where: { id: row.id }, create: row, update: {} });
      imported++;
    } catch (err) {
      console.warn(`Skipping cashDrawerSession ${row.id}: ${(err as Error).message.split('\n')[0]}`);
    }
  }
  console.log(`CashDrawerSessions: ${imported}/${rows.length}`);
}

async function transformTransactions(idMap: IdMap) {
  const docs = await loadCollection('transactions');
  let skipped = 0;
  for (const d of docs as any[]) {
    const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
    if (!tenantUuid || d.subtotal == null) {
      console.warn(`Skipping transaction ${d._id}: missing tenantId or subtotal (known legacy test record)`);
      skipped++;
      continue;
    }
    const txnId = resolveId(idMap, 'transactions', d._id)!;
    await prisma.transaction.upsert({
      where: { id: txnId },
      create: {
        id: txnId,
        tenantId: tenantUuid,
        branchId: resolveIdOrNull(idMap, 'branches', d.branchId),
        subtotal: num(d.subtotal, 0)!,
        discountCode: d.discountCode ?? null,
        discountCategory: d.discountCategory ?? null,
        discountAmount: num(d.discountAmount),
        scPwdName: d.scPwdName ?? null,
        scPwdId: d.scPwdId ?? null,
        taxExemptAmount: num(d.taxExemptAmount, 0)!,
        zeroRatedAmount: num(d.zeroRatedAmount, 0)!,
        taxAmount: num(d.taxAmount, 0)!,
        total: num(d.total, 0)!,
        paymentMethod: d.paymentMethod,
        paymentProvider: d.paymentProvider ?? null,
        paymentReference: d.paymentReference ?? null,
        bnplInstallments: d.bnplInstallments ?? null,
        cashReceived: num(d.cashReceived),
        change: num(d.change),
        status: d.status ?? 'completed',
        customerId: resolveIdOrNull(idMap, 'customers', d.customerId),
        loyaltyPointsEarned: d.loyaltyPointsEarned ?? null,
        loyaltyPointsRedeemed: d.loyaltyPointsRedeemed ?? null,
        userId: resolveIdOrNull(idMap, 'users', d.userId),
        deviceId: resolveIdOrNull(idMap, 'devices', d.deviceId),
        terminalId: d.terminalId ?? null,
        deviceSerialNumber: d.deviceSerialNumber ?? null,
        receiptNumber: d.receiptNumber ?? null,
        notes: d.notes ?? null,
        displayCurrency: d.displayCurrency ?? null,
        displayTotal: num(d.displayTotal),
        orderType: d.orderType ?? null,
        tableNumber: d.tableNumber ?? null,
        tableId: resolveIdOrNull(idMap, 'tables', d.tableId),
        splitCount: d.splitCount ?? null,
        salesChannel: d.salesChannel ?? null,
        externalOrderId: d.externalOrderId ?? null,
        channelSyncKey: d.channelSyncKey ?? null,
        channelImportedAt: toDate(d.channelImportedAt),
        shopifyFulfilledAt: toDate(d.shopifyFulfilledAt),
        shopifyFulfillmentId: d.shopifyFulfillmentId ?? null,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });

    const existingItems = await prisma.transactionItem.findMany({ where: { transactionId: txnId }, select: { id: true } });
    if (existingItems.length === 0) {
      for (const item of d.items ?? []) {
        await prisma.transactionItem.create({
          data: {
            transactionId: txnId,
            productId: resolveIdOrNull(idMap, 'products', item.product),
            name: item.name,
            price: num(item.price, 0)!,
            quantity: item.quantity,
            subtotal: num(item.subtotal, 0)!,
            modifiers: item.modifiers ?? null,
            prescriptionId: resolveIdOrNull(idMap, 'prescriptions', item.prescriptionId),
          },
        });
      }
    }

    if (d.splitPayments?.length) {
      const existingSplits = await prisma.transactionSplitPayment.findMany({ where: { transactionId: txnId }, select: { id: true } });
      if (existingSplits.length === 0) {
        for (const sp of d.splitPayments) {
          await prisma.transactionSplitPayment.create({
            data: {
              transactionId: txnId,
              guestIndex: sp.guestIndex,
              method: sp.method,
              amount: num(sp.amount, 0)!,
              reference: sp.reference ?? null,
            },
          });
        }
      }
    }
  }
  console.log(`Transactions: ${docs.length - skipped} (skipped ${skipped})`);
}

async function transformPrescriptions(idMap: IdMap) {
  const docs = await loadCollection('prescriptions');
  for (const d of docs as any[]) {
    const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
    const createdByUuid = resolveIdOrNull(idMap, 'users', d.createdBy);
    if (!tenantUuid || !createdByUuid) { console.warn(`Skipping prescription ${d._id}: missing tenant/createdBy`); continue; }
    const prescriptionId = resolveId(idMap, 'prescriptions', d._id)!;
    await prisma.prescription.upsert({
      where: { id: prescriptionId },
      create: {
        id: prescriptionId,
        tenantId: tenantUuid,
        prescriptionNumber: d.prescriptionNumber,
        patientName: d.patientName,
        patientAge: d.patientAge ?? null,
        doctorName: d.doctorName,
        doctorPRCNumber: d.doctorPRCNumber,
        doctorClinic: d.doctorClinic ?? null,
        issuedDate: toDateRequired(d.issuedDate),
        validUntil: toDateRequired(d.validUntil),
        transactionId: resolveIdOrNull(idMap, 'transactions', d.transactionId),
        status: d.status ?? 'pending',
        notes: d.notes ?? null,
        scannedCopy: d.scannedCopy ?? null,
        createdBy: createdByUuid,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });

    const existing = await prisma.prescriptionItem.findMany({ where: { prescriptionId }, select: { id: true } });
    if (existing.length === 0) {
      for (const item of d.items ?? []) {
        await prisma.prescriptionItem.create({
          data: {
            prescriptionId,
            productId: resolveIdOrNull(idMap, 'products', item.productId),
            drugName: item.drugName,
            quantity: item.quantity,
            dosage: item.dosage,
            frequency: item.frequency,
            instructions: item.instructions ?? null,
            dispensed: item.dispensed ?? false,
            dispensedAt: toDate(item.dispensedAt),
            dispensedBy: resolveIdOrNull(idMap, 'users', item.dispensedBy),
            dispensedTransactionId: resolveIdOrNull(idMap, 'transactions', item.dispensedTransactionId),
          },
        });
      }
    }
  }
  console.log(`Prescriptions: ${docs.length}`);
}

async function transformPayments(idMap: IdMap) {
  const docs = await loadCollection('payments');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      const txnUuid = resolveIdOrNull(idMap, 'transactions', d.transactionId);
      if (!tenantUuid || !txnUuid) return null;
      return {
        id: resolveId(idMap, 'payments', d._id)!,
        tenantId: tenantUuid,
        transactionId: txnUuid,
        method: d.method,
        amount: num(d.amount, 0)!,
        status: d.status ?? 'pending',
        details: d.details ?? null,
        processedBy: resolveIdOrNull(idMap, 'users', d.processedBy),
        processedAt: toDate(d.processedAt),
        refundedAt: toDate(d.refundedAt),
        refundReason: d.refundReason ?? null,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.payment.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
  }
  console.log(`Payments: ${rows.length} (skipped ${docs.length - rows.length})`);
}

async function transformInvoices(idMap: IdMap) {
  const docs = await loadCollection('invoices');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      if (!tenantUuid) return null;
      return {
        id: resolveId(idMap, 'invoices', d._id)!,
        tenantId: tenantUuid,
        invoiceNumber: d.invoiceNumber,
        transactionId: resolveIdOrNull(idMap, 'transactions', d.transactionId),
        customerId: resolveIdOrNull(idMap, 'customers', d.customerId),
        customerInfo: d.customerInfo ?? null,
        items: d.items ?? [],
        subtotal: num(d.subtotal, 0)!,
        discountAmount: num(d.discountAmount),
        taxAmount: num(d.taxAmount, 0)!,
        total: num(d.total, 0)!,
        dueDate: toDateRequired(d.dueDate),
        paymentTerms: d.paymentTerms ?? null,
        status: d.status ?? 'draft',
        paidAt: toDate(d.paidAt),
        paidAmount: num(d.paidAmount),
        notes: d.notes ?? null,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.invoice.createMany({ data: rows, skipDuplicates: true });
  console.log(`Invoices: ${rows.length}`);
}

async function transformStockMovements(idMap: IdMap) {
  const docs = await loadCollection('stockmovements');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      const productUuid = resolveIdOrNull(idMap, 'products', d.productId);
      if (!tenantUuid || !productUuid) return null;
      return {
        id: resolveId(idMap, 'stockmovements', d._id)!,
        productId: productUuid,
        tenantId: tenantUuid,
        branchId: resolveIdOrNull(idMap, 'branches', d.branchId),
        variation: d.variation ?? null,
        type: d.type,
        quantity: d.quantity,
        previousStock: d.previousStock,
        newStock: d.newStock,
        reason: d.reason ?? null,
        transactionId: resolveIdOrNull(idMap, 'transactions', d.transactionId),
        userId: resolveIdOrNull(idMap, 'users', d.userId),
        notes: d.notes ?? null,
        createdAt: toDateRequired(d.createdAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.stockMovement.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
  }
  console.log(`StockMovements: ${rows.length} (skipped ${docs.length - rows.length})`);
}

async function transformExpenses(idMap: IdMap) {
  const docs = await loadCollection('expenses');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      const userUuid = resolveIdOrNull(idMap, 'users', d.userId);
      if (!tenantUuid || !userUuid) return null;
      return {
        id: resolveId(idMap, 'expenses', d._id)!,
        tenantId: tenantUuid,
        name: d.name,
        description: d.description,
        amount: num(d.amount, 0)!,
        date: toDateRequired(d.date),
        paymentMethod: d.paymentMethod,
        receipt: d.receipt ?? null,
        notes: d.notes ?? null,
        userId: userUuid,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.expense.createMany({ data: rows, skipDuplicates: true });
  console.log(`Expenses: ${rows.length}`);
}

async function transformOfflineTransactions(idMap: IdMap) {
  const docs = await loadCollection('offlinetransactions');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      if (!tenantUuid) return null;
      const items = (d.items ?? []).map((item: any) => ({
        ...item,
        productId: resolveIdOrNull(idMap, 'products', item.productId) ?? item.productId,
      }));
      return {
        id: resolveId(idMap, 'offlinetransactions', d._id)!,
        tenantId: tenantUuid,
        branchId: resolveIdOrNull(idMap, 'branches', d.branchId),
        deviceId: d.deviceId,
        items,
        subtotal: num(d.subtotal, 0)!,
        discountCode: d.discountCode ?? null,
        discountCategory: d.discountCategory ?? null,
        discountAmount: num(d.discountAmount),
        taxExemptAmount: num(d.taxExemptAmount, 0)!,
        taxAmount: num(d.taxAmount, 0)!,
        total: num(d.total, 0)!,
        paymentMethod: d.paymentMethod,
        cashReceived: num(d.cashReceived),
        change: num(d.change),
        customerId: resolveIdOrNull(idMap, 'customers', d.customerId),
        userId: resolveIdOrNull(idMap, 'users', d.userId),
        notes: d.notes ?? null,
        offlineCreatedAt: toDateRequired(d.offlineCreatedAt),
        syncStatus: d.syncStatus ?? 'pending',
        syncedTransactionId: resolveIdOrNull(idMap, 'transactions', d.syncedTransactionId),
        retryCount: d.retryCount ?? 0,
        syncError: d.syncError ?? null,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.offlineTransaction.createMany({ data: rows, skipDuplicates: true });
  console.log(`OfflineTransactions: ${rows.length}`);
}

async function transformZReadings(idMap: IdMap) {
  const docs = await loadCollection('zreadings');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      const generatedByUuid = resolveIdOrNull(idMap, 'users', d.generatedBy);
      if (!tenantUuid || !generatedByUuid) return null;
      return {
        id: resolveId(idMap, 'zreadings', d._id)!,
        tenantId: tenantUuid,
        branchId: resolveIdOrNull(idMap, 'branches', d.branchId),
        businessDate: toDateRequired(d.businessDate),
        beginningGT: num(d.beginningGT, 0)!,
        endingGT: num(d.endingGT, 0)!,
        grossSales: num(d.grossSales, 0)!,
        vatableSales: num(d.vatableSales, 0)!,
        vatAmount: num(d.vatAmount, 0)!,
        vatExemptSales: num(d.vatExemptSales, 0)!,
        zeroRatedSales: num(d.zeroRatedSales, 0)!,
        discountTotal: num(d.discountTotal, 0)!,
        transactionCount: d.transactionCount ?? 0,
        voidCount: d.voidCount ?? 0,
        generatedBy: generatedByUuid,
        generatedAt: toDateRequired(d.generatedAt),
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.zReading.createMany({ data: rows, skipDuplicates: true });
  console.log(`ZReadings: ${rows.length}`);
}

// ─── Phase 6: reporting / peripheral ─────────────────────────────────────

async function transformSubscriptions(idMap: IdMap) {
  const docs = await loadCollection('subscriptions');
  for (const d of docs as any[]) {
    const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
    const planUuid = resolveIdOrNull(idMap, 'subscriptionplans', d.planId);
    if (!tenantUuid || !planUuid) { console.warn(`Skipping subscription ${d._id}: missing tenant/plan`); continue; }
    const subId = resolveId(idMap, 'subscriptions', d._id)!;
    await prisma.subscription.upsert({
      where: { id: subId },
      create: {
        id: subId,
        tenantId: tenantUuid,
        planId: planUuid,
        status: d.status ?? 'trial',
        billingCycle: d.billingCycle ?? 'monthly',
        startDate: toDateRequired(d.startDate),
        endDate: toDate(d.endDate),
        trialEndDate: toDate(d.trialEndDate),
        nextBillingDate: toDate(d.nextBillingDate),
        lastBillingDate: toDate(d.lastBillingDate),
        cancelledAt: toDate(d.cancelledAt),
        cancellationReason: d.cancellationReason ?? null,
        suspendedAt: toDate(d.suspendedAt),
        pausedAt: toDate(d.pausedAt),
        pauseReason: d.pauseReason ?? null,
        pauseEndsAt: toDate(d.pauseEndsAt),
        gracePeriodEndDate: toDate(d.gracePeriodEndDate),
        trialConvertedAt: toDate(d.trialConvertedAt),
        paymentOverdue: d.paymentOverdue ?? false,
        outstandingBalance: num(d.outstandingBalance, 0)!,
        lastInvoiceGeneratedAt: toDate(d.lastInvoiceGeneratedAt),
        lateFeeAppliedAt: toDate(d.lateFeeAppliedAt),
        reactivationFeeAppliedAt: toDate(d.reactivationFeeAppliedAt),
        deactivatedAt: toDate(d.deactivatedAt),
        paymentMethod: d.paymentMethod ?? null,
        usage: d.usage ?? {},
        isTrial: d.isTrial ?? true,
        autoRenew: d.autoRenew ?? true,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      },
      update: {},
    });

    const existing = await prisma.subscriptionBillingHistoryEntry.findMany({ where: { subscriptionId: subId }, select: { id: true } });
    if (existing.length === 0) {
      for (const entry of d.billingHistory ?? []) {
        await prisma.subscriptionBillingHistoryEntry.create({
          data: {
            subscriptionId: subId,
            date: toDateRequired(entry.date),
            amount: num(entry.amount, 0)!,
            currency: entry.currency ?? 'PHP',
            status: entry.status,
            transactionId: emptyToNull(entry.transactionId) ?? null,
            invoiceUrl: emptyToNull(entry.invoiceUrl) ?? null,
          },
        });
      }
    }
  }
  console.log(`Subscriptions: ${docs.length}`);
}

async function transformBillingEvents(idMap: IdMap) {
  const docs = await loadCollection('billingevents');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      const subUuid = resolveIdOrNull(idMap, 'subscriptions', d.subscriptionId);
      if (!tenantUuid || !subUuid) return null;
      return {
        id: resolveId(idMap, 'billingevents', d._id)!,
        tenantId: tenantUuid,
        subscriptionId: subUuid,
        type: d.type,
        amount: num(d.amount, 0)!,
        currency: d.currency ?? 'PHP',
        description: d.description ?? null,
        notes: d.notes ?? null,
        transactionId: d.transactionId ?? null,
        invoiceUrl: d.invoiceUrl ?? null,
        recordedBy: resolveIdOrNull(idMap, 'users', d.recordedBy),
        metadata: d.metadata ?? null,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.billingEvent.createMany({ data: rows, skipDuplicates: true });
  console.log(`BillingEvents: ${rows.length} (skipped ${docs.length - rows.length})`);
}

async function transformLoyaltyTransactions(idMap: IdMap) {
  const docs = await loadCollection('loyaltytransactions');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      const customerUuid = resolveIdOrNull(idMap, 'customers', d.customerId);
      if (!tenantUuid || !customerUuid) return null;
      return {
        id: resolveId(idMap, 'loyaltytransactions', d._id)!,
        tenantId: tenantUuid,
        customerId: customerUuid,
        transactionId: resolveIdOrNull(idMap, 'transactions', d.transactionId),
        type: d.type,
        points: d.points,
        balanceBefore: d.balanceBefore,
        balanceAfter: d.balanceAfter,
        description: d.description,
        createdBy: resolveIdOrNull(idMap, 'users', d.createdBy),
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.loyaltyTransaction.createMany({ data: rows, skipDuplicates: true });
  console.log(`LoyaltyTransactions: ${rows.length}`);
}

async function transformAttendances(idMap: IdMap) {
  const docs = await loadCollection('attendances');
  const rows = (docs as any[])
    .map((d) => {
      const tenantUuid = resolveIdOrNull(idMap, 'tenants', d.tenantId);
      const userUuid = resolveIdOrNull(idMap, 'users', d.userId);
      if (!tenantUuid || !userUuid) return null;
      return {
        id: resolveId(idMap, 'attendances', d._id)!,
        userId: userUuid,
        tenantId: tenantUuid,
        clockIn: toDateRequired(d.clockIn),
        clockOut: toDate(d.clockOut),
        breakStart: toDate(d.breakStart),
        breakEnd: toDate(d.breakEnd),
        totalHours: num(d.totalHours),
        notes: d.notes ?? null,
        location: d.location ?? null,
        isActive: d.isActive ?? true,
        createdAt: toDateRequired(d.createdAt),
        updatedAt: toDateRequired(d.updatedAt),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.attendance.createMany({ data: rows, skipDuplicates: true });
  console.log(`Attendances: ${rows.length}`);
}

// ─── Undocumented models found in the follow-up audit ───────────────────

async function transformCounters() {
  const docs = await loadCollection('counters');
  const rows = (docs as any[]).map((d) => ({ counterKey: d._id, seq: d.seq ?? 0 }));
  await prisma.counter.createMany({ data: rows, skipDuplicates: true });
  console.log(`Counters: ${rows.length}`);
}

async function transformRevokedTokens() {
  const docs = await loadCollection('revokedtokens');
  const rows = (docs as any[]).map((d) => ({
    tokenHash: d.tokenHash,
    reason: d.reason ?? 'logout',
    expiresAt: toDateRequired(d.expiresAt),
  }));
  await prisma.revokedToken.createMany({ data: rows, skipDuplicates: true });
  console.log(`RevokedTokens: ${rows.length}`);
}

async function transformUserRevocations(idMap: IdMap) {
  const docs = await loadCollection('userrevocations');
  const rows = (docs as any[])
    .map((d) => {
      const userUuid = resolveIdOrNull(idMap, 'users', d.userId);
      if (!userUuid) return null;
      return { userId: userUuid, revokedBefore: toDateRequired(d.revokedBefore) };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await prisma.userRevocation.createMany({ data: rows, skipDuplicates: true });
  console.log(`UserRevocations: ${rows.length} (skipped ${docs.length - rows.length})`);
}

async function transformPosSessions() {
  const docs = await loadCollection('possessions'); // Mongoose auto-pluralized "PosSession" -> "possessions"
  const rows = (docs as any[]).map((d) => ({
    sessionId: d.sessionId,
    tenant: d.tenant,
    cart: d.cart ?? [], // NOTE: embedded productId refs inside cart items are NOT remapped here — low-priority ephemeral cache data, see report.
    subtotal: num(d.subtotal, 0)!,
    discount: d.discount ?? null,
    taxAmount: num(d.taxAmount),
    taxRate: num(d.taxRate),
    taxLabel: d.taxLabel ?? null,
    tip: num(d.tip, 0)!,
    total: num(d.total, 0)!,
    paymentMethod: d.paymentMethod ?? null,
    paymentStatus: d.paymentStatus ?? 'pending',
    lastUpdate: toDateRequired(d.lastUpdate ? new Date(d.lastUpdate) : d.updatedAt),
    createdAt: toDateRequired(d.createdAt),
    updatedAt: toDateRequired(d.updatedAt),
  }));
  await prisma.posSession.createMany({ data: rows, skipDuplicates: true });
  console.log(`PosSessions: ${rows.length}`);
}

// ─── Orchestration ────────────────────────────────────────────────────────

async function main() {
  const idMap = await loadIdMap();
  console.log(`Loaded ${idMap.size} id-map entries.\n`);

  console.log('--- Phase 2: foundation ---');
  await transformTenants(idMap);
  await transformSubscriptionPlans(idMap);

  console.log('\n--- Phase 3: auth / tenant core ---');
  await transformUsers(idMap);
  await transformBranches(idMap);
  await backfillUserBranchIds(idMap);
  await backfillTenantCreatedBy(idMap);
  await transformDevices(idMap);
  await transformTables(idMap);
  await transformTaxRules(idMap);
  await transformFeatureFlagOverrides(idMap);
  await transformAddresses(idMap);
  await transformFiles(idMap);
  await transformAuditLogs(idMap);
  await transformArchivedAuditLogs(idMap);
  await transformSuperAdminActions(idMap);

  console.log('\n--- Phase 4: catalog / config ---');
  await transformCategories(idMap);
  await transformProducts(idMap);
  await transformProductBundles(idMap);
  await transformProductChannelListings(idMap);
  await transformDiscounts(idMap);
  await transformCoupons(idMap);
  await transformLoyaltyConfigs(idMap);
  await transformCampaigns(idMap);
  await transformTenantEcommerceIntegrations(idMap);

  console.log('\n--- Phase 5: transactional / POS core ---');
  await transformCustomers(idMap);
  await transformCustomerOTPs(idMap);
  await transformCustomerBalancePayments(idMap);
  await transformBookings(idMap);
  await transformRecurringBookingTemplates(idMap);
  await transformSavedCarts(idMap);
  await transformCashDrawerSessions(idMap);
  await transformTransactions(idMap);
  await backfillTableCurrentOrder(idMap);
  await transformPrescriptions(idMap);
  await transformPayments(idMap);
  await transformInvoices(idMap);
  await transformStockMovements(idMap);
  await transformExpenses(idMap);
  await transformOfflineTransactions(idMap);
  await transformZReadings(idMap);

  console.log('\n--- Phase 6: reporting / peripheral ---');
  await transformSubscriptions(idMap);
  await transformBillingEvents(idMap);
  await transformLoyaltyTransactions(idMap);
  await transformAttendances(idMap);

  console.log('\n--- Undocumented models ---');
  await transformCounters();
  await transformRevokedTokens();
  await transformUserRevocations(idMap);
  await transformPosSessions();

  console.log('\nTransform + import complete.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Transform/import failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
