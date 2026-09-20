import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

// PATCH: mark a notification as read. Only the owning user's personal
// notifications support read-state — a broadcast (userId null) is shared
// across the tenant, so it is intentionally excluded here to avoid one
// user's "read" silently hiding it for everyone else.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const { id } = await params;

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:notifications:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const notification = await prisma.notification.findFirst({
      where: { id, tenantId, userId: user.userId },
    });
    if (!notification) {
      return NextResponse.json({ success: false, error: 'Notification not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const isRead = body.isRead !== undefined ? Boolean(body.isRead) : true;

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { isRead },
    });

    return NextResponse.json({ success: true, data: { ...updated, _id: updated.id } });
  } catch (error) {
    return handleApiError(error, 'Failed to update notification');
  }
}

// DELETE: remove a personal notification
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const { id } = await params;

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:notifications:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const notification = await prisma.notification.findFirst({
      where: { id, tenantId, userId: user.userId },
    });
    if (!notification) {
      return NextResponse.json({ success: false, error: 'Notification not found' }, { status: 404 });
    }

    await prisma.notification.delete({ where: { id: notification.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete notification');
  }
}
