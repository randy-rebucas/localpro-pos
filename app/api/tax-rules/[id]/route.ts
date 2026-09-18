import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';

function toResponseShape(taxRule: {
  categories: { categoryId: string }[];
  products: { productId: string }[];
  regionCountry: string | null;
  regionState: string | null;
  regionCity: string | null;
  regionZipCodes: string[];
  [key: string]: unknown;
}) {
  const { categories, products, ...rest } = taxRule;
  return {
    ...rest,
    categoryIds: categories.map((c) => c.categoryId),
    productIds: products.map((p) => p.productId),
    region: {
      country: rest.regionCountry,
      state: rest.regionState,
      city: rest.regionCity,
      zipCodes: rest.regionZipCodes,
    },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Require authentication to prevent unauthenticated tax-rule lookups
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const taxRule = await prisma.taxRule.findFirst({
      where: { id, tenantId },
      include: {
        categories: { select: { categoryId: true } },
        products: { select: { productId: true } },
      },
    });

    if (!taxRule) {
      return NextResponse.json({ success: false, error: 'Tax rule not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toResponseShape(taxRule) });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'tax_rules.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:tax-rules:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const existing = await prisma.taxRule.findFirst({ where: { id, tenantId } });

    if (!existing) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleNotFound', 'Tax rule not found') }, { status: 404 });
    }

    const body = await request.json();
    const oldData = { name: existing.name, rate: existing.rate, isActive: existing.isActive };

    const updateData: Prisma.TaxRuleUpdateInput = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.rate !== undefined) {
      if (isNaN(body.rate) || body.rate < 0 || body.rate > 100) {
        return NextResponse.json(
          { success: false, error: t('validation.taxRateRequired', 'Tax rate must be between 0 and 100') },
          { status: 400 }
        );
      }
      updateData.rate = parseFloat(body.rate);
    }
    if (body.label !== undefined) updateData.label = body.label.trim();
    if (body.appliesTo !== undefined) updateData.appliesTo = body.appliesTo;
    if (body.region !== undefined) {
      updateData.regionCountry = body.region?.country;
      updateData.regionState = body.region?.state;
      updateData.regionCity = body.region?.city;
      updateData.regionZipCodes = body.region?.zipCodes || [];
    }
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const taxRule = await prisma.$transaction(async (tx) => {
      if (body.categoryIds !== undefined) {
        await tx.taxRuleCategory.deleteMany({ where: { taxRuleId: id } });
        updateData.categories = {
          create: ((body.categoryIds || []) as string[]).map((categoryId) => ({ categoryId })),
        };
      }
      if (body.productIds !== undefined) {
        await tx.taxRuleProduct.deleteMany({ where: { taxRuleId: id } });
        updateData.products = {
          create: ((body.productIds || []) as string[]).map((productId) => ({ productId })),
        };
      }

      return tx.taxRule.update({
        where: { id },
        data: updateData,
        include: {
          categories: { select: { categoryId: true } },
          products: { select: { productId: true } },
        },
      });
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'taxRule',
      entityId: taxRule.id,
      changes: { old: oldData, new: { name: taxRule.name, rate: taxRule.rate, isActive: taxRule.isActive } },
    });

    return NextResponse.json({ success: true, data: toResponseShape(taxRule) });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'tax_rules.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:tax-rules:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const existing = await prisma.taxRule.findFirst({ where: { id, tenantId } });

    if (!existing) {
      return NextResponse.json({ success: false, error: t('validation.taxRuleNotFound', 'Tax rule not found') }, { status: 404 });
    }

    await prisma.taxRule.delete({ where: { id } });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'taxRule',
      entityId: id,
      changes: { name: existing.name },
    });

    return NextResponse.json({ success: true, message: 'Tax rule deleted' });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
