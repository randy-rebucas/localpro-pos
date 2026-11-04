import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type AuditLogFilter } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const tenantId = searchParams.get('tenantId') || '';
    const tenantSlug = searchParams.get('tenantSlug') || '';
    const action = searchParams.get('action') || '';
    const entityType = searchParams.get('entityType') || '';
    const userId = searchParams.get('userId') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    let scopedTenantId: string | null = null;

    // Resolve tenantSlug → tenantId if provided
    if (tenantSlug) {
      const tenant = await getRepos().tenants.findBySlug(tenantSlug, { select: '_id' });
      if (tenant) {
        scopedTenantId = tenant._id;
      } else {
        return NextResponse.json({ success: true, data: [], pagination: { page, limit, total: 0, pages: 0 } });
      }
    } else if (tenantId) {
      scopedTenantId = tenantId;
    }
    // If neither provided, no tenantId filter → returns all tenants' logs

    const filter: AuditLogFilter = {
      ...(action && { actionContains: action }),
      ...(entityType && { entityType }),
      ...(userId && { userId }),
    };

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.lte = end;
      }
    }

    const format = searchParams.get('format') || 'json';
    const csvLimit = format === 'csv' ? 5000 : limit;

    const repo = getRepos().auditLogs;
    const [logs, total] = await Promise.all([
      repo.listWithRefs(scopedTenantId, filter, {
        page: { skip: format === 'csv' ? 0 : (page - 1) * limit, limit: csvLimit },
      }),
      repo.count(scopedTenantId, filter),
    ]);

    if (format === 'csv') {
      type LogEntry = {
        createdAt: Date;
        tenantId?: { slug?: string; name?: string };
        action?: string;
        entityType?: string;
        entityId?: string;
        userId?: { name?: string; email?: string };
        ipAddress?: string;
      };
      const csvRows = [
        'Timestamp,Tenant,Action,Entity Type,Entity ID,User,IP',
        ...logs.map((l) => {
          const log = l as LogEntry;
          const ts = new Date(log.createdAt).toISOString();
          const tenant = log.tenantId ? `${(log.tenantId as { slug?: string }).slug || ''}` : '';
          const user = log.userId ? `${(log.userId as { email?: string }).email || ''}` : '';
          return `"${ts}","${tenant}","${log.action || ''}","${log.entityType || ''}","${log.entityId || ''}","${user}","${log.ipAddress || ''}"`;
        }),
      ].join('\n');

      // Bulk-exporting audit logs — potentially across every tenant — is
      // itself a sensitive action worth its own trail (mirrors the
      // tenant-scoped export at api/audit-logs/export/route.ts).
      const defaultTenant = await getRepos().tenants.findBySlug('default', { select: '_id' });
      if (defaultTenant) {
        await createAuditLog(request, {
          tenantId: defaultTenant._id,
          userId: user.userId,
          action: AuditActions.AUDIT_LOG_EXPORT,
          entityType: 'audit_log',
          metadata: {
            format: 'csv',
            tenantSlug: tenantSlug || null,
            startDate: startDate || null,
            endDate: endDate || null,
            entryCount: logs.length,
          },
        });
      }

      return new NextResponse(csvRows, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}
