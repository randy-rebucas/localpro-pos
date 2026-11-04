import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type Patch, type Prescription } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
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

    const prescription = await getRepos().prescriptions.findById(user.tenantId, id);
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

    if (!(await hasTenantPermission(user.role, user.tenantId, 'prescriptions.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`prescription-update:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { id } = await params;

    const { prescriptions } = getRepos();
    const prescription = await prescriptions.findById(user.tenantId, id);
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
    const patch: Patch<Pick<Prescription, (typeof allowed)[number]>> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) patch[key] = body[key];
    }

    const result = await prescriptions.update(user.tenantId, id, patch);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Prescription not found' }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.PRESCRIPTION_UPDATE,
      entityType: 'prescription',
      entityId: id,
      changes: body,
    });

    return NextResponse.json({ success: true, data: result.after });
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

    if (!(await hasTenantPermission(user.role, user.tenantId, 'prescriptions.delete'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Cancel instead of hard delete to preserve audit trail
    const result = await getRepos().prescriptions.update(user.tenantId, id, { status: 'cancelled' });
    if (!result) {
      return NextResponse.json({ success: false, error: 'Prescription not found' }, { status: 404 });
    }

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
