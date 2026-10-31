import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SuperAdminAction from '@/models/SuperAdminAction';
import User from '@/models/User';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { getTenantDayBoundaries, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';

// GET /api/super-admin/admin-logs
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || '';
    const targetType = searchParams.get('targetType') || '';
    const adminId = searchParams.get('adminId') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));

    const query: Record<string, unknown> = {};
    if (action) query.action = { $regex: action, $options: 'i' };
    if (targetType) query.targetType = targetType;
    if (adminId) query.adminUserId = adminId;
    if (startDate || endDate) {
      // Cross-tenant view: 'YYYY-MM-DD' filters are platform-timezone (Asia/Manila) days,
      // not the server's UTC clock.
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.$gte = getTenantDayBoundaries(startDate, DEFAULT_TENANT_TIMEZONE).start;
      if (endDate) dateFilter.$lte = getTenantDayBoundaries(endDate, DEFAULT_TENANT_TIMEZONE).end;
      query.createdAt = dateFilter;
    }

    const [logs, total] = await Promise.all([
      SuperAdminAction.find(query)
        .populate('adminUserId', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SuperAdminAction.countDocuments(query),
    ]);

    // Inline populate since we need User ref
    void User;

    return NextResponse.json({
      success: true,
      data: logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}
