import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Shift from '@/models/Shift';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import mongoose from 'mongoose';

/** Validate HH:mm time string */
function isValidTime(t: string): boolean {
  return /^\d{2}:\d{2}$/.test(t) && (() => {
    const [h, m] = t.split(':').map(Number);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  })();
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const params = request.nextUrl.searchParams;

    const query: Record<string, unknown> = { tenantId };

    if (params.get('weekStart')) {
      const weekStart = new Date(params.get('weekStart')!);
      if (isNaN(weekStart.getTime())) {
        return NextResponse.json({ success: false, error: 'Invalid weekStart date' }, { status: 400 });
      }
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      query.date = { $gte: weekStart, $lt: weekEnd };
    }
    if (params.get('staffId')) query.staffId = new mongoose.Types.ObjectId(params.get('staffId')!);
    if (params.get('branchId')) query.branchId = new mongoose.Types.ObjectId(params.get('branchId')!);

    const shifts = await Shift.find(query)
      .populate('staffId', 'name email role')
      .populate('branchId', 'name')
      .sort({ date: 1, startTime: 1 })
      .lean();

    return NextResponse.json({ success: true, data: shifts });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to list shifts');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);
    const userId = user.userId;
    const body = await request.json();
    const { staffId, branchId, date, startTime, endTime, role, notes } = body;

    if (!staffId || !date || !startTime || !endTime) {
      return NextResponse.json(
        { success: false, error: 'staffId, date, startTime, and endTime are required' },
        { status: 400 }
      );
    }

    const shiftDate = new Date(date);
    if (isNaN(shiftDate.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid date' }, { status: 400 });
    }

    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      return NextResponse.json({ success: false, error: 'Times must be in HH:mm format' }, { status: 400 });
    }

    if (startTime >= endTime) {
      return NextResponse.json({ success: false, error: 'endTime must be after startTime' }, { status: 400 });
    }

    // Prevent duplicate: same staff, same date, overlapping times
    const dayStart = new Date(shiftDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(shiftDate);
    dayEnd.setHours(23, 59, 59, 999);

    const overlap = await Shift.findOne({
      tenantId,
      staffId,
      date: { $gte: dayStart, $lte: dayEnd },
      $or: [
        { startTime: { $lt: endTime }, endTime: { $gt: startTime } },
      ],
    });

    if (overlap) {
      return NextResponse.json(
        { success: false, error: 'Staff already has an overlapping shift on this date' },
        { status: 409 }
      );
    }

    const shift = await Shift.create({
      tenantId,
      staffId,
      branchId,
      date: shiftDate,
      startTime,
      endTime,
      role,
      notes,
      createdBy: userId,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'shift',
      entityId: shift._id.toString(),
      metadata: { staffId, date, startTime, endTime },
    });

    return NextResponse.json({ success: true, data: shift }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to create shift');
  }
}
