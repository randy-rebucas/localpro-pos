/**
 * Script to create a default tenant
 * Run with: npx tsx scripts/create-default-tenant.ts
 */
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.local file (Next.js convention)
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
// Also try .env as fallback
dotenv.config({ path: resolve(process.cwd(), '.env') });

import prisma from '../lib/prisma';
import { createUser } from '../lib/data/users';
import { getDefaultTenantSettings } from '../lib/currency';

async function createDefaultTenant() {
  try {
    // Check if default tenant already exists
    const existing = await prisma.tenant.findFirst({ where: { slug: 'default' } });
    if (existing) {
      console.log('Default tenant already exists');
      return;
    }

    // Get default settings and customize (following tenant signup route pattern)
    const defaultSettings = getDefaultTenantSettings();
    const settings = {
      ...defaultSettings,
      currency: defaultSettings.currency || 'USD',
      language: (defaultSettings.language || 'en') as 'en' | 'es',
      companyName: 'Default Store',
      email: 'admin@default.local',
      phone: '+1-555-0000',
    };

    // Create tenant first (following tenant signup route hierarchy)
    const tenant = await prisma.tenant.create({
      data: {
        slug: 'default',
        name: 'Default Store',
        settings,
        isActive: true,
      },
    });

    // Create admin user for the tenant (after tenant is created)
    const adminEmail = 'admin@default.local';
    const adminPassword = 'Admindefault123!';
    const adminName = 'Administrator';

    try {
      await createUser({
        email: adminEmail,
        password: adminPassword,
        name: adminName,
        role: 'admin',
        tenantId: tenant.id,
        isActive: true,
      });
      console.log('Default tenant created:', tenant);
      console.log('\n✅ Admin User Created for Default Store:');
      console.log(`  Email:       ${adminEmail}`);
      console.log(`  Password:    ${adminPassword}`);
      console.log(`  Role:        admin`);
      console.log(`  Tenant:      ${tenant.name} (${tenant.slug})`);
      console.log(`  Tenant ID:   ${tenant.id}`);
      console.log('\n⚠️  IMPORTANT: Please change the admin password after first login!');
    } catch (userError: unknown) {
      console.log('Default tenant created:', tenant);
      if (userError && typeof userError === 'object' && 'message' in userError) {
        console.log('\n⚠️  Warning: Failed to create admin user:', (userError as { message: string }).message);
      } else {
        console.log('\n⚠️  Warning: Failed to create admin user:', userError);
      }
    }
  } catch (error) {
    console.error('Error creating default tenant:', error);
    process.exit(1);
  }
}

createDefaultTenant().finally(() => prisma.$disconnect());
