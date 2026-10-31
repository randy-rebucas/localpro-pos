/**
 * Automatic Break Time Detection
 * Auto-detect and log breaks based on inactivity
 */

import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import Transaction from '@/models/Transaction';
import { getAutomationTenants } from './tenants';
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

    // Get tenants to process
    const tenants = await getAutomationTenants({ tenantId: options.tenantId, select: 'name' });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalBreaksDetected = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id;

        // Find active attendance sessions. Sessions whose break already ended
        // can't change state, so skip them in the query.
        const activeSessions = await Attendance.find({
          tenantId,
          clockOut: null,
          breakEnd: null,
        })
          .select('userId clockIn breakStart')
          .lean();

        if (activeSessions.length === 0) continue;

        // Last transaction per user since the earliest clock-in, in one aggregate
        // (served by the { tenantId, userId, createdAt } index)
        const minClockIn = new Date(Math.min(...activeSessions.map(s => new Date(s.clockIn).getTime())));
        const lastActivity = await Transaction.aggregate<{ _id: unknown; lastAt: Date }>([
          {
            $match: {
              tenantId,
              userId: { $in: [...new Set(activeSessions.map(s => s.userId))] },
              createdAt: { $gte: minClockIn },
            },
          },
          { $group: { _id: '$userId', lastAt: { $max: '$createdAt' } } },
        ]);
        const lastActivityByUser = new Map(lastActivity.map(a => [String(a._id), new Date(a.lastAt)]));

        const updates: { _id: unknown; set: Record<string, Date> }[] = [];

        for (const session of activeSessions) {
          try {
            const clockInTime = new Date(session.clockIn);

            // Get last transaction for this user during this session
            const lastActivityTime = lastActivityByUser.get(String(session.userId));
            if (!lastActivityTime || lastActivityTime < clockInTime) {
              // No transactions yet, can't detect break
              continue;
            }

            const minutesSinceActivity = (now.getTime() - lastActivityTime.getTime()) / (1000 * 60);

            // If no activity for X minutes and no break started, start break
            if (minutesSinceActivity >= inactivityMinutes && !session.breakStart) {
              updates.push({ _id: session._id, set: { breakStart: lastActivityTime } }); // Use last activity time as break start
            }
            // If break started and activity resumed, end break
            else if (session.breakStart && minutesSinceActivity < inactivityMinutes) {
              updates.push({ _id: session._id, set: { breakEnd: now } });
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Session ${session._id}: ${error.message}`);
          }
        }

        if (updates.length === 0) continue;

        const writeResult = await Attendance.bulkWrite(
          updates.map(({ _id, set }) => ({
            updateOne: {
              filter: { tenantId, _id, clockOut: null },
              update: { $set: set },
            },
          })),
          { ordered: false }
        );
        totalBreaksDetected += writeResult.modifiedCount;
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
