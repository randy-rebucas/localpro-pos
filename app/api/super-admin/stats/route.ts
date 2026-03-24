import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const [totalTenants, activeTenants, totalUsers] = await Promise.all([
      Tenant.countDocuments(),
      Tenant.countDocuments({ isActive: true }),
      User.countDocuments({ role: { $ne: 'super_admin' } }),
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
