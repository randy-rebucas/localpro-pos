import { NextRequest, NextResponse } from 'next/server';
import prisma, { dbTransaction } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

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

    const tenantId = user.tenantId ? String(user.tenantId) : undefined;

    switch (action) {
      case 'deactivate':
        await dbTransaction(async (tx) => {
          await tx.user.update({ where: { id }, data: { isActive: false } });
          if (tenantId) {
            await createAuditLog(request, {
              tenantId,
              action: 'user.deactivate',
              entityType: 'User',
              entityId: id,
              changes: { isActive: { from: true, to: false } },
            });
          }
        });
        break;

      case 'activate':
        await dbTransaction(async (tx) => {
          await tx.user.update({ where: { id }, data: { isActive: true } });
          if (tenantId) {
            await createAuditLog(request, {
              tenantId,
              action: 'user.activate',
              entityType: 'User',
              entityId: id,
              changes: { isActive: { from: false, to: true } },
            });
          }
        });
        break;

      case 'change-role': {
        if (!role || !ALLOWED_ROLES.includes(role)) {
          return NextResponse.json(
            { success: false, error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` },
            { status: 400 }
          );
        }
        // Re-read the role inside the transaction so a concurrent role change
        // can't make the audit log's "from" value stale.
        await dbTransaction(async (tx) => {
          const current = await tx.user.findUnique({ where: { id }, select: { role: true } });
          const previousRole = current?.role ?? user.role;
          await tx.user.update({ where: { id }, data: { role } });
          if (tenantId) {
            await createAuditLog(request, {
              tenantId,
              action: 'user.change_role',
              entityType: 'User',
              entityId: id,
              changes: { role: { from: previousRole, to: role } },
            });
          }
        });
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
        tenantId: true,
        tenant: { select: { slug: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
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
