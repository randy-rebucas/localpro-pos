/**
 * Automatic Session Expiration
 * Enhanced session management with activity tracking, plus cleanup of
 * expired customer-display PosSession records (replaces the Mongo TTL index
 * — see the `expiresAt` comment on the PosSession model in schema.prisma).
 */

import prisma from '@/lib/db';
import { AutomationResult } from './types';

export interface SessionExpirationOptions {
  tenantId?: string;
  inactivityHours?: number; // Hours of inactivity before expiration (default: 24)
}

/**
 * Check for expired sessions based on inactivity, and purge expired
 * PosSession (customer-display cart) records.
 * Note: The user-inactivity portion is a simplified implementation using
 * audit logs. In production, you might want a dedicated session tracking
 * system. JWT tokens can't be invalidated server-side without a blacklist
 * (see lib/token-blacklist.ts).
 */
export async function expireInactiveSessions(
  options: SessionExpirationOptions = {}
): Promise<AutomationResult> {
  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const inactivityHours = options.inactivityHours || 24;
    const cutoffTime = new Date(Date.now() - inactivityHours * 60 * 60 * 1000);

    // Purge expired PosSession (customer-display kiosk cart) records.
    // These are keyed by the tenant *slug*, not tenantId, so this cleanup
    // is not tenant-scoped the way the rest of this file is — it simply
    // deletes any globally-expired session row.
    let purgedSessions = 0;
    try {
      const purged = await prisma.posSession.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      purgedSessions = purged.count;
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      results.errors?.push(`PosSession cleanup: ${error.message}`);
    }

    // Get tenants to process
    let tenants;
    if (options.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: options.tenantId } });
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    }

    if (tenants.length === 0) {
      results.processed = purgedSessions;
      results.message = `No tenants found to process. Purged ${purgedSessions} expired PosSession record(s).`;
      return results;
    }

    let totalExpired = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant.id;

        // Get all active users
        const users = await prisma.user.findMany({ where: { tenantId, isActive: true } });

        for (const user of users) {
          try {
            // Get last activity from audit logs
            const lastActivity = await prisma.auditLog.findFirst({
              where: { tenantId, userId: user.id },
              orderBy: { createdAt: 'desc' },
            });

            if (!lastActivity) {
              // No activity logged, check lastLogin
              if (user.lastLogin && new Date(user.lastLogin) < cutoffTime) {
                // User has been inactive, but we can't invalidate JWT tokens
                // This would require a token blacklist or session store
                // For now, we'll just log it
                totalExpired++;
              }
              continue;
            }

            // Check if last activity is before cutoff
            if (new Date(lastActivity.createdAt) < cutoffTime) {
              // Session expired due to inactivity
              // Note: JWT tokens can't be invalidated server-side without a blacklist
              // This automation would work better with a session store or token blacklist
              // For now, we'll track it in results
              totalExpired++;
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`User ${user.id}: ${error.message}`);
          }
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalExpired + purgedSessions;
    results.failed = totalFailed;
    results.message = `Found ${totalExpired} expired sessions and purged ${purgedSessions} expired PosSession record(s)${totalFailed > 0 ? `, ${totalFailed} failed` : ''}. Note: JWT tokens require a blacklist system for full session expiration.`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error checking session expiration: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
