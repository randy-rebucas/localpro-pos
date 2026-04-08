import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Shift from '@/models/Shift';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';

/**
 * POST /api/shifts/swap-request
 * Body: { shiftId, targetStaffId }
 * The assigned staff requests a swap with another staff member.
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);
    const userId = user.userId;
    const body = await request.json();
    const { shiftId, targetStaffId } = body;

    if (!shiftId || !targetStaffId) {
      return NextResponse.json({ success: false, error: 'shiftId and targetStaffId are required' }, { status: 400 });
    }

    const shift = await Shift.findOne({ _id: shiftId, tenantId });
    if (!shift) return NextResponse.json({ success: false, error: 'Shift not found' }, { status: 404 });

    if (shift.staffId.toString() !== userId) {
      return NextResponse.json({ success: false, error: 'You can only request swaps for your own shifts' }, { status: 403 });
    }

    await Shift.findOneAndUpdate({ _id: shiftId, tenantId }, {
      status: 'swap_requested',
      swapRequestedTo: targetStaffId,
    });

    return NextResponse.json({ success: true, data: { message: 'Swap request sent' } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to request shift swap');
  }
}
