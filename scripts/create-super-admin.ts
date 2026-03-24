/**
 * Script to create a super-admin user.
 * Super-admin users are not tied to any tenant and can manage all tenants.
 *
 * Usage:
 *   npx tsx scripts/create-super-admin.ts --email admin@example.com --password Admin1234!
 *   npx tsx scripts/create-super-admin.ts --email admin@example.com --password Admin1234! --name "Super Admin"
 *
 * Login URL: http://localhost:3000/super-admin/login
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import User from '../models/User';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pos-system';

function parseArgs(): { email: string; password: string; name: string } {
  const args = process.argv.slice(2);
  const result = { email: '', password: '', name: 'Super Admin' };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--email':
        result.email = args[++i] || '';
        break;
      case '--password':
        result.password = args[++i] || '';
        break;
      case '--name':
        result.name = args[++i] || 'Super Admin';
        break;
    }
  }

  return result;
}

async function main() {
  const { email, password, name } = parseArgs();

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-super-admin.ts --email <email> --password <password> [--name <name>]');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  Create Super Admin');
  console.log('═══════════════════════════════════════\n');

  await mongoose.connect(MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  // Check if super_admin with this email already exists
  const existing = await User.findOne({ email: email.toLowerCase(), role: 'super_admin' });
  if (existing) {
    console.error(`\n❌ A super_admin with email "${email}" already exists.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Create the super_admin user (no tenantId)
  const user = new User({
    email: email.toLowerCase(),
    password,
    name,
    role: 'super_admin',
    isActive: true,
  });

  await user.save();

  console.log(`✓ Super admin created`);
  console.log(`  Email : ${email.toLowerCase()}`);
  console.log(`  Name  : ${name}`);
  console.log(`  Role  : super_admin`);
  console.log(`\n  Login URL: http://localhost:3000/super-admin/login\n`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
