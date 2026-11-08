import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import ArchivedAuditLog from '@/models/ArchivedAuditLog';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { arrayToCSV } from '@/lib/export';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getTenantSettingsById } from '@/lib/tenant';
import { tenantDayEdge, toTenantDateString } from '@/lib/timezone';
import { buildAuditLogQuery } from '@/lib/audit-log-filter';

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

/** Largest export built in one request (rows held in memory). */
const EXPORT_MAX_ENTRIES = 50_000;
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
    // Days are store days in the tenant's zone, not the server's (setHours used the server clock).
    const timeZone = (await getTenantSettingsById(String(user.tenantId)))?.timezone || 'Asia/Manila';
    // Same filters as the journal list (action, entity type, user, dates); with no dates it
    // covers the last 30 days up to now.
    const built = buildAuditLogQuery(searchParams, String(user.tenantId), timeZone, {
      start: tenantDayEdge(toTenantDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), timeZone), 'start', timeZone),
      end: new Date(),
    });
    if (!built.ok && built.reason === 'invalidDate') {
      return NextResponse.json({ success: false, error: t('validation.invalidDate', 'Invalid date') }, { status: 400 });
    }
    // Both edges always exist here (the defaults fill any missing one).
    const startDate = (built.ok && built.start) || new Date();
    const endDate = (built.ok && built.end) || new Date();
    const format = searchParams.get('format') || 'json'; // json, csv

    // The daily archive job moves logs to ArchivedAuditLog after 89 days
    // (lib/automations/audit-log-cleanup.ts); read the archive whenever the
    // range reaches past 88 days, so the hand-over day is never missed. A log
    // lives in exactly one collection, but de-duplicate by _id in case an
    // archive run was caught half-way.
    // A malformed user id matches nobody, so the export is empty rather than every user's entries.
    const archiveCutoff = new Date(Date.now() - 88 * 24 * 60 * 60 * 1000);
    // One export is held in memory: cap it and ask for a shorter range instead
    const cap = EXPORT_MAX_ENTRIES + 1;
    const [liveLogs, archivedLogs] = built.ok
      ? await Promise.all([
        AuditLog.find(built.query)
          .populate('userId', 'name email')
          .sort({ createdAt: 1 })
          .limit(cap)
          .lean(),
        startDate < archiveCutoff
          ? ArchivedAuditLog.find(built.query)
            .populate('userId', 'name email')
            .sort({ createdAt: 1 })
            .limit(cap)
            .lean()
          : Promise.resolve([]),
      ])
      : [[], []];
    if (liveLogs.length + archivedLogs.length > EXPORT_MAX_ENTRIES) {
      return NextResponse.json(
        { success: false, error: `This range has more than ${EXPORT_MAX_ENTRIES.toLocaleString('en')} entries. Export a shorter date range.` },
        { status: 413 }
      );
    }
    // chronological, matching an electronic journal's expected order
    const seen = new Set<string>();
    const logs = [...archivedLogs, ...liveLogs]
      .filter((log) => {
        const id = String(log._id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

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
        filters: {
          action: built.ok ? built.query.action : undefined,
          entityType: built.ok ? built.query.entityType : undefined,
          userId: searchParams.get('userId') || undefined,
        },
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
          'Content-Disposition': `attachment; filename="electronic-journal-${toTenantDateString(startDate, timeZone)}-to-${toTenantDateString(endDate, timeZone)}.csv"`,
        },
      });
    }

    if (format === 'json' && searchParams.get('download') === 'true') {
      return new NextResponse(JSON.stringify({ startDate, endDate, entries }, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="electronic-journal-${toTenantDateString(startDate, timeZone)}-to-${toTenantDateString(endDate, timeZone)}.json"`,
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
