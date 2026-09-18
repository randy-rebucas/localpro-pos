import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    // Require authentication to prevent unauthenticated tax-rule enumeration
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:tax-rules:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    const isActive = searchParams.get('isActive');

    const where: any = { tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (isActive !== null) {
      where.isActive = isActive === 'true';
    }

    const taxRules = await prisma.taxRule.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        categories: { select: { categoryId: true } },
        products: { select: { productId: true } },
      },
    });

    const data = taxRules.map(({ categories, products, ...rest }) => ({
      ...rest,
      categoryIds: categories.map(c => c.categoryId),
      productIds: products.map(p => p.productId),
      region: {
        country: rest.regionCountry,
        state: rest.regionState,
        city: rest.regionCity,
        zipCodes: rest.regionZipCodes,
      },
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const { name, rate, label, appliesTo, categoryIds, productIds, region, priority, isActive } = body;

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: t('validation.taxRuleNameRequired', 'Tax rule name is required') },
        { status: 400 }
      );
    }

    if (rate === undefined || rate === null || isNaN(rate) || rate < 0 || rate > 100) {
      return NextResponse.json(
        { success: false, error: t('validation.taxRateRequired', 'Tax rate must be between 0 and 100') },
        { status: 400 }
      );
    }

    const taxRuleId = randomUUID();
    const taxRule = await prisma.taxRule.create({
      data: {
        id: taxRuleId,
        tenantId,
        name: name.trim(),
        rate: parseFloat(rate),
        label: label?.trim() || 'Tax',
        appliesTo: appliesTo || 'all',
        regionCountry: region?.country,
        regionState: region?.state,
        regionCity: region?.city,
        regionZipCodes: region?.zipCodes || [],
        priority: priority || 0,
        isActive: isActive !== undefined ? isActive : true,
        categories: {
          create: ((categoryIds || []) as string[]).map((categoryId) => ({ categoryId })),
        },
        products: {
          create: ((productIds || []) as string[]).map((productId) => ({ productId })),
        },
      },
      include: {
        categories: { select: { categoryId: true } },
        products: { select: { productId: true } },
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'taxRule',
      entityId: taxRule.id,
      changes: { name, rate, label },
    });

    const { categories, products, ...rest } = taxRule;
    const data = {
      ...rest,
      categoryIds: categories.map(c => c.categoryId),
      productIds: products.map(p => p.productId),
      region: {
        country: rest.regionCountry,
        state: rest.regionState,
        city: rest.regionCity,
        zipCodes: rest.regionZipCodes,
      },
    };

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
