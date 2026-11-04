/**
 * API Route for Automation Status
 * Returns the status of all automations, optionally scoped to a single tenant.
 * Protected by cron auth — not accessible by end users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { getRepos } from '@/lib/db';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;

    // Optional tenantId scoping: when provided, stats are restricted to that tenant.
    // Without it this endpoint aggregates across all tenants (cron system-health use only).
    const scopedTenantId = searchParams.get('tenantId') || null;

    const now = new Date();
    const stats = {
      discounts: { active: 0, expiringSoon: 0, needsActivation: 0, needsDeactivation: 0 },
      attendance: { openSessions: 0, forgottenSessions: 0 },
      cashDrawer: { openSessions: 0 },
      transactions: { pendingReceipts: 0 },
    };

    // Get discount stats
    stats.discounts = await getRepos().discounts.statusCounts(scopedTenantId, now);

    // Get attendance stats
    stats.attendance.openSessions = await getRepos().attendance.countOpen(scopedTenantId);

    // Count forgotten sessions (open for more than 12 hours)
    const forgottenThreshold = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    stats.attendance.forgottenSessions = await getRepos().attendance.countOpen(scopedTenantId, {
      clockInBefore: forgottenThreshold,
    });

    // Get cash drawer stats
    stats.cashDrawer.openSessions = await getRepos().cashDrawerSessions.countOpen(scopedTenantId);

    // Get transaction stats (transactions with email in notes from last 24h)
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const receiptFilter = {
      createdAt: { gte: last24h },
      status: 'completed' as const,
      notesContain: 'email',
    };
    const { transactions } = getRepos();
    const recentTransactions = scopedTenantId
      ? await transactions.list(scopedTenantId, receiptFilter, { limit: 100 })
      : await transactions.listAcrossTenants(receiptFilter, { limit: 100 });

    stats.transactions.pendingReceipts = recentTransactions.filter(t => {
      const emailMatch = t.notes?.match(/email[:\s]+([^\s]+)/i);
      return !!emailMatch;
    }).length;

    return NextResponse.json({
      success: true,
      data: stats,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error('Automation status error:', error);
    return handleApiError(error, 'Failed to fetch automation status');
  }
}
