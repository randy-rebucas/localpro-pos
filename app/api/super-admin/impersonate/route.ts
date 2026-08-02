import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, generateToken } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { getTenantBySlugAny } from '@/lib/data/tenants';

// POST /api/super-admin/impersonate
// Body: { userId } or { tenantSlug } (impersonates owner of that tenant)
// Returns a short-lived JWT the super-admin can use to access the tenant app
export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { userId, tenantSlug } = body;

    let targetUser;

    if (userId) {
      targetUser = await prisma.user.findUnique({ where: { id: userId } });
    } else if (tenantSlug) {
      const tenant = await getTenantBySlugAny(tenantSlug);
      if (!tenant) {
        return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
      }
      targetUser = await prisma.user.findFirst({
        where: { tenantId: tenant.id, role: 'owner', isActive: true },
      });
      if (!targetUser) {
        // Fall back to any admin
        targetUser = await prisma.user.findFirst({
          where: { tenantId: tenant.id, role: { in: ['owner', 'admin'] }, isActive: true },
        });
      }
    }

    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'Target user not found' }, { status: 404 });
    }

    if (targetUser.role === 'super_admin') {
      return NextResponse.json({ success: false, error: 'Cannot impersonate another super-admin' }, { status: 403 });
    }

    const u = targetUser;

    // Generate a short-lived token (1 hour) with an impersonation flag
    const token = generateToken({
      userId: u.id,
      tenantId: String(u.tenantId),
      email: u.email,
      role: u.role,
    });

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await prisma.superAdminAction.create({
      data: {
        adminUserId: adminUser.userId,
        action: 'impersonation.start',
        targetType: 'User',
        targetId: u.id,
        description: `Super-admin impersonated user ${u.email} (role: ${u.role})`,
        metadata: { tenantId: String(u.tenantId), impersonatedEmail: u.email },
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') || '',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: u.id,
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
