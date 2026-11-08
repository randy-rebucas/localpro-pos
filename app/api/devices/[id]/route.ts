import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Device from '@/models/Device';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { tenantBranchExists } from '@/lib/device-identity-server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
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

    const device = await Device.findOne({ _id: id, tenantId });
    if (!device) {
      return NextResponse.json({ success: false, error: t('validation.deviceNotFound', 'Device not found') }, { status: 404 });
    }

    const body = await request.json();
    const { branchId, ptuNumber, ptuStatus, isActive } = body;
    const trimmed = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);
    const label = trimmed(body.label);
    const serialNumber = trimmed(body.serialNumber);
    const terminalId = trimmed(body.terminalId);

    if ((body.label !== undefined && !label) || (body.serialNumber !== undefined && !serialNumber) || (body.terminalId !== undefined && !terminalId)) {
      return NextResponse.json(
        { success: false, error: t('validation.deviceFieldsRequired', 'Label, serial number, and terminal ID are required') },
        { status: 400 }
      );
    }
    // The list populates the branch name, so a branch id from another tenant would leak it.
    if (branchId && !(await tenantBranchExists(branchId, tenantId))) {
      return NextResponse.json({ success: false, error: t('validation.deviceBranchInvalid', 'The chosen branch is not part of this store') }, { status: 400 });
    }
    if (ptuStatus !== undefined && ptuStatus !== 'pending' && ptuStatus !== 'approved') {
      return NextResponse.json({ success: false, error: 'Invalid PTU status' }, { status: 400 });
    }

    const oldData = device.toObject();

    if (label) device.label = label;
    if (serialNumber) device.serialNumber = serialNumber;
    if (terminalId) device.terminalId = terminalId;
    if (branchId !== undefined) device.set('branchId', branchId || undefined);
    if (ptuNumber !== undefined) device.set('ptuNumber', trimmed(ptuNumber) || undefined);
    if (ptuStatus !== undefined) device.ptuStatus = ptuStatus;
    if (typeof isActive === 'boolean') device.isActive = isActive;

    try {
      await device.save();
    } catch (saveErr: unknown) {
      if (saveErr instanceof Error && 'code' in saveErr && (saveErr as { code?: number }).code === 11000) {
        return NextResponse.json(
          { success: false, error: t('validation.deviceDuplicate', 'A device with this terminal ID or serial number already exists') },
          { status: 409 }
        );
      }
      throw saveErr;
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DEVICE_UPDATE,
      entityType: 'device',
      entityId: device._id.toString(),
      changes: { before: oldData, after: device.toObject() },
    });

    return NextResponse.json({ success: true, data: device });
  } catch (error) {
    return handleApiError(error, 'Failed to update device');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
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

    const device = await Device.findOne({ _id: id, tenantId });
    if (!device) {
      return NextResponse.json({ success: false, error: t('validation.deviceNotFound', 'Device not found') }, { status: 404 });
    }

    // Soft delete — preserve device history for receipts/audit already issued
    device.isActive = false;
    await device.save();

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DEVICE_DELETE,
      entityType: 'device',
      entityId: device._id.toString(),
      changes: { label: device.label, terminalId: device.terminalId },
    });

    return NextResponse.json({ success: true, message: t('validation.deviceDeactivated', 'Device deactivated') });
  } catch (error) {
    return handleApiError(error, 'Failed to delete device');
  }
}
