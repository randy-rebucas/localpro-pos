import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';

function prescriptionToApi(p: { id: string; items?: Array<{ id: string; [key: string]: unknown }>; [key: string]: unknown }) {
  const { id, items, ...rest } = p;
  return {
    _id: id,
    ...rest,
    ...(items ? { items: items.map(({ id: itemId, ...itemRest }) => ({ _id: itemId, ...itemRest })) } : {}),
  };
}

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

    const prescription = await prisma.prescription.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { items: true },
    });
    if (!prescription) {
      return NextResponse.json({ success: false, error: 'Prescription not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: prescriptionToApi(prescription) });
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

    const prescription = await prisma.prescription.findFirst({ where: { id, tenantId: user.tenantId } });
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
    const allowedFields = ['notes', 'scannedCopy', 'doctorClinic'] as const;
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const updated = await prisma.prescription.update({
      where: { id },
      data: updates,
      include: { items: true },
    });

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.PRESCRIPTION_UPDATE,
      entityType: 'prescription',
      entityId: id,
      changes: body,
    });

    return NextResponse.json({ success: true, data: prescriptionToApi(updated) });
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

    const prescription = await prisma.prescription.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!prescription) {
      return NextResponse.json({ success: false, error: 'Prescription not found' }, { status: 404 });
    }

    // Cancel instead of hard delete to preserve audit trail
    await prisma.prescription.update({ where: { id }, data: { status: 'cancelled' } });

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
