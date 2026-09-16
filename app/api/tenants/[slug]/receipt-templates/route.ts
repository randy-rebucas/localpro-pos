/**
 * Receipt Templates API
 * Handles CRUD operations for receipt templates
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
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
    await connectDB();

    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
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
    await connectDB();

    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
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
    if (isDefault) {
      await Tenant.updateOne(
        { slug },
        { $set: { 'settings.receiptTemplates.templates.$[].isDefault': false } }
      );
      await Tenant.updateOne(
        { slug },
        {
          $push: { 'settings.receiptTemplates.templates': newTemplate },
          $set: { 'settings.receiptTemplates.default': newTemplate.id },
        }
      );
    } else {
      await Tenant.updateOne(
        { slug },
        { $push: { 'settings.receiptTemplates.templates': newTemplate } }
      );
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

    await connectDB();

    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const templates = tenant.settings.receiptTemplates?.templates || [];
    const existingTemplate = templates.find((tpl) => tpl.id === id);

    if (!existingTemplate) {
      return NextResponse.json({ success: false, error: t('validation.templateNotFound', 'Template not found') }, { status: 404 });
    }

    // Atomic per-element update via arrayFilters instead of a read-mutate-save
    // on the whole document, so a concurrent edit to a different template (or
    // the same one) can't be silently lost.
    const elemSet: Record<string, unknown> = { 'settings.receiptTemplates.templates.$[elem].updatedAt': new Date() };
    if (name) elemSet['settings.receiptTemplates.templates.$[elem].name'] = name;
    if (html) elemSet['settings.receiptTemplates.templates.$[elem].html'] = html;

    if (isDefault !== undefined) {
      if (isDefault) {
        await Tenant.updateOne(
          { slug },
          { $set: { 'settings.receiptTemplates.templates.$[].isDefault': false } }
        );
        elemSet['settings.receiptTemplates.templates.$[elem].isDefault'] = true;
        elemSet['settings.receiptTemplates.default'] = id;
        await Tenant.updateOne(
          { slug },
          { $set: elemSet },
          { arrayFilters: [{ 'elem.id': id }] }
        );
      } else {
        elemSet['settings.receiptTemplates.templates.$[elem].isDefault'] = false;
        const unset: Record<string, ''> = {};
        if (tenant.settings.receiptTemplates?.default === id) {
          unset['settings.receiptTemplates.default'] = '';
        }
        await Tenant.updateOne(
          { slug },
          { $set: elemSet, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
          { arrayFilters: [{ 'elem.id': id }] }
        );
      }
    } else {
      await Tenant.updateOne(
        { slug },
        { $set: elemSet },
        { arrayFilters: [{ 'elem.id': id }] }
      );
    }

    const updatedTenant = await Tenant.findOne({ slug }, { 'settings.receiptTemplates': 1 }).lean();
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

    await connectDB();

    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const templates = tenant.settings.receiptTemplates?.templates || [];
    const exists = templates.some((tpl) => tpl.id === id);

    if (!exists) {
      return NextResponse.json({ success: false, error: t('validation.templateNotFound', 'Template not found') }, { status: 404 });
    }

    // Atomic $pull instead of read-filter-save so a concurrent template write
    // to the same document can't be lost.
    await Tenant.updateOne(
      { slug },
      {
        $pull: { 'settings.receiptTemplates.templates': { id } },
        ...(tenant.settings.receiptTemplates?.default === id
          ? { $unset: { 'settings.receiptTemplates.default': '' } }
          : {}),
      }
    );

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
