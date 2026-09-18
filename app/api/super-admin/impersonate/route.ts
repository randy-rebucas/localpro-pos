import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireRole, generateToken } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

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
      targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, tenantId: true },
      });
    } else if (tenantSlug) {
      const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (!tenant) {
        return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
      }
      targetUser = await prisma.user.findFirst({
        where: {
          tenantId: tenant.id,
          role: 'owner',
          isActive: true,
        },
        select: { id: true, email: true, role: true, tenantId: true },
      });
      if (!targetUser) {
        // Fall back to any admin
        targetUser = await prisma.user.findFirst({
          where: {
            tenantId: tenant.id,
            role: { in: ['owner', 'admin'] },
            isActive: true,
          },
          select: { id: true, email: true, role: true, tenantId: true },
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

    // Generate a short-lived token (1 hour) tagged with the impersonating admin
    const token = generateToken({
      userId: String(u.id),
      tenantId: String(u.tenantId),
      email: u.email,
      role: u.role,
      impersonatedBy: adminUser.userId,
    }, { expiresIn: '1h' });

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await prisma.superAdminAction.create({
      data: {
        id: randomUUID(),
        adminUserId: adminUser.userId,
        action: 'impersonation.start',
        targetType: 'User',
        targetId: String(u.id),
        description: `Super-admin impersonated user ${u.email} (role: ${u.role})`,
        metadata: { tenantId: String(u.tenantId), impersonatedEmail: u.email },
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') || '',
      },
    });

    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: String(u.id),
          email: u.email,
          role: u.role,
          tenantId: String(u.tenantId),
        },
      },
    });

    // Stored under a separate cookie name from the admin's own 'auth-token'
    // session so starting impersonation doesn't log the admin out of the
    // super-admin panel in other tabs on the same browser.
    response.cookies.set('impersonation-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60, // 1 hour, matches the token's own expiry
    });

    return response;
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
