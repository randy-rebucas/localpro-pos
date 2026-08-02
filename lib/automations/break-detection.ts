/**
 * Automatic Break Time Detection
 * Auto-detect and log breaks based on inactivity
 */

import prisma from '@/lib/prisma';
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
      const tenant = await prisma.tenant.findUnique({ where: { id: options.tenantId } });
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalBreaksDetected = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant.id;

        // Find active attendance sessions
        const activeSessions = await prisma.attendance.findMany({
          where: {
            tenantId,
            clockOut: null,
          },
        });

        for (const session of activeSessions) {
          try {
            const clockInTime = new Date(session.clockIn);

            // Get last transaction for this user during this session
            const lastTransaction = await prisma.transaction.findFirst({
              where: {
                tenantId,
                userId: session.userId,
                createdAt: { gte: clockInTime },
              },
              orderBy: { createdAt: 'desc' },
            });

            if (!lastTransaction) {
              // No transactions yet, can't detect break
              continue;
            }

            const lastActivityTime = new Date(lastTransaction.createdAt);
            const minutesSinceActivity = (now.getTime() - lastActivityTime.getTime()) / (1000 * 60);

            // If no activity for X minutes and no break started, start break
            if (minutesSinceActivity >= inactivityMinutes && !session.breakStart) {
              await prisma.attendance.update({
                where: { id: session.id },
                data: { breakStart: lastActivityTime }, // Use last activity time as break start
              });
              totalBreaksDetected++;
            }
            // If break started and activity resumed, end break
            else if (session.breakStart && minutesSinceActivity < inactivityMinutes && !session.breakEnd) {
              await prisma.attendance.update({
                where: { id: session.id },
                data: { breakEnd: now },
              });
              totalBreaksDetected++;
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Session ${session.id}: ${error.message}`);
          }
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
