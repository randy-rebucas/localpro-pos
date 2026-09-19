/**
 * Migration Script: Apply Business Type Defaults
 *
 * This script applies business type defaults to existing tenants.
 * Run this after setting business types for tenants.
 *
 * Usage:
 *   npx tsx scripts/apply-business-type-defaults.ts [tenant-slug] [business-type]
 *
 * Examples:
 *   npx tsx scripts/apply-business-type-defaults.ts my-tenant restaurant
 *   npx tsx scripts/apply-business-type-defaults.ts  # Apply to all tenants
 */

import prisma from '../lib/db';
import { applyBusinessTypeDefaults } from '../lib/business-types';

async function applyDefaultsToTenant(tenantSlug: string, businessType?: string) {
  try {
    const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug }, include: { settings: true } });
    if (!tenant || !tenant.settings) {
      console.error(`Tenant "${tenantSlug}" not found`);
      return false;
    }

    const targetBusinessType = businessType || tenant.settings.businessType;
    if (!targetBusinessType) {
      console.error(`No business type specified for tenant "${tenantSlug}"`);
      return false;
    }

    console.log(`Applying business type defaults for "${tenantSlug}" (${targetBusinessType})...`);

    const { tenantId: _tenantId, ...currentSettings } = tenant.settings;
    const updatedSettings = applyBusinessTypeDefaults(
      currentSettings as Record<string, unknown>,
      targetBusinessType
    ) as Record<string, unknown>;

    await prisma.tenantSettings.update({
      where: { tenantId: tenant.id },
      data: updatedSettings,
    });

    console.log(`✅ Successfully applied defaults for "${tenantSlug}"`);
    console.log(`   Features enabled:`, {
      inventory: updatedSettings.enableInventory,
      categories: updatedSettings.enableCategories,
      discounts: updatedSettings.enableDiscounts,
      loyalty: updatedSettings.enableLoyaltyProgram,
      customers: updatedSettings.enableCustomerManagement,
      booking: updatedSettings.enableBookingScheduling,
    });

    return true;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error(`Error applying defaults to "${tenantSlug}":`, error.message);
    return false;
  }
}

async function applyDefaultsToAllTenants() {
  try {
    const tenants = await prisma.tenant.findMany({ where: { isActive: true }, include: { settings: true } });
    console.log(`Found ${tenants.length} active tenants`);

    let successCount = 0;
    let skipCount = 0;

    for (const tenant of tenants) {
      if (!tenant.settings?.businessType) {
        console.log(`⏭️  Skipping "${tenant.slug}" - no business type set`);
        skipCount++;
        continue;
      }

      const success = await applyDefaultsToTenant(tenant.slug, tenant.settings.businessType);
      if (success) {
        successCount++;
      }
    }

    console.log(`\n✅ Completed: ${successCount} tenants updated, ${skipCount} skipped`);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error applying defaults:', error.message);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Apply to all tenants
    console.log('Applying business type defaults to all tenants...\n');
    await applyDefaultsToAllTenants();
  } else if (args.length === 1) {
    // Apply to specific tenant (use existing business type)
    const tenantSlug = args[0];
    await applyDefaultsToTenant(tenantSlug);
  } else if (args.length === 2) {
    // Apply to specific tenant with business type
    const [tenantSlug, businessType] = args;
    await applyDefaultsToTenant(tenantSlug, businessType);
  } else {
    console.error('Usage:');
    console.error('  npx tsx scripts/apply-business-type-defaults.ts [tenant-slug] [business-type]');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx scripts/apply-business-type-defaults.ts');
    console.error('  npx tsx scripts/apply-business-type-defaults.ts my-tenant');
    console.error('  npx tsx scripts/apply-business-type-defaults.ts my-tenant restaurant');
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
