/**
 * Script to create an admin user for a tenant
 * Usage: npx tsx scripts/create-admin-user.ts <tenant-slug> <email> <password> <name>
 */
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.local file (Next.js convention)
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
// Also try .env as fallback
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import User from '../models/User';
import Tenant from '../models/Tenant';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/1pos';

async function createAdminUser() {
  try {
    const tenantSlug = process.argv[2];
    const email = process.argv[3];
    const password = process.argv[4];
    const name = process.argv[5] || 'Admin User';

    if (!tenantSlug || !email || !password) {
      console.error('Usage: npx tsx scripts/create-admin-user.ts <tenant-slug> <email> <password> [name]');
      process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find tenant
    const tenant = await Tenant.findOne({ slug: tenantSlug });
    if (!tenant) {
      console.error(`Tenant "${tenantSlug}" not found`);
      process.exit(1);
    }

    // Check if user already exists
    const existing = await User.findOne({ email: email.toLowerCase(), tenantId: tenant._id });
    if (existing) {
      console.error(`User with email "${email}" already exists for tenant "${tenantSlug}"`);
      process.exit(1);
    }

    // Create admin user
    const user = await User.create({
      email: email.toLowerCase(),
      password,
      name,
      role: 'admin',
      tenantId: tenant._id,
      isActive: true,
    });

    console.log('Admin user created successfully:');
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.name}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Tenant: ${tenant.name} (${tenant.slug})`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();

