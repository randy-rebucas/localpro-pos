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

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pos-system';
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

    // Create default tenant with comprehensive settings
    const defaultSettings = getDefaultTenantSettings();
    const tenant = await Tenant.create({
      slug: 'default',
      name: 'Default Store',
      settings: defaultSettings,
      isActive: true,
    });

    // Automatically create admin user for the default tenant
    const adminEmail = 'admin@default.local';
    const adminPassword = 'Admindefault123!';
    
    try {
      const adminUser = await User.create({
        email: adminEmail,
        password: adminPassword,
        name: 'Administrator',
        role: 'admin',
        tenantId: tenant._id,
        isActive: true,
      });
      
      console.log('Default tenant created:', tenant);
      console.log('\n✅ Admin User Created:');
      console.log(`  Email:       ${adminEmail}`);
      console.log(`  Password:    ${adminPassword}`);
      console.log(`  Role:        admin`);
      console.log('\n⚠️  IMPORTANT: Please change the admin password after first login!');
    } catch (userError: any) {
      console.log('Default tenant created:', tenant);
      console.log('\n⚠️  Warning: Failed to create admin user:', userError.message);
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error creating default tenant:', error);
    process.exit(1);
  }
}

createDefaultTenant();

