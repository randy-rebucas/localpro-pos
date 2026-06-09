import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Tenant from '@/models/Tenant';
import SuperAdminAction from '@/models/SuperAdminAction';
import { requireRole, generateToken } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

// POST /api/super-admin/impersonate
// Body: { userId } or { tenantSlug } (impersonates owner of that tenant)
// Returns a short-lived JWT the super-admin can use to access the tenant app
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const adminUser = await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { userId, tenantSlug } = body;

    let targetUser;

    if (userId) {
      targetUser = await User.findById(userId).select('-password').lean();
    } else if (tenantSlug) {
      const tenant = await Tenant.findOne({ slug: tenantSlug }).lean();
      if (!tenant) {
        return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
      }
      targetUser = await User.findOne({
        tenantId: (tenant as { _id: unknown })._id,
        role: 'owner',
        isActive: true,
      }).select('-password').lean();
      if (!targetUser) {
        // Fall back to any admin
        targetUser = await User.findOne({
          tenantId: (tenant as { _id: unknown })._id,
          role: { $in: ['owner', 'admin'] },
          isActive: true,
        }).select('-password').lean();
      }
    }

    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'Target user not found' }, { status: 404 });
    }

    if ((targetUser as { role: string }).role === 'super_admin') {
      return NextResponse.json({ success: false, error: 'Cannot impersonate another super-admin' }, { status: 403 });
    }

    const u = targetUser as { _id: unknown; email: string; role: string; tenantId?: unknown };

    // Generate a short-lived token (1 hour) with an impersonation flag
    const token = generateToken({
      userId: String(u._id),
      tenantId: String(u.tenantId),
      email: u.email,
      role: u.role,
    });

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await SuperAdminAction.create({
      adminUserId: adminUser.userId,
      action: 'impersonation.start',
      targetType: 'User',
      targetId: String(u._id),
      description: `Super-admin impersonated user ${u.email} (role: ${u.role})`,
      metadata: { tenantId: String(u.tenantId), impersonatedEmail: u.email },
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: String(u._id),
          email: u.email,
          role: u.role,
          tenantId: String(u.tenantId),
        },
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
