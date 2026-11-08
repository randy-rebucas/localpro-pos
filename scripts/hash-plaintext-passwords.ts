#!/usr/bin/env tsx
/**
 * Finds user passwords stored as plain text and hashes them in place.
 *
 * Before 2026-11-08, an admin password reset on /admin/users went through
 * findOneAndUpdate, which skips the pre('save') hash hook. Those passwords sit
 * in the database as typed, and login (bcrypt.compare) rejects them. Hashing
 * them restores the password the admin set and removes the readable copy.
 *
 * Usage:
 *   npx tsx scripts/hash-plaintext-passwords.ts           # dry run: count + who
 *   npx tsx scripts/hash-plaintext-passwords.ts --apply   # hash them
 *
 * Never prints a password.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pos-system';
const APPLY = process.argv.includes('--apply');
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$/;

async function main() {
  await mongoose.connect(MONGODB_URI);
  // Raw collection: no model hooks, and password (select:false) is readable.
  const users = mongoose.connection.collection('users');

  const plain = await users
    .find({ password: { $type: 'string', $not: BCRYPT_HASH } }, { projection: { email: 1, tenantId: 1, role: 1, password: 1 } })
    .toArray();

  console.log(`${plain.length} user(s) with a plain-text password${APPLY ? '' : ' (dry run)'}`);
  for (const user of plain) {
    console.log(`  ${user._id}  ${user.email}  role=${user.role}  tenant=${user.tenantId ?? '-'}`);
  }

  if (APPLY) {
    let fixed = 0;
    for (const user of plain) {
      const hash = await bcrypt.hash(String(user.password), await bcrypt.genSalt(10));
      // Only if it is still the same plain value (not changed meanwhile).
      const result = await users.updateOne({ _id: user._id, password: user.password }, { $set: { password: hash } });
      fixed += result.modifiedCount;
    }
    console.log(`Hashed ${fixed} password(s).`);
  } else if (plain.length) {
    console.log('Run again with --apply to hash them.');
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
