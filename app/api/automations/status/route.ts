/**
 * API Route for Automation Status
 * Returns the status of all automations, optionally scoped to a single tenant.
 * Protected by cron auth — not accessible by end users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;

    // Optional tenantId scoping: when provided, stats are restricted to that tenant.
    // Without it this endpoint aggregates across all tenants (cron system-health use only).
    const tenantId = searchParams.get('tenantId') || undefined;

    const now = new Date();
    const stats = {
      discounts: { active: 0, expiringSoon: 0, needsActivation: 0, needsDeactivation: 0 },
      attendance: { openSessions: 0, forgottenSessions: 0 },
      cashDrawer: { openSessions: 0 },
      transactions: { pendingReceipts: 0 },
    };

    // Get discount stats
    stats.discounts.active = await prisma.discount.count({
      where: {
        ...(tenantId ? { tenantId } : {}),
        isActive: true,
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
    });

    const expiringSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    stats.discounts.expiringSoon = await prisma.discount.count({
      where: {
        ...(tenantId ? { tenantId } : {}),
        isActive: true,
        validUntil: { gte: now, lte: expiringSoon },
      },
    });

    stats.discounts.needsActivation = await prisma.discount.count({
      where: {
        ...(tenantId ? { tenantId } : {}),
        validFrom: { lte: now },
        validUntil: { gte: now },
        isActive: false,
      },
    });

    stats.discounts.needsDeactivation = await prisma.discount.count({
      where: {
        ...(tenantId ? { tenantId } : {}),
        validUntil: { lt: now },
        isActive: true,
      },
    });

    // Get attendance stats
    stats.attendance.openSessions = await prisma.attendance.count({
      where: {
        ...(tenantId ? { tenantId } : {}),
        clockOut: null,
      },
    });

    // Count forgotten sessions (open for more than 12 hours)
    const forgottenThreshold = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    stats.attendance.forgottenSessions = await prisma.attendance.count({
      where: {
        ...(tenantId ? { tenantId } : {}),
        clockOut: null,
        clockIn: { lt: forgottenThreshold },
      },
    });

    // Get cash drawer stats
    stats.cashDrawer.openSessions = await prisma.cashDrawerSession.count({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: 'open',
      },
    });

    // Get transaction stats (transactions with email in notes from last 24h)
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        createdAt: { gte: last24h },
        status: 'completed',
        notes: { contains: 'email', mode: 'insensitive' },
      },
      select: { notes: true },
      take: 100,
    });

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
