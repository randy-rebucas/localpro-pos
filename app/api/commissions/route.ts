import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Commission from '@/models/Commission';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { hasRole } from '@/lib/auth';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const params = request.nextUrl.searchParams;

    const query: Record<string, unknown> = { tenantId };
    if (params.get('status')) query.status = params.get('status');
    if (params.get('period')) query.period = params.get('period');
    if (params.get('staffId')) query.staffId = new mongoose.Types.ObjectId(params.get('staffId')!);

    const limit = Math.min(parseInt(params.get('limit') || '50'), 200);
    const page = Math.max(1, parseInt(params.get('page') || '1'));

    const [commissions, total] = await Promise.all([
      Commission.find(query)
        .populate('staffId', 'name email role')
        .populate('transactionId', 'receiptNumber total createdAt')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),
      Commission.countDocuments(query),
    ]);

    return NextResponse.json({ success: true, data: commissions, pagination: { total, page, limit } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to list commissions');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);

    // Only admin/owner can approve, pay, or reject commissions
    if (!hasRole(user.role, ['admin', 'owner'])) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const userId = user.userId;
    const body = await request.json();
    const { ids, status, notes } = body;

    if (!ids?.length || !status) {
      return NextResponse.json({ success: false, error: 'ids and status are required' }, { status: 400 });
    }

    const allowedStatuses = ['approved', 'paid', 'rejected'];
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    const update: Record<string, unknown> = { status, approvedBy: userId };
    if (notes) update.notes = notes;
    if (status === 'paid') update.paidAt = new Date();

    await Commission.updateMany({ _id: { $in: ids }, tenantId }, update);

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'commission',
      metadata: { ids, status },
    });

    return NextResponse.json({ success: true, data: { updated: ids.length } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to update commissions');
  }
}
