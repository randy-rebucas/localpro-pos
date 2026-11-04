import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type UserRole } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const tenantSlug = searchParams.get('tenantSlug') || '';
    const role = searchParams.get('role') || '';
    const search = searchParams.get('search') || '';

    const { tenants: tenantRepo, users: userRepo } = getRepos();

    // Resolve tenantSlug → tenantId
    let tenantId: string | undefined;
    if (tenantSlug) {
      const tenant = await tenantRepo.findBySlug(tenantSlug, { select: '_id' });
      if (tenant) {
        tenantId = tenant._id;
      } else {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: { page, limit, total: 0, pages: 0 },
        });
      }
    }

    // Always excludes super_admin accounts unless ?role= is given (an explicit
    // role replaces the default exclusion, as before).
    const { items: users, total } = await userRepo.search(
      { role: (role || undefined) as UserRole | undefined, search: search || undefined, tenantId },
      { skip: (page - 1) * limit, limit }
    );

    return NextResponse.json({
      success: true,
      data: users,
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
