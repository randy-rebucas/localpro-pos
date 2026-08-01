import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { arrayToCSV } from '@/lib/export';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * BIR Electronic Journal / Audit Trail raw dump.
 * Exports every logged action (transactions, voids, refunds, payments, stock,
 * discounts, invoices, logins, etc.) for a date range as CSV or JSON — the
 * "raw file extract proving every transaction, void, and back-end change
 * without gaps" required for BIR accreditation.
 *
 * Note: AuditLog documents auto-expire after 90 days (see models/AuditLog.ts
 * TTL index) — export and archive periodically if longer retention is needed.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, user.tenantId, 'audit_logs.export'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbiddenAdminAccess', 'Forbidden: Admin access required') },
        { status: 403 }
      );
    }

    const rl = checkRateLimit(`audit-log-export:${user.tenantId}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : new Date();
    startDate.setHours(0, 0, 0, 0);
    if (searchParams.get('endDate')) endDate.setHours(23, 59, 59, 999);
    const format = searchParams.get('format') || 'json'; // json, csv

    const query = {
      tenantId: user.tenantId,
      createdAt: { $gte: startDate, $lte: endDate },
    };

    const logs = await AuditLog.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: 1 }) // chronological, matching an electronic journal's expected order
      .lean();

    const entries = logs.map((log) => {
      const actor = log.userId && typeof log.userId === 'object'
        ? (log.userId as unknown as { name?: string; email?: string })
        : undefined;
      return {
        timestamp: new Date(log.createdAt).toISOString(),
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId || '',
        userName: actor?.name || '',
        userEmail: actor?.email || '',
        ipAddress: log.ipAddress || '',
        userAgent: log.userAgent || '',
        changes: log.changes ? JSON.stringify(log.changes) : '',
        metadata: log.metadata ? JSON.stringify(log.metadata) : '',
      };
    });

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.AUDIT_LOG_EXPORT,
      entityType: 'audit_log',
      metadata: {
        format,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        entryCount: entries.length,
      },
    });

    if (format === 'csv') {
      const headers = [
        'timestamp', 'action', 'entityType', 'entityId',
        'userName', 'userEmail', 'ipAddress', 'userAgent', 'changes', 'metadata',
      ];
      const csv = arrayToCSV(entries, headers);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="electronic-journal-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    if (format === 'json' && searchParams.get('download') === 'true') {
      return new NextResponse(JSON.stringify({ startDate, endDate, entries }, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="electronic-journal-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.json"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        entries,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        entryCount: entries.length,
      },
    });
  } catch (error: unknown) {
    logger.error('Error exporting audit log:', error);
    const message = error instanceof Error ? error.message : 'Failed to export audit log';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
