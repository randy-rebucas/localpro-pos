/**
 * Automatic Session Expiration
 * Enhanced session management with activity tracking
 */

import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import User from '@/models/User';
import Tenant from '@/models/Tenant';
import { AutomationResult } from './types';

export interface SessionExpirationOptions {
  tenantId?: string;
  inactivityHours?: number; // Hours of inactivity before expiration (default: 24)
}

/**
 * Check for expired sessions based on inactivity
 * Note: This is a simplified implementation using audit logs
 * In production, you might want a dedicated session tracking system
 */
export async function expireInactiveSessions(
  options: SessionExpirationOptions = {}
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
    const inactivityHours = options.inactivityHours || 24;
    const cutoffTime = new Date(Date.now() - inactivityHours * 60 * 60 * 1000);

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

    let totalExpired = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();

        // Get all active users
        const users = await User.find({ tenantId, isActive: true }).lean();

        for (const user of users) {
          try {
            // Get last activity from audit logs
            const lastActivity = await AuditLog.findOne({
              tenantId,
              userId: user._id,
            })
              .sort({ createdAt: -1 })
              .lean();

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
          } catch (error: any) {
            totalFailed++;
            results.errors?.push(`User ${user._id}: ${error.message}`);
          }
        }
      } catch (error: any) {
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalExpired;
    results.failed = totalFailed;
    results.message = `Found ${totalExpired} expired sessions${totalFailed > 0 ? `, ${totalFailed} failed` : ''}. Note: JWT tokens require a blacklist system for full session expiration.`;

    return results;
  } catch (error: any) {
    results.success = false;
    results.message = `Error checking session expiration: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
