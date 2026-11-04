import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const { tenants, users } = getRepos();
    const [totalTenants, activeTenants, totalUsers] = await Promise.all([
      tenants.countAll(), // estimatedDocumentCount: metadata only, no collection scan
      tenants.countFlaggedActive(),
      users.countAllExceptSuperAdmins(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        totalTenants,
        activeTenants,
        inactiveTenants: totalTenants - activeTenants,
        totalUsers,
      },
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
