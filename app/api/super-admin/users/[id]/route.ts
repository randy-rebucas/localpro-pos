import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { requireRole } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

const ALLOWED_ROLES = ['owner', 'admin', 'manager', 'cashier', 'viewer'] as const;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const { id } = await params;
    const body = await request.json();
    const { action, role } = body;

    const user = await User.findById(id);
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
        user.isActive = false;
        await user.save();
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
        user.isActive = true;
        await user.save();
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
        user.role = role;
        await user.save();
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

    const updated = await User.findById(id)
      .populate('tenantId', 'slug name')
      .select('name email role isActive lastLogin createdAt tenantId')
      .lean();

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
