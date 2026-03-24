/**
 * Receipt Templates API
 * Handles CRUD operations for receipt templates
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { validateTemplate } from '@/lib/receipt-templates';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkBirFeatureAccess } from '@/lib/subscription';

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

    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
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
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch receipt templates');
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

    if (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'owner' && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Rate limit: 30 writes per minute
    const rl = checkRateLimit(`receipt-templates:${user.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;
    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Feature gate
    try {
      await checkBirFeatureAccess(tenant._id.toString(), 'receiptFormatting');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: (featureError as Error).message },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, html, isDefault } = body;

    if (!name || !html) {
      return NextResponse.json({ success: false, error: 'Name and HTML are required' }, { status: 400 });
    }

    const validation = validateTemplate(html);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
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

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.CREATE,
      entityType: 'receipt_template',
      entityId: newTemplate.id,
      changes: { name, isDefault },
    });

    return NextResponse.json({
      success: true,
      data: newTemplate,
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to create receipt template');
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

    // Rate limit: 30 writes per minute
    const rl = checkRateLimit(`receipt-templates:${user.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
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

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const templates = tenant.settings.receiptTemplates?.templates || [];
    const templateIndex = templates.findIndex((t) => t.id === id);

    if (templateIndex === -1) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    if (name) templates[templateIndex].name = name;
    if (html) templates[templateIndex].html = html;
    templates[templateIndex].updatedAt = new Date();

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

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.UPDATE,
      entityType: 'receipt_template',
      entityId: id,
      changes: { name, isDefault },
    });

    return NextResponse.json({
      success: true,
      data: templates[templateIndex],
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update receipt template');
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

    if (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'owner' && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Rate limit: 30 writes per minute
    const rl = checkRateLimit(`receipt-templates:${user.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
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

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const templates = tenant.settings.receiptTemplates?.templates || [];
    const filtered = templates.filter((t) => t.id !== id);

    if (filtered.length === templates.length) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    if (tenant.settings.receiptTemplates?.default === id) {
      tenant.settings.receiptTemplates.default = undefined;
    }

    tenant.settings.receiptTemplates = {
      ...tenant.settings.receiptTemplates,
      templates: filtered,
    };

    tenant.markModified('settings.receiptTemplates');
    await tenant.save();

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.DELETE,
      entityType: 'receipt_template',
      entityId: id,
      changes: {},
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to delete receipt template');
  }
}
