import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import User from '@/models/User'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { getTenantSettingsById } from '@/lib/tenant';
import { auditQueryNeedsTimeZone, buildAuditLogQuery } from '@/lib/audit-log-filter';

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

    // Filters (shared with the export, so an export prints what this list shows).
    // Picked dates are store days in the tenant's zone, so the zone is only looked up when one is set.
    const timeZone = auditQueryNeedsTimeZone(searchParams)
      ? (await getTenantSettingsById(String(user.tenantId)))?.timezone || 'Asia/Manila'
      : 'Asia/Manila';
    const built = buildAuditLogQuery(searchParams, String(user.tenantId), timeZone);
    if (!built.ok) {
      if (built.reason === 'invalidDate') {
        return NextResponse.json({ success: false, error: t('validation.invalidDate', 'Invalid date') }, { status: 400 });
      }
      return NextResponse.json({ success: true, data: [], pagination: { page, limit, total: 0, pages: 0 } });
    }
    const query = built.query;

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

