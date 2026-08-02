/**
 * Notification Templates API
 * Handles CRUD operations for email and SMS notification templates
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateNotificationTemplate } from '@/lib/notification-templates';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getTenantBySlugAny } from '@/lib/data/tenants';

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

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const settings = (tenant.settings as Record<string, unknown>) || {};
    return NextResponse.json({
      success: true,
      data: settings.notificationTemplates || {},
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

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const existingSettings = (tenant.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const templates = existingSettings.notificationTemplates || {};
    const key = subcategory || category;

    if (type === 'email') {
      templates.email = templates.email || {};
      if (subject) {
        // Store subject and body together
        templates.email[key] = `${subject}|${templateBody}`;
      } else {
        templates.email[key] = templateBody;
      }
    } else if (type === 'sms') {
      templates.sms = templates.sms || {};
      templates.sms[key] = templateBody;
    }

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { settings: { ...existingSettings, notificationTemplates: templates } },
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
