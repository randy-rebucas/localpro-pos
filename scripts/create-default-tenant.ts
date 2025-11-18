/**
 * Script to create a default tenant
 * Run with: npx tsx scripts/create-default-tenant.ts
 */
import mongoose from 'mongoose';
import Tenant from '../models/Tenant';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pos-system';

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

    // Create default tenant
    const tenant = await Tenant.create({
      slug: 'default',
      name: 'Default Store',
      settings: {
        currency: 'USD',
        timezone: 'UTC',
        language: 'en',
        primaryColor: '#2563eb',
      },
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

