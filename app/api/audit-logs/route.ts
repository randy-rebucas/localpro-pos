import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import User from '@/models/User'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { getTenantSettingsById } from '@/lib/tenant';
import { getTenantTimezone, getTenantDayBoundaries } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    await connectDB();

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
    const query: any = { tenantId: user.tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (action) {
      query.action = action;
    }

    if (entityType) {
      query.entityType = entityType;
    }

    if (userId) {
      query.userId = userId;
    }

    // Bare 'YYYY-MM-DD' params are inclusive tenant-local calendar days (the server
    // runs UTC); full ISO timestamps are used as-is.
    if (startDate || endDate) {
      const tz = getTenantTimezone(await getTenantSettingsById(user.tenantId));
      const isYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = isYmd(startDate) ? getTenantDayBoundaries(startDate, tz).start : new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = isYmd(endDate) ? getTenantDayBoundaries(endDate, tz).end : new Date(endDate);
      }
    }

    // Fetch audit logs with pagination
    const [auditLogs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query),
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

