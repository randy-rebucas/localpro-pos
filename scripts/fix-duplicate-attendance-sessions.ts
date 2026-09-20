/**
 * One-time fix: find and resolve duplicate open attendance sessions
 * (same userId+tenantId with clockOut: null) before the partial unique
 * index on Attendance (tenantId, userId WHERE clockOut IS NULL — see
 * prisma/schema.prisma's Attendance model comment) is built, since
 * duplicates would otherwise fail the index build.
 *
 * For each duplicate group, keeps the earliest open session and closes
 * the rest at their own clockIn time (zero-duration), tagging notes so
 * they're identifiable in audit/reporting.
 *
 * Usage:
 *   npx tsx scripts/fix-duplicate-attendance-sessions.ts           # dry run, reports only
 *   npx tsx scripts/fix-duplicate-attendance-sessions.ts --apply   # actually fixes
 */

import '../lib/script-runtime';

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import prisma from '../lib/db';

async function main() {
  const apply = process.argv.includes('--apply');

  const openSessions = await prisma.attendance.findMany({
    where: { clockOut: null },
    select: { id: true, userId: true, tenantId: true, clockIn: true },
    orderBy: { clockIn: 'asc' },
  });

  const groups = new Map<string, typeof openSessions>();
  for (const session of openSessions) {
    const key = `${session.userId}::${session.tenantId}`;
    const arr = groups.get(key) ?? [];
    arr.push(session);
    groups.set(key, arr);
  }

  const duplicates = [...groups.entries()].filter(([, docs]) => docs.length > 1);

  if (duplicates.length === 0) {
    console.log('No duplicate open attendance sessions found. Safe to deploy the unique index.');
    return;
  }

  console.log(`Found ${duplicates.length} user(s) with duplicate open sessions.`);

  for (const [key, docs] of duplicates) {
    const [userId, tenantId] = key.split('::');
    const sorted = [...docs].sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());
    const [keep, ...extras] = sorted;
    console.log(
      `userId=${userId} tenantId=${tenantId}: keeping ${keep.id} (clockIn ${keep.clockIn.toISOString()}), closing ${extras.length} extra session(s): ${extras.map((d) => d.id).join(', ')}`
    );

    if (apply) {
      for (const extra of extras) {
        await prisma.attendance.update({
          where: { id: extra.id },
          data: {
            clockOut: extra.clockIn,
            notes: '[auto-closed: duplicate open session]',
          },
        });
      }
    }
  }

  if (!apply) {
    console.log('\nDry run only — re-run with --apply to close the duplicate sessions.');
  } else {
    console.log('\nDuplicate sessions closed.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
