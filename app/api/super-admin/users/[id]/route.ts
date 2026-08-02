import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES = ['owner', 'admin', 'manager', 'cashier', 'viewer'] as const;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { id } = await params;
    const body = await request.json();
    const { action, role } = body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Prevent modifying other super_admin accounts
    if (user.role === 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Cannot modify super_admin accounts' },
        { status: 403 }
      );
    }

    const tenantId = user.tenantId ?? undefined;

    switch (action) {
      case 'deactivate':
        await prisma.user.update({ where: { id }, data: { isActive: false } });
        if (tenantId) {
          await createAuditLog(request, {
            tenantId,
            action: 'user.deactivate',
            entityType: 'User',
            entityId: id,
            changes: { isActive: { from: true, to: false } },
          });
        }
        break;

      case 'activate':
        await prisma.user.update({ where: { id }, data: { isActive: true } });
        if (tenantId) {
          await createAuditLog(request, {
            tenantId,
            action: 'user.activate',
            entityType: 'User',
            entityId: id,
            changes: { isActive: { from: false, to: true } },
          });
        }
        break;

      case 'change-role': {
        if (!role || !ALLOWED_ROLES.includes(role)) {
          return NextResponse.json(
            { success: false, error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` },
            { status: 400 }
          );
        }
        const previousRole = user.role;
        await prisma.user.update({ where: { id }, data: { role: role as Role } });
        if (tenantId) {
          await createAuditLog(request, {
            tenantId,
            action: 'user.change_role',
            entityType: 'User',
            entityId: id,
            changes: { role: { from: previousRole, to: role } },
          });
        }
        break;
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    const updated = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        tenant: { select: { id: true, slug: true, name: true } },
      },
    });

    const data = updated
      ? (() => {
          const { id: updatedId, tenant, ...rest } = updated;
          return {
            _id: updatedId,
            ...rest,
            tenantId: tenant ? { _id: tenant.id, slug: tenant.slug, name: tenant.name } : null,
          };
        })()
      : null;

    return NextResponse.json({ success: true, data });
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
