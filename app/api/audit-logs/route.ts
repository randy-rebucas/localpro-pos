import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    // Get translation function
    const t = await getValidationTranslatorFromRequest(request);

    // Manager and above can view audit logs (tenant-configurable)
    if (!(await hasTenantPermission(user.role, user.tenantId, 'audit_logs.view'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbiddenAdminAccess', 'Forbidden: Admin access required') },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 200);
    const skip = (page - 1) * limit;

    // Filters
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build query
    const where: Prisma.AuditLogWhereInput = { tenantId: user.tenantId };

    if (action) {
      where.action = action;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        (where.createdAt as Prisma.DateTimeFilter).gte = new Date(startDate);
      }
      if (endDate) {
        (where.createdAt as Prisma.DateTimeFilter).lte = new Date(endDate);
      }
    }

    // Fetch audit logs with pagination
    const [auditLogs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const data = auditLogs.map(({ id, userId: uid, user: userRel, ...rest }) => ({
      _id: id,
      userId: userRel ? { _id: uid, name: userRel.name, email: userRel.email } : uid,
      ...rest,
    }));

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get audit logs error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchAuditLogs', 'Failed to fetch audit logs') },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}
