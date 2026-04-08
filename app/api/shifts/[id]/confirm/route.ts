import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Shift from '@/models/Shift';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';

/**
 * POST /api/shifts/[id]/confirm — Staff confirms their shift
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);
    const userId = user.userId;
    const { id } = await params;

    const shift = await Shift.findOne({ _id: id, tenantId });
    if (!shift) return NextResponse.json({ success: false, error: 'Shift not found' }, { status: 404 });

    // Only the assigned staff or a manager+ can confirm
    const isAssignedStaff = shift.staffId.toString() === userId;
    if (!isAssignedStaff) {
      return NextResponse.json({ success: false, error: 'You can only confirm your own shifts' }, { status: 403 });
    }

    await Shift.findOneAndUpdate({ _id: id, tenantId }, { status: 'confirmed' });
    return NextResponse.json({ success: true, data: { message: 'Shift confirmed' } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to confirm shift');
  }
}
