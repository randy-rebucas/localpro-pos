/**
 * Script to reset/clean database collections
 * Usage: 
 *   npx tsx scripts/reset-collections.ts [options]
 * 
 * Options:
 *   --all                    Clean all collections
 *   --tenant=<slug>          Clean collections for specific tenant
 *   --collection=<name>      Clean specific collection(s), comma-separated
 *   --keep-tenants           Keep tenant collection when using --all
 *   --keep-users             Keep user collection when using --all
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
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import readline from 'readline';

// Load .env.local file (Next.js convention)
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
// Also try .env as fallback
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';

// Import all models
import Attendance from '../models/Attendance';
import AuditLog from '../models/AuditLog';
import Booking from '../models/Booking';
import Branch from '../models/Branch';
import CashDrawerSession from '../models/CashDrawerSession';
import Category from '../models/Category';
import Discount from '../models/Discount';
import Expense from '../models/Expense';
import Product from '../models/Product';
import ProductBundle from '../models/ProductBundle';
import SavedCart from '../models/SavedCart';
import StockMovement from '../models/StockMovement';
import Tenant from '../models/Tenant';
import Transaction from '../models/Transaction';
import User from '../models/User';
import { getDefaultTenantSettings } from '../lib/currency';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/1pos';

// Collection mapping (Mongoose automatically pluralizes and lowercases model names)
const COLLECTIONS = {
  attendances: Attendance,
  auditlogs: AuditLog,
  bookings: Booking,
  branches: Branch,
  cashdrawersessions: CashDrawerSession,
  categories: Category,
  discounts: Discount,
  expenses: Expense,
  products: Product,
  productbundles: ProductBundle,
  savedcarts: SavedCart,
  stockmovements: StockMovement,
  tenants: Tenant,
  transactions: Transaction,
  users: User,
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

// Get collection counts
async function getCollectionCounts(tenantId?: mongoose.Types.ObjectId) {
  const counts: Record<string, number> = {};
  
  for (const [name, model] of Object.entries(COLLECTIONS)) {
    try {
      const mongooseModel = model as any;
      if (tenantId && 'tenantId' in model.schema.paths) {
        counts[name] = await mongooseModel.countDocuments({ tenantId });
      } else {
        counts[name] = await mongooseModel.countDocuments();
      }
    } catch (error) {
      counts[name] = 0;
    }
  }
  
  return counts;
}

// Clean collections
async function cleanCollections(
  collections: CollectionName[],
  tenantId?: mongoose.Types.ObjectId,
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
    
    const model = COLLECTIONS[collectionName];
    const mongooseModel = model as any;
    
    try {
      let deleteResult;
      if (tenantId && 'tenantId' in model.schema.paths) {
        deleteResult = await mongooseModel.deleteMany({ tenantId });
      } else {
        deleteResult = await mongooseModel.deleteMany({});
      }
      results[collectionName] = { deleted: deleteResult.deletedCount || 0 };
    } catch (error: any) {
      results[collectionName] = { 
        deleted: 0, 
        error: error.message 
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
    const existing = await Tenant.findOne({ slug: 'default' });
    if (existing) {
      console.log('⚠️  Default tenant already exists');
      if (createAdmin) {
        // Check if admin user exists
        const adminExists = await User.findOne({ 
          email: 'admin@default.local',
          tenantId: existing._id 
        });
        if (!adminExists) {
          console.log('Creating admin user for default store...');
          const adminUser = await User.create({
            email: 'admin@default.local',
            password: 'Admindefault123!',
            name: 'Administrator',
            role: 'admin',
            tenantId: existing._id,
            isActive: true,
          });
          console.log('✓ Admin user created for default store');
          console.log(`  Email:    ${adminUser.email}`);
          console.log(`  Password: Admindefault123!`);
          console.log(`  Role:     admin`);
          console.log(`  Tenant:   ${existing.name} (${existing.slug})`);
          console.log(`  Tenant ID: ${existing._id}`);
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
    const settings = {
      ...defaultSettings,
      currency: defaultSettings.currency || 'USD',
      language: (defaultSettings.language || 'en') as 'en' | 'es',
      companyName: 'Default Store',
      email: 'admin@default.local',
      phone: '+1-555-0000',
    };

    // Create tenant first (following tenant signup route hierarchy)
    const tenantData: any = {
      slug: 'default',
      name: 'Default Store',
      settings,
      isActive: true,
    };

    const tenant = await Tenant.create(tenantData);

    console.log('✓ Default store created');
    console.log(`  Name: ${tenant.name}`);
    console.log(`  Slug: ${tenant.slug}`);
    console.log(`  Tenant ID: ${tenant._id}`);

    // Create admin user for the tenant (after tenant is created)
    if (createAdmin) {
      try {
        const adminEmail = 'admin@default.local';
        const adminPassword = 'Admindefault123!';
        const adminName = 'Administrator';
        
        console.log('');
        console.log('Creating admin user for default store...');
        const adminUser = await User.create({
          email: adminEmail.toLowerCase(),
          password: adminPassword,
          name: adminName,
          role: 'admin',
          tenantId: tenant._id,
          isActive: true,
        });
        
        console.log('');
        console.log('✓ Admin user created for default store');
        console.log(`  Email:    ${adminUser.email}`);
        console.log(`  Password: Admindefault123!`);
        console.log(`  Role:     admin`);
        console.log(`  Tenant:   ${tenant.name} (${tenant.slug})`);
        console.log(`  Tenant ID: ${tenant._id}`);
        console.log('');
        console.log('⚠️  IMPORTANT: Please change the admin password after first login!');
      } catch (userError: any) {
        console.log('');
        console.log('⚠️  Warning: Failed to create admin user:', userError.message);
        console.log(`  Tenant: ${tenant.name} (${tenant.slug})`);
      }
    }

    return tenant;
  } catch (error: any) {
    console.error('✗ Error creating default store:', error.message);
    throw error;
  }
}

// Create demo tenant with sample data
async function createDemoTenant() {
  try {
    console.log('');
    console.log('Creating demo tenant...');
    
    // Check if demo tenant already exists
    const existing = await Tenant.findOne({ slug: 'demo' });
    if (existing) {
      console.log('⚠️  Demo tenant already exists');
      console.log(`  Name: ${existing.name}`);
      console.log(`  Slug: ${existing.slug}`);
      return existing;
    }

    // Create demo tenant with settings
    const defaultSettings = getDefaultTenantSettings();
    const demoTenant = await Tenant.create({
      slug: 'demo',
      name: 'Demo Store',
      settings: {
        ...defaultSettings,
        companyName: 'Demo Store',
        email: 'demo@store.local',
        phone: '+1-555-0123',
        address: {
          street: '123 Demo Street',
          city: 'Demo City',
          state: 'DC',
          zipCode: '12345',
          country: 'USA',
        },
      },
      isActive: true,
    });

    console.log('✓ Demo tenant created');
    console.log(`  Name: ${demoTenant.name}`);
    console.log(`  Slug: ${demoTenant.slug}`);
    console.log(`  Tenant ID: ${demoTenant._id}`);

    // Create demo admin user
    try {
      console.log('');
      console.log('Creating demo admin user...');
      const demoAdmin = await User.create({
        email: 'admin@demo.local',
        password: 'Admindemo123!',
        name: 'Demo Administrator',
        role: 'admin',
        tenantId: demoTenant._id,
        isActive: true,
      });
      
      console.log('✓ Demo admin user created');
      console.log(`  Email:    ${demoAdmin.email}`);
      console.log(`  Password: Admindemo123!`);
      console.log(`  Role:     admin`);
      console.log(`  Tenant:   ${demoTenant.name} (${demoTenant.slug})`);
      console.log('');
      console.log('⚠️  IMPORTANT: Please change the admin password after first login!');
    } catch (userError: any) {
      console.log('');
      console.log('⚠️  Warning: Failed to create demo admin user:', userError.message);
    }

    // Create demo categories
    try {
      console.log('');
      console.log('Creating demo categories...');
      const categories = [
        { name: 'Electronics', description: 'Electronic products' },
        { name: 'Clothing', description: 'Apparel and accessories' },
        { name: 'Food & Beverages', description: 'Food and drink items' },
        { name: 'Books', description: 'Books and publications' },
      ];

      const createdCategories = [];
      for (const cat of categories) {
        const category = await Category.create({
          name: cat.name,
          description: cat.description,
          tenantId: demoTenant._id,
          isActive: true,
        });
        createdCategories.push(category);
      }
      console.log(`✓ Created ${createdCategories.length} demo categories`);
    } catch (catError: any) {
      console.log('⚠️  Warning: Failed to create demo categories:', catError.message);
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
      const categories = await Category.find({ tenantId: demoTenant._id });
      const categoryMap = new Map(categories.map(cat => [cat.name, cat._id]));

      const createdProducts = [];
      for (const prod of products) {
        const categoryId = categoryMap.get(prod.category);
        const product = await Product.create({
          name: prod.name,
          price: prod.price,
          stock: prod.stock,
          sku: prod.sku,
          category: prod.category,
          categoryId: categoryId,
          tenantId: demoTenant._id,
          productType: 'regular',
          hasVariations: false,
          trackInventory: true,
        });
        createdProducts.push(product);
      }
      console.log(`✓ Created ${createdProducts.length} demo products`);
    } catch (prodError: any) {
      console.log('⚠️  Warning: Failed to create demo products:', prodError.message);
    }

    console.log('');
    console.log('✓ Demo tenant setup complete');
    console.log(`  Access at: /demo/en`);
    console.log(`  Admin login: admin@demo.local / Admindemo123!`);

    return demoTenant;
  } catch (error: any) {
    console.error('✗ Error creating demo tenant:', error.message);
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
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB');
    console.log('');
    
    let tenantId: mongoose.Types.ObjectId | undefined;
    let collectionsToClean: CollectionName[] = [];
    
    // Handle tenant-specific cleaning
    if (tenantSlug) {
      const tenant = await Tenant.findOne({ slug: tenantSlug });
      if (!tenant) {
        console.error(`✗ Tenant "${tenantSlug}" not found`);
        await mongoose.disconnect();
        process.exit(1);
      }
      tenantId = tenant._id;
      console.log(`Target tenant: ${tenant.name} (${tenant.slug})`);
      console.log('');
    }
    
    // Determine which collections to clean
    if (cleanAll) {
      collectionsToClean = Object.keys(COLLECTIONS) as CollectionName[];
    } else if (collectionArg) {
      const requested = collectionArg.split(',').map(c => c.trim().toLowerCase());
      collectionsToClean = requested.filter(c => c in COLLECTIONS) as CollectionName[];
      
      if (collectionsToClean.length === 0) {
        console.error('✗ No valid collections specified');
        console.log('Available collections:', Object.keys(COLLECTIONS).join(', '));
        await mongoose.disconnect();
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
      await mongoose.disconnect();
      process.exit(1);
    }
    
    // Get current counts
    console.log('Current collection counts:');
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
      console.log('✓ No documents to delete');
      await mongoose.disconnect();
      return;
    }
    
    // Confirmation prompt
    if (!force) {
      const action = tenantSlug 
        ? `clean ${totalCount} document(s) for tenant "${tenantSlug}"`
        : `clean ${totalCount} document(s) from ${collectionsToClean.length} collection(s)`;
      
      console.log(`⚠️  WARNING: This will ${action}`);
      console.log('This action cannot be undone!');
      console.log('');
      
      const answer = await askQuestion('Are you sure you want to continue? (yes/no): ');
      if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        console.log('Operation cancelled');
        await mongoose.disconnect();
        return;
      }
      console.log('');
    }
    
    // Clean collections
    console.log('Cleaning collections...');
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
    console.log(`✓ Total: ${totalDeleted} document(s) deleted`);
    
    if (hasErrors) {
      console.log('⚠️  Some collections had errors during deletion');
    }
    
    // Create default store if requested
    if (shouldCreateDefaultStore) {
      try {
        await createDefaultStore(createAdmin);
        console.log('');
        console.log('✓ Default store setup complete');
      } catch (error: any) {
        console.log('');
        console.log('⚠️  Warning: Failed to create default store:', error.message);
      }
    }

    // Create demo tenant if requested
    if (shouldCreateDemoTenant) {
      try {
        await createDemoTenant();
      } catch (error: any) {
        console.log('');
        console.log('⚠️  Warning: Failed to create demo tenant:', error.message);
      }
    }
    
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
  } catch (error: any) {
    console.error('✗ Error resetting collections:', error.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

resetCollections();
