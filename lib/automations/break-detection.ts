/**
 * Automatic Break Time Detection
 * Auto-detect and log breaks based on inactivity
 */

import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import { getRepos, type AttendanceRepo } from '@/lib/db';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { AutomationResult } from './types';

export interface BreakDetectionOptions {
  tenantId?: string;
  inactivityMinutes?: number; // Minutes of inactivity to detect as break (default: 30)
}

/**
 * Automatically detect and log breaks based on transaction inactivity
 */
export async function detectBreaks(
  options: BreakDetectionOptions = {}
): Promise<AutomationResult> {
  await connectDB();

  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const inactivityMinutes = options.inactivityMinutes || 30;
    const now = new Date();

    // Get tenants to process (no tenant settings are needed here)
    let tenants: ActiveTenant[];
    if (options.tenantId) {
      const tenant = (await getRepos().tenants.findById(options.tenantId, { select: '_id slug name' })) as ActiveTenant | null;
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await getActiveTenants();
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalBreaksDetected = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantObjectId = new mongoose.Types.ObjectId(String(tenant._id));

        // Find active attendance sessions
        const tenantId = String(tenant._id);
        const { attendance } = getRepos();
        const activeSessions = await attendance.list(
          tenantId,
          { open: true },
          { select: 'userId clockIn breakStart breakEnd' }
        );

        if (activeSessions.length === 0) continue;

        // Last transaction per user since the earliest open clock-in — one
        // aggregate instead of one findOne per open session. Uses the
        // { tenantId, userId, createdAt } index.
        const earliestClockIn = activeSessions.reduce(
          (min, s) => (new Date(s.clockIn) < min ? new Date(s.clockIn) : min),
          new Date(activeSessions[0].clockIn)
        );
        const lastTxRows = await Transaction.aggregate<{ _id: mongoose.Types.ObjectId; last: Date }>([
          {
            $match: {
              tenantId: tenantObjectId,
              userId: { $in: [...new Set(activeSessions.map((s) => String(s.userId)))].map((id) => new mongoose.Types.ObjectId(id)) },
              createdAt: { $gte: earliestClockIn },
            },
          },
          { $group: { _id: '$userId', last: { $max: '$createdAt' } } },
        ]);
        const lastTxByUser = new Map(lastTxRows.map((r) => [r._id.toString(), new Date(r.last)]));

        const updates: Parameters<AttendanceRepo['updateEach']>[1] = [];

        for (const session of activeSessions) {
          try {
            const clockInTime = new Date(session.clockIn);

            // Last transaction for this user during this session
            const lastActivityTime = lastTxByUser.get(String(session.userId));
            if (!lastActivityTime || lastActivityTime < clockInTime) {
              // No transactions yet, can't detect break
              continue;
            }

            const minutesSinceActivity = (now.getTime() - lastActivityTime.getTime()) / (1000 * 60);

            // If no activity for X minutes and no break started, start break
            if (minutesSinceActivity >= inactivityMinutes && !session.breakStart) {
              updates.push({ id: session._id, set: { breakStart: lastActivityTime } }); // Use last activity time as break start
            }
            // If break started and activity resumed, end break
            else if (session.breakStart && minutesSinceActivity < inactivityMinutes && !session.breakEnd) {
              updates.push({ id: session._id, set: { breakEnd: now } });
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Session ${session._id}: ${error.message}`);
          }
        }

        if (updates.length > 0) {
          await attendance.updateEach(tenantId, updates);
          totalBreaksDetected += updates.length;
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalBreaksDetected;
    results.failed = totalFailed;
    results.message = `Detected ${totalBreaksDetected} break periods${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error detecting breaks: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
