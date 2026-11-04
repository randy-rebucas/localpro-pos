import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type AuditLogFilter } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
// Side-effect import: registers the User model for populate('userId') until
// AuditLog moves to a repository.
import '@/models/User';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

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

    const filter: AuditLogFilter = {
      ...(action && { action }),
      ...(entityType && { entityType }),
      ...(userId && { userId }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
    };

    // Fetch audit logs with pagination
    const repo = getRepos().auditLogs;
    const [auditLogs, total] = await Promise.all([
      repo.listWithUser(user.tenantId, filter, { page: { skip, limit } }),
      repo.count(user.tenantId, filter),
    ]);

    return NextResponse.json({
      success: true,
      data: auditLogs,
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

