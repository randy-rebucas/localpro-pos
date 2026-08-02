import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { getDeviceById, updateDevice } from '@/lib/data/devices';
import { Prisma } from '@prisma/client';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    if (!(await hasTenantPermission(user.role, tenantId, 'devices.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:devices:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const oldDevice = await getDeviceById(id, tenantId);
    if (!oldDevice) {
      return NextResponse.json({ success: false, error: t('validation.deviceNotFound', 'Device not found') }, { status: 404 });
    }

    const body = await request.json();
    const { label, serialNumber, terminalId, branchId, ptuNumber, ptuStatus, isActive } = body;

    const updateData: Record<string, unknown> = {};
    if (label !== undefined) updateData.label = label;
    if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
    if (terminalId !== undefined) updateData.terminalId = terminalId;
    if (branchId !== undefined) updateData.branchId = branchId || null;
    if (ptuNumber !== undefined) updateData.ptuNumber = ptuNumber;
    if (ptuStatus !== undefined) updateData.ptuStatus = ptuStatus;
    if (isActive !== undefined) updateData.isActive = isActive;

    let device;
    try {
      device = await updateDevice(id, tenantId, updateData);
    } catch (saveErr: unknown) {
      if (saveErr instanceof Prisma.PrismaClientKnownRequestError && saveErr.code === 'P2002') {
        return NextResponse.json(
          { success: false, error: t('validation.deviceDuplicate', 'A device with this terminal ID or serial number already exists') },
          { status: 409 }
        );
      }
      throw saveErr;
    }
    if (!device) {
      return NextResponse.json({ success: false, error: t('validation.deviceNotFound', 'Device not found') }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DEVICE_UPDATE,
      entityType: 'device',
      entityId: device.id,
      changes: { before: oldDevice, after: device },
    });

    return NextResponse.json({ success: true, data: { _id: device.id, ...device } });
  } catch (error) {
    return handleApiError(error, 'Failed to update device');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    if (!(await hasTenantPermission(user.role, tenantId, 'devices.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:devices:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const existing = await getDeviceById(id, tenantId);
    if (!existing) {
      return NextResponse.json({ success: false, error: t('validation.deviceNotFound', 'Device not found') }, { status: 404 });
    }

    // Soft delete — preserve device history for receipts/audit already issued
    const device = await updateDevice(id, tenantId, { isActive: false });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DEVICE_DELETE,
      entityType: 'device',
      entityId: id,
      changes: { label: device?.label, terminalId: device?.terminalId },
    });

    return NextResponse.json({ success: true, message: t('validation.deviceDeactivated', 'Device deactivated') });
  } catch (error) {
    return handleApiError(error, 'Failed to delete device');
  }
}
