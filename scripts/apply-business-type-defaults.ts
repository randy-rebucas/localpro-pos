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

import connectDB from '../lib/mongodb';
import Tenant from '../models/Tenant';
import { applyBusinessTypeDefaults } from '../lib/business-types';

async function applyDefaultsToTenant(tenantSlug: string, businessType?: string) {
  try {
    await connectDB();
    
    const tenant = await Tenant.findOne({ slug: tenantSlug });
    if (!tenant) {
      console.error(`Tenant "${tenantSlug}" not found`);
      return false;
    }

    const targetBusinessType = businessType || tenant.settings.businessType;
    if (!targetBusinessType) {
      console.error(`No business type specified for tenant "${tenantSlug}"`);
      return false;
    }

    console.log(`Applying business type defaults for "${tenantSlug}" (${targetBusinessType})...`);
    
    const updatedSettings = applyBusinessTypeDefaults(tenant.settings, targetBusinessType);
    
    await Tenant.updateOne(
      { _id: tenant._id },
      { $set: { settings: updatedSettings } }
    );

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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error applying defaults to "${tenantSlug}":`, errorMessage);
    return false;
  }
}

async function applyDefaultsToAllTenants() {
  try {
    await connectDB();
    
    const tenants = await Tenant.find({ isActive: true });
    console.log(`Found ${tenants.length} active tenants`);
    
    let successCount = 0;
    let skipCount = 0;
    
    for (const tenant of tenants) {
      if (!tenant.settings.businessType) {
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error applying defaults:', errorMessage);
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
  
  process.exit(0);
}

main();
