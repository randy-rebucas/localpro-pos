import { NextRequest, NextResponse } from 'next/server';
import { getSystemSettings, setMaintenanceMode } from '@/lib/system-settings';
import { requireRole } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`super-admin-maintenance:${ip}`, 20, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    await requireRole(request, ['super_admin']);

    const settings = await getSystemSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`super-admin-maintenance:${ip}`, 10, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    const user = await requireRole(request, ['super_admin']);

    const body = await request.json();
    const enabled = Boolean(body.enabled);
    const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : null;

    const settings = await setMaintenanceMode(enabled, message, user.userId);

    const defaultTenant = await prisma.tenant.findUnique({ where: { slug: 'default' }, select: { id: true } });
    if (defaultTenant) {
      await createAuditLog(request, {
        tenantId: defaultTenant.id,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'system_settings',
        entityId: 'maintenance_mode',
        changes: { maintenanceMode: enabled, maintenanceMessage: message },
        metadata: { updatedBy: user.userId, role: 'super_admin' },
      });
    }

    return NextResponse.json({ success: true, data: settings });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update settings' },
      { status: 500 }
    );
  }
}
