import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma, { dbTransaction } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const bundle = await prisma.productBundle.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, price: true, stock: true } },
          },
        },
        category: { select: { id: true, name: true } },
      },
    });

    if (!bundle) {
      return NextResponse.json({ success: false, error: t('validation.bundleNotFound', 'Bundle not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: bundle });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching bundle:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'bundles.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const existing = await prisma.productBundle.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Bundle not found' }, { status: 404 });
    }

    const body = await request.json();
    const oldData = existing;

    const updateData: Prisma.ProductBundleUpdateInput = {};
    if (body.name) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.price !== undefined) updateData.price = body.price;
    if (body.sku !== undefined) updateData.sku = body.sku;
    if (body.categoryId !== undefined) {
      updateData.category = body.categoryId
        ? { connect: { id: body.categoryId } }
        : { disconnect: true };
    }
    if (body.image !== undefined) updateData.image = body.image;
    if (body.trackInventory !== undefined) updateData.trackInventory = body.trackInventory;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const bundle = await dbTransaction(async (tx) => {
      if (body.items) {
        await tx.productBundleItem.deleteMany({ where: { bundleId: id } });
        updateData.items = {
          create: body.items.map((item: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
            id: randomUUID(),
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            variationSize: item.variation?.size,
            variationColor: item.variation?.color,
            variationType: item.variation?.type,
          })),
        };
      }

      return tx.productBundle.update({
        where: { id },
        data: updateData,
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, price: true, stock: true } },
            },
          },
          category: { select: { id: true, name: true } },
        },
      });
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'bundle',
      entityId: bundle.id,
      changes: { before: oldData, after: bundle },
    });

    return NextResponse.json({ success: true, data: bundle });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = await getValidationTranslatorFromRequest(request);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: t('validation.bundleSkuExists', 'Bundle with this SKU already exists') },
        { status: 400 }
      );
    }
    logger.error('Error updating bundle:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'bundles.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const bundle = await prisma.productBundle.findFirst({ where: { id, tenantId } });
    if (!bundle) {
      return NextResponse.json({ success: false, error: t('validation.bundleNotFound', 'Bundle not found') }, { status: 404 });
    }

    // Soft delete - set isActive to false
    const updated = await prisma.productBundle.update({ where: { id }, data: { isActive: false } });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'bundle',
      entityId: updated.id,
      changes: { name: updated.name },
    });

    return NextResponse.json({ success: true, message: t('validation.bundleDeactivated', 'Bundle deactivated') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error deleting bundle:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
