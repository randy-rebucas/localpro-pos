import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { getTenantBySlugAny } from '@/lib/data/tenants';
import type { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

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

    const where: Prisma.AuditLogWhereInput = {};

    // Resolve tenantSlug → tenantId if provided
    if (tenantSlug) {
      const tenant = await getTenantBySlugAny(tenantSlug);
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
      const dateFilter: { gte?: Date; lte?: Date } = {};
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

    const [logs, total] = await Promise.all([
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

    if (format === 'csv') {
      const csvRows = [
        'Timestamp,Tenant,Action,Entity Type,Entity ID,User,IP',
        ...logs.map((log) => {
          const ts = new Date(log.createdAt).toISOString();
          const tenant = log.tenant?.slug || '';
          const user = log.user?.email || '';
          return `"${ts}","${tenant}","${log.action || ''}","${log.entityType || ''}","${log.entityId || ''}","${user}","${log.ipAddress || ''}"`;
        }),
      ].join('\n');

      return new NextResponse(csvRows, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const data = logs.map(({ id, tenantId: tId, userId: uId, tenant, user, ...rest }) => ({
      _id: id,
      ...rest,
      tenantId: tenant ? { _id: tId, slug: tenant.slug, name: tenant.name } : tId,
      userId: user ? { _id: uId, name: user.name, email: user.email } : uId,
    }));

    return NextResponse.json({
      success: true,
      data,
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
