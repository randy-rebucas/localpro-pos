import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { listDevices, createDevice } from '@/lib/data/devices';
import { Prisma } from '@prisma/client';

function serializeDevice(device: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { id, branch, registeredByUser, ...rest } = device;
  return {
    _id: id,
    ...rest,
    branchId: branch ? { _id: branch.id, name: branch.name } : rest.branchId,
    registeredBy: registeredByUser ? { _id: registeredByUser.id, name: registeredByUser.name, email: registeredByUser.email } : rest.registeredBy,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const searchParams = request.nextUrl.searchParams;
    const isActive = searchParams.get('isActive');

    const devices = await listDevices(
      tenantId,
      searchParams.has('isActive') ? isActive === 'true' : undefined
    );

    return NextResponse.json({ success: true, data: devices.map(serializeDevice) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch devices');
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    if (!(await hasTenantPermission(user.role, tenantId, 'devices.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }
    const t = await getValidationTranslatorFromRequest(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:devices:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { label, serialNumber, terminalId, branchId, ptuNumber, ptuStatus } = body;

    if (!label || !serialNumber || !terminalId) {
      return NextResponse.json(
        { success: false, error: t('validation.deviceFieldsRequired', 'Label, serial number, and terminal ID are required') },
        { status: 400 }
      );
    }

    let device;
    try {
      device = await createDevice({
        tenantId,
        branchId: branchId || undefined,
        label,
        serialNumber,
        terminalId,
        ptuNumber: ptuNumber || undefined,
        ptuStatus: ptuStatus || 'pending',
        registeredBy: user.userId,
      });
    } catch (createErr: unknown) {
      if (createErr instanceof Prisma.PrismaClientKnownRequestError && createErr.code === 'P2002') {
        return NextResponse.json(
          { success: false, error: t('validation.deviceDuplicate', 'A device with this terminal ID or serial number already exists') },
          { status: 409 }
        );
      }
      throw createErr;
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DEVICE_CREATE,
      entityType: 'device',
      entityId: device.id,
      changes: { label, serialNumber, terminalId, branchId, ptuNumber, ptuStatus },
    });

    return NextResponse.json({ success: true, data: { _id: device.id, ...device } }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create device');
  }
}
