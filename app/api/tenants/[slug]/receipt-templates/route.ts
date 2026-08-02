/**
 * Receipt Templates API
 * Handles CRUD operations for receipt templates
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateTemplate } from '@/lib/receipt-templates';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkBirFeatureAccess } from '@/lib/subscription';
import { getTenantBySlug, getTenantBySlugAny } from '@/lib/data/tenants';

interface ReceiptTemplate {
  id: string;
  name: string;
  html: string;
  isDefault: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
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

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const settings = (tenant.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const templates: ReceiptTemplate[] = settings.receiptTemplates?.templates || [];
    const defaultTemplateId = settings.receiptTemplates?.default;

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

    if (!(await hasTenantPermission(user.role, user.tenantId, 'receipt_templates.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Rate limit: 30 writes per minute
    const rl = checkRateLimit(`receipt-templates:${user.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Feature gate
    try {
      await checkBirFeatureAccess(tenant.id, 'receiptFormatting');
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

    const existingSettings = (tenant.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const templates: ReceiptTemplate[] = existingSettings.receiptTemplates?.templates || [];
    const newTemplate: ReceiptTemplate = {
      id: `template_${Date.now()}`,
      name,
      html,
      isDefault: isDefault || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let defaultTemplateId = existingSettings.receiptTemplates?.default;
    if (isDefault) {
      templates.forEach((t) => {
        t.isDefault = false;
      });
      defaultTemplateId = newTemplate.id;
    }

    templates.push(newTemplate);

    const settings = {
      ...existingSettings,
      receiptTemplates: {
        ...existingSettings.receiptTemplates,
        templates,
        default: defaultTemplateId,
      },
    };
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings } });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
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

    if (!(await hasTenantPermission(user.role, user.tenantId, 'receipt_templates.manage'))) {
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

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const existingSettings = (tenant.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const templates: ReceiptTemplate[] = existingSettings.receiptTemplates?.templates || [];
    const templateIndex = templates.findIndex((t) => t.id === id);

    if (templateIndex === -1) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    if (name) templates[templateIndex].name = name;
    if (html) templates[templateIndex].html = html;
    templates[templateIndex].updatedAt = new Date();

    let defaultTemplateId = existingSettings.receiptTemplates?.default;
    if (isDefault !== undefined) {
      if (isDefault) {
        templates.forEach((t) => {
          t.isDefault = false;
        });
        templates[templateIndex].isDefault = true;
        defaultTemplateId = id;
      } else {
        templates[templateIndex].isDefault = false;
        if (defaultTemplateId === id) {
          defaultTemplateId = undefined;
        }
      }
    }

    const settings = {
      ...existingSettings,
      receiptTemplates: {
        ...existingSettings.receiptTemplates,
        templates,
        default: defaultTemplateId,
      },
    };
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings } });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
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

    if (!(await hasTenantPermission(user.role, user.tenantId, 'receipt_templates.manage'))) {
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

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const existingSettings = (tenant.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const templates: ReceiptTemplate[] = existingSettings.receiptTemplates?.templates || [];
    const filtered = templates.filter((t) => t.id !== id);

    if (filtered.length === templates.length) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    let defaultTemplateId = existingSettings.receiptTemplates?.default;
    if (defaultTemplateId === id) {
      defaultTemplateId = undefined;
    }

    const settings = {
      ...existingSettings,
      receiptTemplates: {
        ...existingSettings.receiptTemplates,
        templates: filtered,
        default: defaultTemplateId,
      },
    };
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings } });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
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
