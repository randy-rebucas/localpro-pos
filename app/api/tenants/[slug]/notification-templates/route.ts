/**
 * Notification Templates API
 * Handles CRUD operations for email and SMS notification templates
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { validateNotificationTemplate } from '@/lib/notification-templates';
import { getCurrentUser } from '@/lib/auth';

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

    return NextResponse.json({
      success: true,
      data: tenant.settings.notificationTemplates || {},
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error fetching notification templates:', error);
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

    if (user.role !== 'admin' && user.role !== 'manager') {
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

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const templates = tenant.settings.notificationTemplates || {};
    const key = subcategory || category;

    if (type === 'email') {
      templates.email = templates.email || {};
      if (subject) {
        // Store subject and body together
        templates.email[key as keyof typeof templates.email] = `${subject}|${templateBody}`;
      } else {
        templates.email[key as keyof typeof templates.email] = templateBody;
      }
    } else if (type === 'sms') {
      templates.sms = templates.sms || {};
      templates.sms[key as keyof typeof templates.sms] = templateBody;
    }

    tenant.settings.notificationTemplates = templates;
    tenant.markModified('settings.notificationTemplates');
    await tenant.save();

    return NextResponse.json({
      success: true,
      data: templates,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error updating notification template:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
