/**
 * Automatic Session Expiration
 * Enhanced session management with activity tracking
 */

import { getRepos } from '@/lib/db';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { AutomationResult } from './types';

export interface SessionExpirationOptions {
  tenantId?: string;
  inactivityHours?: number; // Hours of inactivity before expiration (default: 24)
}

/**
 * Check for expired sessions based on inactivity
 * Note: This is a simplified implementation using audit logs
 * In production, you might want a dedicated session tracking system
 *
 * Read-only: it counts inactive users but cannot revoke JWTs, so it writes nothing.
 * Per tenant it now runs at most 3 queries (users, recent activity, any-activity
 * for the inactive remainder) instead of 1 + one AuditLog.findOne per user.
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

    // Get tenants to process (no tenant settings are needed)
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

    let totalExpired = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = String(tenant._id);

        // Get all active users
        const users = await getRepos().users.listActiveLogins(tenantId);
        if (users.length === 0) continue;

        const userIds = users.map((u) => u._id);

        // Users with any audit activity since the cutoff — they are not expired.
        // Bounded to the inactivity window, served by { tenantId, userId, createdAt }.
        const recentlyActive = new Set(
          await getRepos().auditLogs.activeUserIds(tenantId, userIds, { since: cutoffTime })
        );

        const inactive = users.filter((u) => !recentlyActive.has(u._id));
        if (inactive.length === 0) continue;

        // Previously: a user whose last audit entry is older than the cutoff is
        // expired; a user with no audit entry at all falls back to lastLogin.
        // Only users that lack a stale lastLogin need the "any activity ever" check.
        const needsHistoryCheck = inactive.filter(
          (u) => !(u.lastLogin && new Date(u.lastLogin) < cutoffTime)
        );
        const hasAnyActivity = needsHistoryCheck.length
          ? new Set(await getRepos().auditLogs.activeUserIds(tenantId, needsHistoryCheck.map((u) => u._id)))
          : new Set<string>();

        for (const user of inactive) {
          try {
            const staleLogin = !!user.lastLogin && new Date(user.lastLogin) < cutoffTime;
            // Session expired due to inactivity
            // Note: JWT tokens can't be invalidated server-side without a blacklist
            // This automation would work better with a session store or token blacklist
            // For now, we'll track it in results
            if (staleLogin || hasAnyActivity.has(user._id)) {
              totalExpired++;
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`User ${user._id}: ${error.message}`);
          }
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalExpired;
    results.failed = totalFailed;
    results.message = `Found ${totalExpired} expired sessions${totalFailed > 0 ? `, ${totalFailed} failed` : ''}. Note: JWT tokens require a blacklist system for full session expiration.`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error checking session expiration: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
