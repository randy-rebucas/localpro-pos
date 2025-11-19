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

    console.log('Default tenant created:', tenant);
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error creating default tenant:', error);
    process.exit(1);
  }
}

createDefaultTenant();

