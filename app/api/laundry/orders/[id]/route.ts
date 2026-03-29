import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LaundryOrder from '@/models/LaundryOrder';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog } from '@/lib/audit';

const VALID_STATUSES = ['inbasket', 'processing', 'ready', 'picked_up'];

// GET /api/laundry/orders/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess(request);
    await connectDB();
    const { id } = await params;

    const order = await LaundryOrder.findOne({ _id: id, tenantId, isActive: true }).lean();
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch laundry order');
  }
}

// PATCH /api/laundry/orders/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess(request);
    await connectDB();
    const { id } = await params;

    const body = await request.json();
    const { status, rackLocation, paymentStatus, paymentMethod, notes, notifiedAt } = body;

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (status) update.status = status;
    if (rackLocation !== undefined) update.rackLocation = rackLocation;
    if (paymentStatus) update.paymentStatus = paymentStatus;
    if (paymentMethod) update.paymentMethod = paymentMethod;
    if (notes !== undefined) update.notes = notes;
    if (notifiedAt) update.notifiedAt = new Date(notifiedAt);

    const order = await LaundryOrder.findOneAndUpdate(
      { _id: id, tenantId, isActive: true },
      { $set: update },
      { new: true }
    );

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      action: 'UPDATE',
      entityType: 'LaundryOrder',
      entityId: order._id.toString(),
      changes: { orderNumber: order.orderNumber, ...update },
    });

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    return handleApiError(error, 'Failed to update laundry order');
  }
}

// DELETE /api/laundry/orders/[id] — soft delete
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess(request);
    await connectDB();
    const { id } = await params;

    const order = await LaundryOrder.findOneAndUpdate(
      { _id: id, tenantId, isActive: true },
      { $set: { isActive: false } },
      { new: true }
    );

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      action: 'DELETE',
      entityType: 'LaundryOrder',
      entityId: order._id.toString(),
      changes: { orderNumber: order.orderNumber },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete laundry order');
  }
}
