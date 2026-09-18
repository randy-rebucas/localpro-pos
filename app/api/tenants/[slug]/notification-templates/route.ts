/**
 * Notification Templates API
 * Handles CRUD operations for email and SMS notification templates
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { validateNotificationTemplate } from '@/lib/notification-templates';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';

// Maps the old Mongoose `settings.notificationTemplates.<type>.<category>` dot-path
// to the flattened TenantSettings column (see prisma/schema.prisma).
const TEMPLATE_COLUMN_MAP: Record<string, Record<string, string>> = {
  email: {
    bookingConfirmation: 'emailBookingConfirmationTemplate',
    bookingReminder: 'emailBookingReminderTemplate',
    bookingCancellation: 'emailBookingCancellationTemplate',
    lowStockAlert: 'emailLowStockAlertTemplate',
    attendanceAlert: 'emailAttendanceAlertTemplate',
  },
  sms: {
    bookingConfirmation: 'smsBookingConfirmationTemplate',
    bookingReminder: 'smsBookingReminderTemplate',
    bookingCancellation: 'smsBookingCancellationTemplate',
    lowStockAlert: 'smsLowStockAlertTemplate',
  },
};

function templatesFromSettings(settings: Record<string, unknown> | null | undefined) {
  const result: Record<string, Record<string, string>> = {};
  for (const [type, categories] of Object.entries(TEMPLATE_COLUMN_MAP)) {
    for (const [key, column] of Object.entries(categories)) {
      const value = settings?.[column];
      if (value !== null && value !== undefined) {
        result[type] = result[type] || {};
        result[type][key] = value as string;
      }
    }
  }
  return result;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    const tenant = await prisma.tenant.findFirst({ where: { slug }, include: { settings: true } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: templatesFromSettings(tenant.settings as unknown as Record<string, unknown>),
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching notification templates:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'owner' && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`notification-templates:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;
    const body = await request.json();
    const { type, category, subcategory, subject, body: templateBody } = body;

    if (!type || !category || !templateBody) {
      return NextResponse.json({ success: false, error: 'Type, category, and body are required' }, { status: 400 });
    }

    // Validate template
    const validation = validateNotificationTemplate(templateBody);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const key = subcategory || category;
    const value = type === 'email' && subject ? `${subject}|${templateBody}` : templateBody;

    const column = TEMPLATE_COLUMN_MAP[type]?.[key];
    if (!column) {
      return NextResponse.json({ success: false, error: `Unknown notification template category: ${type}.${key}` }, { status: 400 });
    }

    const updated = await prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, [column]: value },
      update: { [column]: value },
    });

    const templates = templatesFromSettings(updated as unknown as Record<string, unknown>);

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'notification_template',
      entityId: `${type}.${key}`,
      changes: { subject, body: templateBody },
    });

    return NextResponse.json({
      success: true,
      data: templates,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error updating notification template:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
