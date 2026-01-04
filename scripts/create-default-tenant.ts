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

import mongoose from 'mongoose';
import Tenant from '../models/Tenant';
import User from '../models/User';
import { getDefaultTenantSettings } from '../lib/currency';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/1pos';
console.log(MONGODB_URI);
async function createDefaultTenant() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if default tenant already exists
    const existing = await Tenant.findOne({ slug: 'default' });
    if (existing) {
      console.log('Default tenant already exists');
      await mongoose.disconnect();
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
    const tenantData: Record<string, unknown> = {
      slug: 'default',
      name: 'Default Store',
      settings,
      isActive: true,
    };

    const tenant = await Tenant.create(tenantData);

    // Create admin user for the tenant (after tenant is created)
    const adminEmail = 'admin@default.local';
    const adminPassword = 'Admindefault123!';
    const adminName = 'Administrator';
    
    try {
      await User.create({
        email: adminEmail.toLowerCase(),
        password: adminPassword,
        name: adminName,
        role: 'admin',
        tenantId: tenant._id,
        isActive: true,
      });
      
      console.log('Default tenant created:', tenant);
      console.log('\n✅ Admin User Created for Default Store:');
      console.log(`  Email:       ${adminEmail}`);
      console.log(`  Password:    ${adminPassword}`);
      console.log(`  Role:        admin`);
      console.log(`  Tenant:      ${tenant.name} (${tenant.slug})`);
      console.log(`  Tenant ID:   ${tenant._id}`);
      console.log('\n⚠️  IMPORTANT: Please change the admin password after first login!');
    } catch (userError: unknown) {
      console.log('Default tenant created:', tenant);
      const errorMessage = userError instanceof Error ? userError.message : 'Unknown error';
      console.log('\n⚠️  Warning: Failed to create admin user:', errorMessage);
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error creating default tenant:', error);
    process.exit(1);
  }
}

createDefaultTenant();

