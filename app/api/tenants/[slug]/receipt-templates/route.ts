/**
 * Receipt Templates API
 * Handles CRUD operations for receipt templates
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { validateTemplate } from '@/lib/receipt-templates';
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

    const templates = tenant.settings.receiptTemplates?.templates || [];
    const defaultTemplateId = tenant.settings.receiptTemplates?.default;

    return NextResponse.json({
      success: true,
      data: {
        templates,
        default: defaultTemplateId,
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error fetching receipt templates:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(
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
    const { name, html, isDefault } = body;

    if (!name || !html) {
      return NextResponse.json({ success: false, error: 'Name and HTML are required' }, { status: 400 });
    }

    // Validate template
    const validation = validateTemplate(html);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const templates = tenant.settings.receiptTemplates?.templates || [];
    const newTemplate = {
      id: `template_${Date.now()}`,
      name,
      html,
      isDefault: isDefault || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // If this is set as default, unset others
    if (isDefault) {
      templates.forEach((t) => {
        t.isDefault = false;
      });
      tenant.settings.receiptTemplates = {
        ...tenant.settings.receiptTemplates,
        default: newTemplate.id,
      };
    }

    templates.push(newTemplate);

    tenant.settings.receiptTemplates = {
      ...tenant.settings.receiptTemplates,
      templates,
    };

    tenant.markModified('settings.receiptTemplates');
    await tenant.save();

    return NextResponse.json({
      success: true,
      data: newTemplate,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error creating receipt template:', error);
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
    const { id, name, html, isDefault } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Template ID is required' }, { status: 400 });
    }

    if (html) {
      const validation = validateTemplate(html);
      if (!validation.valid) {
        return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
      }
    }

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const templates = tenant.settings.receiptTemplates?.templates || [];
    const templateIndex = templates.findIndex((t) => t.id === id);

    if (templateIndex === -1) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    // Update template
    if (name) templates[templateIndex].name = name;
    if (html) templates[templateIndex].html = html;
    templates[templateIndex].updatedAt = new Date();

    // Handle default
    if (isDefault !== undefined) {
      if (isDefault) {
        templates.forEach((t) => {
          t.isDefault = false;
        });
        templates[templateIndex].isDefault = true;
        tenant.settings.receiptTemplates = {
          ...tenant.settings.receiptTemplates,
          default: id,
        };
      } else {
        templates[templateIndex].isDefault = false;
        if (tenant.settings.receiptTemplates?.default === id) {
          if (tenant.settings.receiptTemplates) {
            tenant.settings.receiptTemplates.default = undefined;
          }
        }
      }
    }

    tenant.settings.receiptTemplates = {
      ...tenant.settings.receiptTemplates,
      templates,
    };

    tenant.markModified('settings.receiptTemplates');
    await tenant.save();

    return NextResponse.json({
      success: true,
      data: templates[templateIndex],
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error updating receipt template:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Template ID is required' }, { status: 400 });
    }

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const templates = tenant.settings.receiptTemplates?.templates || [];
    const filtered = templates.filter((t) => t.id !== id);

    if (filtered.length === templates.length) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    // If deleted template was default, clear default
    if (tenant.settings.receiptTemplates?.default === id) {
      tenant.settings.receiptTemplates.default = undefined;
    }

    tenant.settings.receiptTemplates = {
      ...tenant.settings.receiptTemplates,
      templates: filtered,
    };

    tenant.markModified('settings.receiptTemplates');
    await tenant.save();

    return NextResponse.json({ success: true });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error deleting receipt template:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
