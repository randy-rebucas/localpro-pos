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

import prisma from '../lib/prisma';
import { createUser } from '../lib/data/users';

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

    // Find tenant
    const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug } });
    if (!tenant) {
      console.error(`Tenant "${tenantSlug}" not found`);
      process.exit(1);
    }

    // Check if user already exists
    const existing = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), tenantId: tenant.id },
    });
    if (existing) {
      console.error(`User with email "${email}" already exists for tenant "${tenantSlug}"`);
      process.exit(1);
    }

    // Create admin user
    const user = await createUser({
      email,
      password,
      name,
      role: 'admin',
      tenantId: tenant.id,
      isActive: true,
    });

    console.log('Admin user created successfully:');
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.name}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Tenant: ${tenant.name} (${tenant.slug})`);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser().finally(() => prisma.$disconnect());
