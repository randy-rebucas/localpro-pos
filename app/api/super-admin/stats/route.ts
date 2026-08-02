import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const [totalTenants, activeTenants, totalUsers] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: { not: 'super_admin' } } }),
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
