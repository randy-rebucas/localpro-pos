/**
 * Links bookings to the user accounts that made them, so "my bookings" keeps
 * showing older ones now that it reads Booking.bookedByUserId instead of email.
 *
 * A booking is only linked to an account that already existed when it was made,
 * so someone registering later with a customer's email can't claim it.
 *
 * Usage:
 *   pnpm db:backfill-booking-accounts            # dry run: prints what would change
 *   pnpm db:backfill-booking-accounts --apply
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.local file (Next.js convention)
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
// Also try .env as fallback
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import Booking from '../models/Booking';
import User from '../models/User';

const apply = process.argv.includes('--apply');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri);
  console.log(`Host: ${mongoose.connection.host}  Database: ${mongoose.connection.name}`);
  console.log(apply ? 'Applying changes' : 'Dry run: nothing will change');

  let linked = 0;
  const users = User.find({ tenantId: { $exists: true } }).select('tenantId email createdAt').lean().cursor();
  for await (const user of users) {
    const filter = {
      tenantId: user.tenantId,
      customerEmail: user.email,
      bookedByUserId: { $exists: false },
      createdAt: { $gte: user.createdAt },
    };
    if (apply) {
      linked += (await Booking.updateMany(filter, { $set: { bookedByUserId: user._id } })).modifiedCount;
    } else {
      linked += await Booking.countDocuments(filter);
    }
  }

  console.log(`${apply ? 'Linked' : 'Would link'} ${linked} booking(s)`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exit(1);
});
