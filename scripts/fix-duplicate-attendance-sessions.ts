/**
 * One-time fix: find and resolve duplicate open attendance sessions
 * (same userId+tenantId with clockOut: null) before the new unique
 * partial index on Attendance ({ userId, tenantId, clockOut: null })
 * is built, since duplicates would otherwise fail the index build.
 *
 * For each duplicate group, keeps the earliest open session and closes
 * the rest at their own clockIn time (zero-duration), tagging notes so
 * they're identifiable in audit/reporting.
 *
 * Usage:
 *   npx tsx scripts/fix-duplicate-attendance-sessions.ts           # dry run, reports only
 *   npx tsx scripts/fix-duplicate-attendance-sessions.ts --apply   # actually fixes
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import connectDB from '../lib/mongodb';
import Attendance from '../models/Attendance';
import mongoose from 'mongoose';

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const duplicates = await Attendance.aggregate([
    { $match: { clockOut: null } },
    {
      $group: {
        _id: { userId: '$userId', tenantId: '$tenantId' },
        count: { $sum: 1 },
        docs: { $push: { _id: '$_id', clockIn: '$clockIn' } },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (duplicates.length === 0) {
    console.log('No duplicate open attendance sessions found. Safe to deploy the unique index.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${duplicates.length} user(s) with duplicate open sessions.`);

  for (const group of duplicates) {
    const docs = [...group.docs].sort(
      (a, b) => new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime()
    );
    const [keep, ...extras] = docs;
    console.log(
      `userId=${group._id.userId} tenantId=${group._id.tenantId}: keeping ${keep._id} (clockIn ${keep.clockIn}), closing ${extras.length} extra session(s): ${extras.map((d) => d._id).join(', ')}`
    );

    if (apply) {
      for (const extra of extras) {
        await Attendance.updateOne(
          { _id: extra._id },
          {
            $set: {
              clockOut: extra.clockIn,
              notes: '[auto-closed: duplicate open session]',
            },
          }
        );
      }
    }
  }

  if (!apply) {
    console.log('\nDry run only — re-run with --apply to close the duplicate sessions.');
  } else {
    console.log('\nDuplicate sessions closed.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
