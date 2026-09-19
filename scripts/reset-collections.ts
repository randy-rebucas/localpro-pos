/**
 * Script to reset/clean database tables (Postgres / Prisma)
 * Usage:
 *   npx tsx scripts/reset-collections.ts [options]
 *
 * Options:
 *   --all                    Clean all tables
 *   --tenant=<slug>          Clean tables for specific tenant
 *   --collection=<name>      Clean specific table(s), comma-separated
 *   --keep-tenants           Keep tenants table when using --all
 *   --keep-users             Keep users table when using --all
 *   --create-default-store   Create default store/tenant after reset
 *   --create-admin           Create admin user for default store (requires --create-default-store)
 *   --create-demo-tenant     Create demo tenant with sample data
 *   --force                  Skip confirmation prompt
 *
 * Examples:
 *   npx tsx scripts/reset-collections.ts --all
 *   npx tsx scripts/reset-collections.ts --all --create-default-store
 *   npx tsx scripts/reset-collections.ts --all --create-default-store --create-admin
 *   npx tsx scripts/reset-collections.ts --all --create-default-store --create-demo-tenant
 *   npx tsx scripts/reset-collections.ts --tenant=default
 *   npx tsx scripts/reset-collections.ts --collection=transactions,products
 *   npx tsx scripts/reset-collections.ts --all --keep-tenants --keep-users
 *
 * IMPORTANT: this script is destructive. Never run it against a database you
 * care about without a fresh backup.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import readline from 'readline';

// Load .env.local file (Next.js convention)
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
// Also try .env as fallback
dotenv.config({ path: resolve(process.cwd(), '.env') });

import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/db';
import { getDefaultTenantSettings } from '../lib/currency';

// Table mapping: collection name (Mongo-era) -> Prisma delegate, all tenant-scoped
// except `tenants` and `users` (users are scoped indirectly via tenantId, kept
// nullable-tolerant here since super-admin users have no tenantId).
const COLLECTIONS = {
  attendances: prisma.attendance,
  auditlogs: prisma.auditLog,
  bookings: prisma.booking,
  branches: prisma.branch,
  cashdrawersessions: prisma.cashDrawerSession,
  categories: prisma.category,
  discounts: prisma.discount,
  expenses: prisma.expense,
  products: prisma.product,
  productbundles: prisma.productBundle,
  savedcarts: prisma.savedCart,
  stockmovements: prisma.stockMovement,
  tenants: prisma.tenant,
  transactions: prisma.transaction,
  users: prisma.user,
} as const;

type CollectionName = keyof typeof COLLECTIONS;

// Helper function to prompt for confirmation
function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Get table counts
async function getCollectionCounts(tenantId?: string) {
  const counts: Record<string, number> = {};

  for (const [name] of Object.entries(COLLECTIONS)) {
    try {
      const collectionName = name as CollectionName;
      const delegate = COLLECTIONS[collectionName] as { count: (args?: unknown) => Promise<number> };
      if (tenantId && collectionName === 'tenants') {
        counts[name] = await delegate.count({ where: { id: tenantId } });
      } else if (tenantId) {
        counts[name] = await delegate.count({ where: { tenantId } });
      } else {
        counts[name] = await delegate.count();
      }
    } catch {
      counts[name] = 0;
    }
  }

  return counts;
}

// Clean tables
async function cleanCollections(
  collections: CollectionName[],
  tenantId?: string,
  keepTenants = false,
  keepUsers = false
) {
  const results: Record<string, { deleted: number; error?: string }> = {};

  for (const collectionName of collections) {
    // Skip if keeping tenants or users
    if (collectionName === 'tenants' && keepTenants) {
      results[collectionName] = { deleted: 0 };
      continue;
    }
    if (collectionName === 'users' && keepUsers) {
      results[collectionName] = { deleted: 0 };
      continue;
    }

    const delegate = COLLECTIONS[collectionName] as { deleteMany: (args?: unknown) => Promise<{ count: number }> };

    try {
      let deleteResult;
      if (tenantId && collectionName === 'tenants') {
        deleteResult = await delegate.deleteMany({ where: { id: tenantId } });
      } else if (tenantId) {
        deleteResult = await delegate.deleteMany({ where: { tenantId } });
      } else {
        deleteResult = await delegate.deleteMany({});
      }
      results[collectionName] = { deleted: deleteResult.count || 0 };
    } catch (error: unknown) {
      results[collectionName] = {
        deleted: 0,
        error: typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string }).message : String(error),
      };
    }
  }

  return results;
}

// Create default store/tenant
async function createDefaultStore(createAdmin = false) {
  try {
    console.log('');
    console.log('Creating default store...');

    // Check if default tenant already exists
    const existing = await prisma.tenant.findFirst({ where: { slug: 'default' } });
    if (existing) {
      console.log('⚠️  Default tenant already exists');
      if (createAdmin) {
        // Check if admin user exists
        const adminExists = await prisma.user.findFirst({
          where: { email: 'admin@default.local', tenantId: existing.id },
        });
        if (!adminExists) {
          console.log('Creating admin user for default store...');
          const hashedPassword = await bcrypt.hash('Admindefault123!', 10);
          const adminUser = await prisma.user.create({
            data: {
              id: randomUUID(),
              email: 'admin@default.local',
              password: hashedPassword,
              name: 'Administrator',
              role: 'admin',
              tenantId: existing.id,
              isActive: true,
            },
          });
          console.log('✓ Admin user created for default store');
          console.log(`  Email:    ${adminUser.email}`);
          console.log(`  Password: Admindefault123!`);
          console.log(`  Role:     admin`);
          console.log(`  Tenant:   ${existing.name} (${existing.slug})`);
          console.log(`  Tenant ID: ${existing.id}`);
          console.log('');
          console.log('⚠️  IMPORTANT: Please change the admin password after first login!');
        } else {
          console.log('⚠️  Admin user already exists for default store');
          console.log(`  Tenant: ${existing.name} (${existing.slug})`);
        }
      }
      return existing;
    }

    // Get default settings and customize (following tenant signup route pattern)
    const defaultSettings = getDefaultTenantSettings();
    const settings: Record<string, unknown> = {
      ...defaultSettings,
      currency: defaultSettings.currency || 'PHP',
      language: (defaultSettings.language || 'en') as 'en' | 'es',
      companyName: 'Default Store',
      email: 'admin@default.local',
      phone: '+1-555-0000',
    };

    // Create tenant first (following tenant signup route hierarchy)
    const tenant = await prisma.tenant.create({
      data: {
        id: randomUUID(),
        slug: 'default',
        name: 'Default Store',
        isActive: true,
        settings: { create: settings },
      },
    });

    console.log('✓ Default store created');
    console.log(`  Name: ${tenant.name}`);
    console.log(`  Slug: ${tenant.slug}`);
    console.log(`  Tenant ID: ${tenant.id}`);

    // Create admin user for the tenant (after tenant is created)
    if (createAdmin) {
      try {
        const adminEmail = 'admin@default.local';
        const adminPassword = 'Admindefault123!';
        const adminName = 'Administrator';

        console.log('');
        console.log('Creating admin user for default store...');
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        const adminUser = await prisma.user.create({
          data: {
            id: randomUUID(),
            email: adminEmail.toLowerCase(),
            password: hashedPassword,
            name: adminName,
            role: 'admin',
            tenantId: tenant.id,
            isActive: true,
          },
        });

        console.log('');
        console.log('✓ Admin user created for default store');
        console.log(`  Email:    ${adminUser.email}`);
        console.log(`  Password: Admindefault123!`);
        console.log(`  Role:     admin`);
        console.log(`  Tenant:   ${tenant.name} (${tenant.slug})`);
        console.log(`  Tenant ID: ${tenant.id}`);
        console.log('');
        console.log('⚠️  IMPORTANT: Please change the admin password after first login!');
      } catch (userError: unknown) {
        console.log('');
        console.log('⚠️  Warning: Failed to create admin user:', typeof userError === 'object' && userError !== null && 'message' in userError ? (userError as { message: string }).message : String(userError));
        console.log(`  Tenant: ${tenant.name} (${tenant.slug})`);
      }
    }

    return tenant;
  } catch (error: unknown) {
    console.error('✗ Error creating default store:', typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string }).message : String(error));
    throw error;
  }
}

// Create demo tenant with sample data
async function createDemoTenant() {
  try {
    console.log('');
    console.log('Creating demo tenant...');

    // Check if demo tenant already exists
    const existing = await prisma.tenant.findFirst({ where: { slug: 'demo' } });
    if (existing) {
      console.log('⚠️  Demo tenant already exists');
      console.log(`  Name: ${existing.name}`);
      console.log(`  Slug: ${existing.slug}`);
      return existing;
    }

    // Create demo tenant with settings
    const defaultSettings = getDefaultTenantSettings();
    const demoTenant = await prisma.tenant.create({
      data: {
        id: randomUUID(),
        slug: 'demo',
        name: 'Demo Store',
        isActive: true,
        settings: {
          create: {
            ...defaultSettings,
            companyName: 'Demo Store',
            email: 'demo@store.local',
            phone: '+1-555-0123',
            addressStreet: '123 Demo Street',
            addressCity: 'Demo City',
            addressState: 'DC',
            addressZipCode: '12345',
            addressCountry: 'USA',
          },
        },
      },
    });

    console.log('✓ Demo tenant created');
    console.log(`  Name: ${demoTenant.name}`);
    console.log(`  Slug: ${demoTenant.slug}`);
    console.log(`  Tenant ID: ${demoTenant.id}`);

    // Create demo admin user
    try {
      console.log('');
      console.log('Creating demo admin user...');
      const hashedPassword = await bcrypt.hash('Admindemo123!', 10);
      const demoAdmin = await prisma.user.create({
        data: {
          id: randomUUID(),
          email: 'admin@demo.local',
          password: hashedPassword,
          name: 'Demo Administrator',
          role: 'admin',
          tenantId: demoTenant.id,
          isActive: true,
        },
      });

      console.log('✓ Demo admin user created');
      console.log(`  Email:    ${demoAdmin.email}`);
      console.log(`  Password: Admindemo123!`);
      console.log(`  Role:     admin`);
      console.log(`  Tenant:   ${demoTenant.name} (${demoTenant.slug})`);
      console.log('');
      console.log('⚠️  IMPORTANT: Please change the admin password after first login!');
    } catch (userError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.log('');
      console.log('⚠️  Warning: Failed to create demo admin user:', userError.message);
    }

    // Create demo categories
    const createdCategories: { id: string; name: string }[] = [];
    try {
      console.log('');
      console.log('Creating demo categories...');
      const categories = [
        { name: 'Electronics', description: 'Electronic products' },
        { name: 'Clothing', description: 'Apparel and accessories' },
        { name: 'Food & Beverages', description: 'Food and drink items' },
        { name: 'Books', description: 'Books and publications' },
      ];

      for (const cat of categories) {
        const category = await prisma.category.create({
          data: {
            id: randomUUID(),
            name: cat.name,
            description: cat.description,
            tenantId: demoTenant.id,
            isActive: true,
          },
        });
        createdCategories.push(category);
      }
      console.log(`✓ Created ${createdCategories.length} demo categories`);
    } catch (catError: unknown) {
      console.log('⚠️  Warning: Failed to create demo categories:', typeof catError === 'object' && catError !== null && 'message' in catError ? (catError as { message: string }).message : String(catError));
    }

    // Create demo products
    try {
      console.log('');
      console.log('Creating demo products...');
      const products = [
        { name: 'Laptop Computer', price: 999.99, stock: 10, category: 'Electronics', sku: 'LAP-001' },
        { name: 'Wireless Mouse', price: 29.99, stock: 50, category: 'Electronics', sku: 'MOU-001' },
        { name: 'T-Shirt', price: 19.99, stock: 100, category: 'Clothing', sku: 'TSH-001' },
        { name: 'Jeans', price: 49.99, stock: 75, category: 'Clothing', sku: 'JEA-001' },
        { name: 'Coffee', price: 12.99, stock: 200, category: 'Food & Beverages', sku: 'COF-001' },
        { name: 'Bottled Water', price: 1.99, stock: 500, category: 'Food & Beverages', sku: 'WAT-001' },
        { name: 'Programming Book', price: 39.99, stock: 25, category: 'Books', sku: 'BOK-001' },
        { name: 'Novel', price: 14.99, stock: 40, category: 'Books', sku: 'BOK-002' },
      ];

      // Get category IDs
      const categories = await prisma.category.findMany({ where: { tenantId: demoTenant.id } });
      const categoryMap = new Map(categories.map((cat) => [cat.name, cat.id]));

      let createdCount = 0;
      for (const prod of products) {
        const categoryId = categoryMap.get(prod.category);
        await prisma.product.create({
          data: {
            id: randomUUID(),
            name: prod.name,
            price: prod.price,
            stock: prod.stock,
            sku: prod.sku,
            category: prod.category,
            categoryId: categoryId,
            tenantId: demoTenant.id,
            productType: 'regular',
            hasVariations: false,
            trackInventory: true,
          },
        });
        createdCount++;
      }
      console.log(`✓ Created ${createdCount} demo products`);
    } catch (prodError: unknown) {
      console.log('⚠️  Warning: Failed to create demo products:', typeof prodError === 'object' && prodError !== null && 'message' in prodError ? (prodError as { message: string }).message : String(prodError));
    }

    console.log('');
    console.log('✓ Demo tenant setup complete');
    console.log(`  Access at: /demo/en`);
    console.log(`  Admin login: admin@demo.local / Admindemo123!`);

    return demoTenant;
  } catch (error: unknown) {
    console.error('✗ Error creating demo tenant:', typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string }).message : String(error));
    throw error;
  }
}

// Main function
async function resetCollections() {
  try {
    // Parse arguments
    const args = process.argv.slice(2);
    const cleanAll = args.includes('--all');
    const force = args.includes('--force');
    const keepTenants = args.includes('--keep-tenants');
    const keepUsers = args.includes('--keep-users');
    const shouldCreateDefaultStore = args.includes('--create-default-store');
    const createAdmin = args.includes('--create-admin');
    const shouldCreateDemoTenant = args.includes('--create-demo-tenant');

    const tenantSlug = args.find(arg => arg.startsWith('--tenant='))?.split('=')[1];
    const collectionArg = args.find(arg => arg.startsWith('--collection='))?.split('=')[1];

    let tenantId: string | undefined;
    let collectionsToClean: CollectionName[] = [];

    // Handle tenant-specific cleaning
    if (tenantSlug) {
      const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug } });
      if (!tenant) {
        console.error(`✗ Tenant "${tenantSlug}" not found`);
        process.exit(1);
      }
      tenantId = tenant.id;
      console.log(`Target tenant: ${tenant.name} (${tenant.slug})`);
      console.log('');
    }

    // Determine which tables to clean
    if (cleanAll) {
      collectionsToClean = Object.keys(COLLECTIONS) as CollectionName[];
    } else if (collectionArg) {
      const requested = collectionArg.split(',').map(c => c.trim().toLowerCase());
      collectionsToClean = requested.filter(c => c in COLLECTIONS) as CollectionName[];

      if (collectionsToClean.length === 0) {
        console.error('✗ No valid tables specified');
        console.log('Available tables:', Object.keys(COLLECTIONS).join(', '));
        process.exit(1);
      }
    } else {
      console.error('✗ No action specified. Use --all, --tenant=<slug>, or --collection=<name>');
      console.log('');
      console.log('Usage examples:');
      console.log('  npx tsx scripts/reset-collections.ts --all');
      console.log('  npx tsx scripts/reset-collections.ts --all --create-default-store');
      console.log('  npx tsx scripts/reset-collections.ts --all --create-default-store --create-admin');
      console.log('  npx tsx scripts/reset-collections.ts --all --create-default-store --create-demo-tenant');
      console.log('  npx tsx scripts/reset-collections.ts --tenant=default');
      console.log('  npx tsx scripts/reset-collections.ts --collection=transactions,products');
      process.exit(1);
    }

    // Get current counts
    console.log('Current table row counts:');
    const counts = await getCollectionCounts(tenantId);
    let totalCount = 0;

    for (const collectionName of collectionsToClean) {
      const count = counts[collectionName] || 0;
      if (collectionName === 'tenants' && keepTenants) {
        console.log(`  ${collectionName.padEnd(20)} ${count.toString().padStart(6)} (keeping)`);
      } else if (collectionName === 'users' && keepUsers) {
        console.log(`  ${collectionName.padEnd(20)} ${count.toString().padStart(6)} (keeping)`);
      } else {
        console.log(`  ${collectionName.padEnd(20)} ${count.toString().padStart(6)}`);
        totalCount += count;
      }
    }
    console.log('');

    if (totalCount === 0) {
      console.log('✓ No rows to delete');
      return;
    }

    // Confirmation prompt
    if (!force) {
      const action = tenantSlug
        ? `clean ${totalCount} row(s) for tenant "${tenantSlug}"`
        : `clean ${totalCount} row(s) from ${collectionsToClean.length} table(s)`;

      console.log(`⚠️  WARNING: This will ${action}`);
      console.log('This action cannot be undone!');
      console.log('');

      const answer = await askQuestion('Are you sure you want to continue? (yes/no): ');
      if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        console.log('Operation cancelled');
        return;
      }
      console.log('');
    }

    // Clean tables
    console.log('Cleaning tables...');
    const results = await cleanCollections(collectionsToClean, tenantId, keepTenants, keepUsers);

    // Display results
    console.log('');
    console.log('Results:');
    let totalDeleted = 0;
    let hasErrors = false;

    for (const [collectionName, result] of Object.entries(results)) {
      if (result.error) {
        console.log(`  ✗ ${collectionName.padEnd(20)} Error: ${result.error}`);
        hasErrors = true;
      } else if (result.deleted > 0) {
        console.log(`  ✓ ${collectionName.padEnd(20)} ${result.deleted.toString().padStart(6)} deleted`);
        totalDeleted += result.deleted;
      } else if (collectionName === 'tenants' && keepTenants) {
        console.log(`  - ${collectionName.padEnd(20)} skipped (kept)`);
      } else if (collectionName === 'users' && keepUsers) {
        console.log(`  - ${collectionName.padEnd(20)} skipped (kept)`);
      } else {
        console.log(`  - ${collectionName.padEnd(20)} 0 (already empty)`);
      }
    }

    console.log('');
    console.log(`✓ Total: ${totalDeleted} row(s) deleted`);

    if (hasErrors) {
      console.log('⚠️  Some tables had errors during deletion');
    }

    // Create default store if requested
    if (shouldCreateDefaultStore) {
      try {
        await createDefaultStore(createAdmin);
        console.log('');
        console.log('✓ Default store setup complete');
      } catch (error: unknown) {
        console.log('');
        console.log('⚠️  Warning: Failed to create default store:', typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string }).message : String(error));
      }
    }

    // Create demo tenant if requested
    if (shouldCreateDemoTenant) {
      try {
        await createDemoTenant();
      } catch (error: unknown) {
        console.log('');
        console.log('⚠️  Warning: Failed to create demo tenant:', typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string }).message : String(error));
      }
    }
  } catch (error: unknown) {
    console.error('✗ Error resetting tables:', typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string }).message : String(error));
    process.exit(1);
  }
}

resetCollections()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
