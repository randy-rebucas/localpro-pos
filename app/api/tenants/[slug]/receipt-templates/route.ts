/**
 * Receipt Templates API
 * Handles CRUD operations for receipt templates
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma, { dbTransaction } from '@/lib/db';
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
    const tenant = await prisma.tenant.findFirst({
      where: { slug },
      include: { settings: true, receiptTemplates: true },
    });
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        templates: tenant.receiptTemplates.map((tpl) => ({
          id: tpl.id,
          name: tpl.name,
          html: tpl.html,
          isDefault: tpl.isDefault,
          createdAt: tpl.createdAt,
          updatedAt: tpl.updatedAt,
        })),
        default: tenant.settings?.receiptDefaultTemplateId ?? undefined,
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
    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
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
      return NextResponse.json({ success: false, error: t('validation.nameAndHtmlRequired', 'Name and HTML are required') }, { status: 400 });
    }

    const validation = validateTemplate(html);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const id = `template_${Date.now()}`;

    // Transactional so the "clear other defaults" + "insert + set default" steps
    // can't be interleaved by a concurrent write on the same tenant (matches
    // the previous atomic multi-step Mongoose updateOne() sequence).
    const created = await dbTransaction(async (tx) => {
      if (isDefault) {
        await tx.tenantReceiptTemplate.updateMany({
          where: { tenantId: tenant.id },
          data: { isDefault: false },
        });
      }
      const tpl = await tx.tenantReceiptTemplate.create({
        data: { id, tenantId: tenant.id, name, html, isDefault: !!isDefault },
      });
      if (isDefault) {
        await tx.tenantSettings.upsert({
          where: { tenantId: tenant.id },
          create: { tenantId: tenant.id, receiptDefaultTemplateId: id },
          update: { receiptDefaultTemplateId: id },
        });
      }
      return tpl;
    });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'receipt_template',
      entityId: created.id,
      changes: { name, isDefault },
    });

    return NextResponse.json({
      success: true,
      data: created,
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

    const tenant = await prisma.tenant.findFirst({ where: { slug }, include: { settings: true } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const existingTemplate = await prisma.tenantReceiptTemplate.findFirst({ where: { id, tenantId: tenant.id } });
    if (!existingTemplate) {
      return NextResponse.json({ success: false, error: t('validation.templateNotFound', 'Template not found') }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (html) data.html = html;

    const updated = await dbTransaction(async (tx) => {
      if (isDefault !== undefined) {
        if (isDefault) {
          await tx.tenantReceiptTemplate.updateMany({
            where: { tenantId: tenant.id },
            data: { isDefault: false },
          });
          data.isDefault = true;
          await tx.tenantSettings.upsert({
            where: { tenantId: tenant.id },
            create: { tenantId: tenant.id, receiptDefaultTemplateId: id },
            update: { receiptDefaultTemplateId: id },
          });
        } else {
          data.isDefault = false;
          if (tenant.settings?.receiptDefaultTemplateId === id) {
            await tx.tenantSettings.update({
              where: { tenantId: tenant.id },
              data: { receiptDefaultTemplateId: null },
            });
          }
        }
      }

      return tx.tenantReceiptTemplate.update({
        where: { id },
        data,
      });
    });

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
      data: updated,
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

    const tenant = await prisma.tenant.findFirst({ where: { slug }, include: { settings: true } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const exists = await prisma.tenantReceiptTemplate.findFirst({ where: { id, tenantId: tenant.id } });
    if (!exists) {
      return NextResponse.json({ success: false, error: t('validation.templateNotFound', 'Template not found') }, { status: 404 });
    }

    await dbTransaction(async (tx) => {
      await tx.tenantReceiptTemplate.deleteMany({ where: { id, tenantId: tenant.id } });
      if (tenant.settings?.receiptDefaultTemplateId === id) {
        await tx.tenantSettings.update({
          where: { tenantId: tenant.id },
          data: { receiptDefaultTemplateId: null },
        });
      }
    });

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
