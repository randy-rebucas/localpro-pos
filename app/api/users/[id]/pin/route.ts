import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';

/**
 * PUT - Set or update PIN for a user (admin/manager only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['owner', 'admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const currentUser = await getCurrentUser(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { pin } = body;

    if (!pin) {
      return NextResponse.json(
        { success: false, error: 'PIN is required' },
        { status: 400 }
      );
    }

    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: 'PIN must be 4-8 digits' },
        { status: 400 }
      );
    }

    // Verify user exists and belongs to same tenant
    const user = await User.findOne({ _id: id, tenantId });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Update PIN (will be hashed by pre-save hook)
    await User.findByIdAndUpdate(id, { pin });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'user',
      entityId: id,
      changes: { pin: { changed: true } },
      metadata: { updatedBy: currentUser?.userId },
    });

    return NextResponse.json({
      success: true,
      message: 'PIN updated successfully',
    });
  } catch (error: any) {
    console.error('Update user PIN error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update PIN' },
      { status: error.message === 'Unauthorized' || error.message.includes('Forbidden') ? 403 : 500 }
    );
  }
}

/**
 * DELETE - Remove PIN for a user (admin/manager only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['owner', 'admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const currentUser = await getCurrentUser(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Verify user exists and belongs to same tenant
    const user = await User.findOne({ _id: id, tenantId });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Remove PIN
    await User.findByIdAndUpdate(id, { $unset: { pin: 1 } });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'user',
      entityId: id,
      changes: { pin: { removed: true } },
      metadata: { updatedBy: currentUser?.userId },
    });

    return NextResponse.json({
      success: true,
      message: 'PIN removed successfully',
    });
  } catch (error: any) {
    console.error('Delete user PIN error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to remove PIN' },
      { status: error.message === 'Unauthorized' || error.message.includes('Forbidden') ? 403 : 500 }
    );
  }
}

