/**
 * Notification Templates API
 * Handles CRUD operations for email and SMS notification templates
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { validateNotificationTemplate } from '@/lib/notification-templates';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';

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
    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: tenant.settings.notificationTemplates || {},
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

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const key = subcategory || category;
    const value = type === 'email' && subject ? `${subject}|${templateBody}` : templateBody;

    // Atomic $set on the specific dot-path avoids clobbering concurrent edits to
    // other template categories (a full read-modify-write of the whole
    // notificationTemplates object + tenant.save() could lose them).
    await Tenant.updateOne(
      { _id: tenant._id },
      { $set: { [`settings.notificationTemplates.${type}.${key}`]: value } }
    );

    const updatedTenant = await Tenant.findOne({ _id: tenant._id }).select('settings.notificationTemplates').lean();
    const templates = updatedTenant?.settings?.notificationTemplates || {};

    await createAuditLog(request, {
      tenantId: tenant._id,
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
