/**
 * Receipt Templates API
 * Handles CRUD operations for receipt templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type TenantUpdate } from '@/lib/db';
import { validateTemplate } from '@/lib/receipt-templates';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkBirFeatureAccess } from '@/lib/subscription';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const t = await getValidationTranslatorFromRequest(request);
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });
    }

    const { slug } = await params;

    const tenant = await getRepos().tenants.findBySlug(slug, { select: 'settings.receiptTemplates' });
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const templates = tenant.settings?.receiptTemplates?.templates || [];
    const defaultTemplateId = tenant.settings?.receiptTemplates?.default;

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
    const t = await getValidationTranslatorFromRequest(request);
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'receipt_templates.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    // Rate limit: 30 writes per minute
    const rl = checkRateLimit(`receipt-templates:${user.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const { slug } = await params;

    const tenant = await getRepos().tenants.findBySlug(slug, { select: 'settings.receiptTemplates' });
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    // Feature gate
    try {
      await checkBirFeatureAccess(tenant._id, 'receiptFormatting');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: (featureError as Error).message },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, html, isDefault } = body;

    if (!name || !html) {
      return NextResponse.json({ success: false, error: t('validation.nameAndHtmlRequired', 'Name and HTML are required') }, { status: 400 });
    }

    const validation = validateTemplate(html);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const newTemplate = {
      id: `template_${Date.now()}`,
      name,
      html,
      isDefault: isDefault || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Atomic push (+ atomic default-flag clear when applicable) instead of a
    // read-mutate-save on the whole document, so two concurrent template writes
    // (e.g. two browser tabs) can't clobber each other's array changes.
    const { tenants } = getRepos();
    if (isDefault) {
      await tenants.update(tenant._id, {
        setOnAllItems: { path: 'settings.receiptTemplates.templates', set: { isDefault: false } },
      });
      await tenants.update(tenant._id, {
        push: { 'settings.receiptTemplates.templates': newTemplate },
        set: { 'settings.receiptTemplates.default': newTemplate.id },
      });
    } else {
      await tenants.update(tenant._id, { push: { 'settings.receiptTemplates.templates': newTemplate } });
    }

    await createAuditLog(request, {
      tenantId: tenant._id,
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
    const t = await getValidationTranslatorFromRequest(request);
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'receipt_templates.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    // Rate limit: 30 writes per minute
    const rl = checkRateLimit(`receipt-templates:${user.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const { slug } = await params;
    const body = await request.json();
    const { id, name, html, isDefault } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: t('validation.templateIdRequired', 'Template ID is required') }, { status: 400 });
    }

    if (html) {
      const validation = validateTemplate(html);
      if (!validation.valid) {
        return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
      }
    }

    const tenant = await getRepos().tenants.findBySlug(slug, { select: 'settings.receiptTemplates' });
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const templates = tenant.settings?.receiptTemplates?.templates || [];
    const existingTemplate = templates.find((tpl) => tpl.id === id);

    if (!existingTemplate) {
      return NextResponse.json({ success: false, error: t('validation.templateNotFound', 'Template not found') }, { status: 404 });
    }

    // Atomic per-element update via arrayFilters instead of a read-mutate-save
    // on the whole document, so a concurrent edit to a different template (or
    // the same one) can't be silently lost.
    const { tenants } = getRepos();
    const itemSet: Record<string, unknown> = { updatedAt: new Date() };
    if (name) itemSet.name = name;
    if (html) itemSet.html = html;
    const path = 'settings.receiptTemplates.templates' as const;

    let ops: TenantUpdate;
    if (isDefault !== undefined) {
      if (isDefault) {
        await tenants.update(tenant._id, { setOnAllItems: { path, set: { isDefault: false } } });
        ops = {
          setOnItem: { path, id, set: { ...itemSet, isDefault: true } },
          set: { 'settings.receiptTemplates.default': id },
        };
      } else {
        ops = {
          setOnItem: { path, id, set: { ...itemSet, isDefault: false } },
          ...(tenant.settings?.receiptTemplates?.default === id ? { unset: ['settings.receiptTemplates.default' as const] } : {}),
        };
      }
    } else {
      ops = { setOnItem: { path, id, set: itemSet } };
    }
    // Returns the updated tenant (null if the template was removed meanwhile)
    const updatedTenant = await tenants.update(tenant._id, ops);
    const updatedTemplate = updatedTenant?.settings.receiptTemplates?.templates?.find((tpl) => tpl.id === id);

    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'receipt_template',
      entityId: id,
      changes: { name, isDefault },
    });

    return NextResponse.json({
      success: true,
      data: updatedTemplate,
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
    const t = await getValidationTranslatorFromRequest(request);
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'receipt_templates.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    // Rate limit: 30 writes per minute
    const rl = checkRateLimit(`receipt-templates:${user.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: t('validation.templateIdRequired', 'Template ID is required') }, { status: 400 });
    }

    const tenant = await getRepos().tenants.findBySlug(slug, { select: 'settings.receiptTemplates' });
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const templates = tenant.settings?.receiptTemplates?.templates || [];
    const exists = templates.some((tpl) => tpl.id === id);

    if (!exists) {
      return NextResponse.json({ success: false, error: t('validation.templateNotFound', 'Template not found') }, { status: 404 });
    }

    // Atomic $pull instead of read-filter-save so a concurrent template write
    // to the same document can't be lost.
    await getRepos().tenants.update(tenant._id, {
      pull: { 'settings.receiptTemplates.templates': { id } },
      ...(tenant.settings?.receiptTemplates?.default === id
        ? { unset: ['settings.receiptTemplates.default' as const] }
        : {}),
    });

    await createAuditLog(request, {
      tenantId: tenant._id,
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
