import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();

    const prescription = await Prescription.findOne({ _id: id, tenantId: user.tenantId }).lean();
    if (!prescription) {
      return NextResponse.json({ success: false, error: 'Prescription not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: prescription });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch prescription');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!['owner', 'admin', 'manager'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`prescription-update:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { id } = await params;
    await connectDB();

    const prescription = await Prescription.findOne({ _id: id, tenantId: user.tenantId });
    if (!prescription) {
      return NextResponse.json({ success: false, error: 'Prescription not found' }, { status: 404 });
    }

    if (['dispensed', 'cancelled'].includes(prescription.status)) {
      return NextResponse.json(
        { success: false, error: 'Cannot edit a dispensed or cancelled prescription' },
        { status: 409 }
      );
    }

    const body = await request.json();
    const allowed = ['notes', 'scannedCopy', 'doctorClinic'] as const;
    for (const key of allowed) {
      if (body[key] !== undefined) prescription.set(key, body[key]);
    }

    await prescription.save();

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.PRESCRIPTION_UPDATE,
      entityType: 'prescription',
      entityId: id,
      changes: body,
    });

    return NextResponse.json({ success: true, data: prescription });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update prescription');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!['owner', 'admin'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    await connectDB();

    const prescription = await Prescription.findOne({ _id: id, tenantId: user.tenantId });
    if (!prescription) {
      return NextResponse.json({ success: false, error: 'Prescription not found' }, { status: 404 });
    }

    // Cancel instead of hard delete to preserve audit trail
    prescription.status = 'cancelled';
    await prescription.save();

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.PRESCRIPTION_CANCEL,
      entityType: 'prescription',
      entityId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to cancel prescription');
  }
}
