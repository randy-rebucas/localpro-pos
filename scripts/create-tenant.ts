/**
 * Script to create a new tenant
 * 
 * Usage:
 *   npx tsx scripts/create-tenant.ts <slug> <name> [options]
 *   npx tsx scripts/create-tenant.ts --interactive
 *   npx tsx scripts/create-tenant.ts  (runs in interactive mode automatically)
 * 
 * Options:
 *   --domain <domain>        Custom domain (optional)
 *   --subdomain <subdomain>  Subdomain (optional)
 *   --currency <code>        Currency code (default: USD)
 *   --language <lang>        Language: en or es (default: en)
 *   --email <email>          Contact email (optional)
 *   --phone <phone>          Contact phone (optional)
 *   --company <name>         Company name (optional)
 *   --interactive            Interactive mode (prompts for all fields)
 * 
 * Examples:
 *   npx tsx scripts/create-tenant.ts my-store "My Store"
 *   npx tsx scripts/create-tenant.ts coffee-shop "Coffee Shop" --currency EUR --language es
 *   npx tsx scripts/create-tenant.ts --interactive
 *   npm run tenant:create  (runs in interactive mode)
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
import * as readline from 'readline';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/1pos';

interface TenantInput {
  slug: string;
  name: string;
  domain?: string;
  subdomain?: string;
  currency?: string;
  language?: 'en' | 'es';
  email?: string;
  phone?: string;
  companyName?: string;
}

// Create readline interface for interactive mode
function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

// Prompt for user input
function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

// Validate slug format
function validateSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

// Interactive mode
async function interactiveMode(): Promise<TenantInput> {
  const rl = createReadline();
  const input: TenantInput = { slug: '', name: '' };

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Create New Tenant - Interactive Mode');
  console.log('═══════════════════════════════════════════════════════\n');

  // Required fields
  while (!input.slug || !validateSlug(input.slug)) {
    input.slug = (await question(rl, 'Tenant slug (lowercase, numbers, hyphens only): ')).trim().toLowerCase();
    if (!input.slug) {
      console.log('❌ Slug is required');
    } else if (!validateSlug(input.slug)) {
      console.log('❌ Slug can only contain lowercase letters, numbers, and hyphens');
      input.slug = '';
    }
  }

  while (!input.name) {
    input.name = (await question(rl, 'Tenant name: ')).trim();
    if (!input.name) {
      console.log('❌ Name is required');
    }
  }

  // Optional fields
  const domain = await question(rl, 'Custom domain (optional, press Enter to skip): ');
  if (domain.trim()) input.domain = domain.trim();

  const subdomain = await question(rl, 'Subdomain (optional, press Enter to skip): ');
  if (subdomain.trim()) input.subdomain = subdomain.trim().toLowerCase();

  const currency = await question(rl, 'Currency code (default: USD): ');
  input.currency = currency.trim() || 'USD';

  const language = await question(rl, 'Language (en/es, default: en): ');
  input.language = (language.trim().toLowerCase() === 'es' ? 'es' : 'en') as 'en' | 'es';

  const email = await question(rl, 'Contact email (optional, press Enter to skip): ');
  if (email.trim()) input.email = email.trim();

  const phone = await question(rl, 'Contact phone (optional, press Enter to skip): ');
  if (phone.trim()) input.phone = phone.trim();

  const companyName = await question(rl, 'Company name (optional, press Enter to skip): ');
  if (companyName.trim()) input.companyName = companyName.trim();

  rl.close();
  return input;
}

// Parse command line arguments
function parseArgs(): { input: TenantInput | null; interactive: boolean } {
  const args = process.argv.slice(2);
  
  if (args.includes('--interactive') || args.includes('-i')) {
    return { input: null, interactive: true };
  }

  if (args.length < 2) {
    return { input: null, interactive: false };
  }

  const input: TenantInput = {
    slug: args[0].toLowerCase(),
    name: args[1],
  };

  // Parse options
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--domain':
      case '-d':
        if (nextArg) input.domain = nextArg;
        i++;
        break;
      case '--subdomain':
      case '-s':
        if (nextArg) input.subdomain = nextArg.toLowerCase();
        i++;
        break;
      case '--currency':
      case '-c':
        if (nextArg) input.currency = nextArg.toUpperCase();
        i++;
        break;
      case '--language':
      case '-l':
        if (nextArg) input.language = (nextArg.toLowerCase() === 'es' ? 'es' : 'en') as 'en' | 'es';
        i++;
        break;
      case '--email':
      case '-e':
        if (nextArg) input.email = nextArg;
        i++;
        break;
      case '--phone':
      case '-p':
        if (nextArg) input.phone = nextArg;
        i++;
        break;
      case '--company':
      case '--company-name':
        if (nextArg) input.companyName = nextArg;
        i++;
        break;
    }
  }

  return { input, interactive: false };
}

// Create tenant
async function createTenant(input: TenantInput) {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Check if tenant already exists
    const existing = await Tenant.findOne({ 
      $or: [
        { slug: input.slug },
        ...(input.domain ? [{ domain: input.domain }] : []),
        ...(input.subdomain ? [{ subdomain: input.subdomain }] : []),
      ]
    });

    if (existing) {
      console.log('❌ Tenant already exists with:');
      if (existing.slug === input.slug) console.log(`   - Slug: ${existing.slug}`);
      if (existing.domain === input.domain) console.log(`   - Domain: ${existing.domain}`);
      if (existing.subdomain === input.subdomain) console.log(`   - Subdomain: ${existing.subdomain}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    // Validate slug
    if (!validateSlug(input.slug)) {
      console.log('❌ Invalid slug format. Slug can only contain lowercase letters, numbers, and hyphens');
      await mongoose.disconnect();
      process.exit(1);
    }

    // Get default settings and customize
    const defaultSettings = getDefaultTenantSettings();
    const settings = {
      ...defaultSettings,
      currency: input.currency || defaultSettings.currency,
      language: input.language || defaultSettings.language,
      ...(input.email && { email: input.email }),
      ...(input.phone && { phone: input.phone }),
      ...(input.companyName && { companyName: input.companyName }),
    };

    // Create tenant
    const tenantData: Record<string, unknown> = {
      slug: input.slug,
      name: input.name,
      settings,
      isActive: true,
    };

    if (input.domain) tenantData.domain = input.domain;
    if (input.subdomain) tenantData.subdomain = input.subdomain;

    const tenant = await Tenant.create(tenantData);

    // Automatically create admin user for the tenant
    const adminEmail = `admin@${tenant.slug}.local`;
    const adminPassword = `Admin${tenant.slug}123!`;
    let adminUser = null;
    
    try {
      adminUser = await User.create({
        email: adminEmail,
        password: adminPassword,
        name: 'Administrator',
        role: 'admin',
        tenantId: tenant._id,
        isActive: true,
      });
    } catch (userError: unknown) {
      const errorMessage = userError instanceof Error ? userError.message : 'Unknown error';
      console.log('\n⚠️  Warning: Failed to create admin user:', errorMessage);
    }

    console.log('\n✅ Tenant created successfully!\n');
    console.log('Tenant Details:');
    console.log('─────────────────────────────────────────────────');
    console.log(`  Slug:        ${tenant.slug}`);
    console.log(`  Name:        ${tenant.name}`);
    if (tenant.domain) console.log(`  Domain:      ${tenant.domain}`);
    if (tenant.subdomain) console.log(`  Subdomain:   ${tenant.subdomain}`);
    console.log(`  Currency:    ${tenant.settings.currency}`);
    console.log(`  Language:    ${tenant.settings.language}`);
    if (tenant.settings.email) console.log(`  Email:       ${tenant.settings.email}`);
    if (tenant.settings.phone) console.log(`  Phone:       ${tenant.settings.phone}`);
    console.log(`  Active:      ${tenant.isActive ? 'Yes' : 'No'}`);
    console.log(`  Created:     ${tenant.createdAt}`);
    console.log('─────────────────────────────────────────────────\n');
    
    if (adminUser) {
      console.log('✅ Admin User Created:');
      console.log('─────────────────────────────────────────────────');
      console.log(`  Email:       ${adminEmail}`);
      console.log(`  Password:    ${adminPassword}`);
      console.log(`  Role:        admin`);
      console.log('─────────────────────────────────────────────────\n');
      console.log('⚠️  IMPORTANT: Please change the admin password after first login!\n');
    }
    
    console.log('Next steps:');
    console.log(`  1. Access your tenant at: http://localhost:3000/${tenant.slug}/${tenant.settings.language}`);
    if (adminUser) {
      console.log(`  2. Login with admin credentials above`);
    } else {
      console.log(`  2. Create an admin user: npx tsx scripts/create-admin-user.ts ${tenant.slug} <email> <password> "<name>"`);
    }
    console.log(`  3. Configure settings at: http://localhost:3000/${tenant.slug}/${tenant.settings.language}/settings\n`);

    await mongoose.disconnect();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('\n❌ Error creating tenant:', errorMessage);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      console.error(`   Duplicate ${field}: ${error.keyValue[field]}`);
    }
    
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Main function
async function main() {
  const { input, interactive } = parseArgs();

  if (interactive || !input) {
    // If interactive flag is set or no input provided, enter interactive mode
    const tenantInput = await interactiveMode();
    await createTenant(tenantInput);
  } else {
    await createTenant(input);
  }
}

main();

