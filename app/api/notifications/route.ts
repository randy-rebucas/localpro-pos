import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

function toNotificationJSON(n: { id: string; [key: string]: unknown }) {
  return { ...n, _id: n.id };
}

// GET: list notifications visible to the current user (their own + tenant-wide broadcasts)
export async function GET(request: NextRequest) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:notifications:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 200);

    const where: Prisma.NotificationWhereInput = {
      tenantId,
      OR: [{ userId: user.userId }, { userId: null }],
    };
    if (unreadOnly) {
      where.isRead = false;
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({
        where: { tenantId, OR: [{ userId: user.userId }, { userId: null }], isRead: false },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: notifications.map(toNotificationJSON),
      unreadCount,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch notifications');
  }
}

// POST: create a notification for a specific user, or broadcast to the whole tenant (userId omitted)
export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    if (!(await hasTenantPermission(user.role, tenantId, 'settings.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:notifications:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { userId, type, title, message, link } = body;

    if (!type || !title || !message) {
      return NextResponse.json({ success: false, error: 'type, title, and message are required' }, { status: 400 });
    }
    if (typeof title === 'string' && title.length > 200) {
      return NextResponse.json({ success: false, error: 'Title must be 200 characters or less' }, { status: 400 });
    }
    if (typeof message === 'string' && message.length > 1000) {
      return NextResponse.json({ success: false, error: 'Message must be 1000 characters or less' }, { status: 400 });
    }

    if (userId) {
      const targetUser = await prisma.user.findFirst({ where: { id: userId, tenantId } });
      if (!targetUser) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }
    }

    const notification = await prisma.notification.create({
      data: {
        id: randomUUID(),
        tenantId,
        userId: userId || undefined,
        type,
        title,
        message,
        link: link || undefined,
      },
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'notification',
      entityId: notification.id,
      changes: { type, title, broadcast: !userId },
    });

    return NextResponse.json({ success: true, data: toNotificationJSON(notification) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create notification');
  }
}
