import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type SuperAdminActionFilter } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

// GET /api/super-admin/admin-logs
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || '';
    const targetType = searchParams.get('targetType') || '';
    const adminId = searchParams.get('adminId') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));

    const filter: SuperAdminActionFilter = {
      ...(action && { actionContains: action }),
      ...(targetType && { targetType }),
      ...(adminId && { adminUserId: adminId }),
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

    const repo = getRepos().superAdminActions;
    const [logs, total] = await Promise.all([
      repo.listWithAdmin(filter, { page: { skip: (page - 1) * limit, limit } }),
      repo.count(filter),
    ]);

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
