import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
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

    const where: Record<string, unknown> = {};

    // Resolve tenantSlug → tenantId if provided
    if (tenantSlug) {
      const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
      if (tenant) {
        where.tenantId = tenant.id;
      } else {
        return NextResponse.json({ success: true, data: [], pagination: { page, limit, total: 0, pages: 0 } });
      }
    } else if (tenantId) {
      where.tenantId = tenantId;
    }
    // If neither provided, no tenantId filter → returns all tenants' logs

    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (entityType) where.entityType = entityType;
    if (userId) where.userId = userId;

    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      where.createdAt = dateFilter;
    }

    const format = searchParams.get('format') || 'json';
    const csvLimit = format === 'csv' ? 5000 : limit;

    const [rawLogs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          tenant: { select: { slug: true, name: true } },
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: format === 'csv' ? 0 : (page - 1) * limit,
        take: csvLimit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Preserve the original Mongoose-populate response shape, where
    // `tenantId`/`userId` were the populated objects.
    const logs = rawLogs.map((log) => ({
      ...log,
      tenantId: log.tenant ? { slug: log.tenant.slug, name: log.tenant.name } : null,
      userId: log.user ? { name: log.user.name, email: log.user.email } : null,
      tenant: undefined,
      user: undefined,
    }));

    if (format === 'csv') {
      type LogEntry = {
        createdAt: Date;
        tenantId?: { slug?: string; name?: string } | null;
        action?: string;
        entityType?: string;
        entityId?: string | null;
        userId?: { name?: string; email?: string } | null;
        ipAddress?: string | null;
      };
      const csvRows = [
        'Timestamp,Tenant,Action,Entity Type,Entity ID,User,IP',
        ...logs.map((l) => {
          const log = l as LogEntry;
          const ts = new Date(log.createdAt).toISOString();
          const tenant = log.tenantId ? `${log.tenantId.slug || ''}` : '';
          const userLabel = log.userId ? `${log.userId.email || ''}` : '';
          return `"${ts}","${tenant}","${log.action || ''}","${log.entityType || ''}","${log.entityId || ''}","${userLabel}","${log.ipAddress || ''}"`;
        }),
      ].join('\n');

      // Bulk-exporting audit logs — potentially across every tenant — is
      // itself a sensitive action worth its own trail (mirrors the
      // tenant-scoped export at api/audit-logs/export/route.ts).
      const defaultTenant = await prisma.tenant.findUnique({ where: { slug: 'default' }, select: { id: true } });
      if (defaultTenant) {
        await createAuditLog(request, {
          tenantId: defaultTenant.id,
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
