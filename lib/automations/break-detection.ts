/**
 * Automatic Break Time Detection
 * Auto-detect and log breaks based on inactivity
 */

import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
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
    let tenants;
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId).lean();
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await Tenant.find({ status: 'active' }).lean();
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalBreaksDetected = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();

        // Find active attendance sessions
        const activeSessions = await Attendance.find({
          tenantId,
          clockOut: null,
        }).lean();

        for (const session of activeSessions) {
          try {
            const clockInTime = new Date(session.clockIn);
            
            // Get last transaction for this user during this session
            const lastTransaction = await Transaction.findOne({
              tenantId,
              userId: session.userId,
              createdAt: { $gte: clockInTime },
            })
              .sort({ createdAt: -1 })
              .lean();

            if (!lastTransaction) {
              // No transactions yet, can't detect break
              continue;
            }

            const lastActivityTime = new Date(lastTransaction.createdAt);
            const minutesSinceActivity = (now.getTime() - lastActivityTime.getTime()) / (1000 * 60);

            // If no activity for X minutes and no break started, start break
            if (minutesSinceActivity >= inactivityMinutes && !session.breakStart) {
              await Attendance.findByIdAndUpdate(session._id, {
                breakStart: lastActivityTime, // Use last activity time as break start
              });
              totalBreaksDetected++;
            }
            // If break started and activity resumed, end break
            else if (session.breakStart && minutesSinceActivity < inactivityMinutes && !session.breakEnd) {
              await Attendance.findByIdAndUpdate(session._id, {
                breakEnd: now,
              });
              totalBreaksDetected++;
            }
          } catch (error: unknown) {
            totalFailed++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.errors?.push(`Session ${session._id}: ${errorMessage}`);
          }
        }
      } catch (error: unknown) {
        totalFailed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors?.push(`Tenant ${tenant.name}: ${errorMessage}`);
      }
    }

    results.processed = totalBreaksDetected;
    results.failed = totalFailed;
    results.message = `Detected ${totalBreaksDetected} break periods${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: unknown) {
    results.success = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    results.message = `Error detecting breaks: ${errorMessage}`;
    results.errors?.push(errorMessage);
    return results;
  }
}
