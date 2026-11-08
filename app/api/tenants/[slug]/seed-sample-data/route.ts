import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import Category from '@/models/Category';
import Product from '@/models/Product';
import Customer from '@/models/Customer';
import Discount from '@/models/Discount';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { SAMPLE_DATA, sampleSetFor } from '@/lib/sample-data';

// ── Route ────────────────────────────────────────────────────────────────────

/** GET — preview what will be seeded (no writes) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const { slug } = await params;

    const tenant = await Tenant.findOne({ slug, isActive: true }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant._id.toString(), 'sample_data.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const settings = (tenant as any).settings; // eslint-disable-line @typescript-eslint/no-explicit-any
    // Only Retail and General sets exist; every other business type gets General.
    const bizType = sampleSetFor(settings?.businessType);
    const config = SAMPLE_DATA[bizType];

    // Count what already exists
    const tenantId = tenant._id;
    const [existingCategories, existingProducts, existingCustomers, existingDiscounts] = await Promise.all([
      Category.countDocuments({ tenantId }),
      Product.countDocuments({ tenantId }),
      Customer.countDocuments({ tenantId }),
      Discount.countDocuments({ tenantId }),
    ]);

    // Which sample records are not in the store yet, matched the same way POST skips them.
    const [catHits, prodHits, custHits, discHits] = await Promise.all([
      Category.distinct('name', { tenantId, name: { $in: config.categories.map((c) => c.name) } }),
      Product.distinct('name', { tenantId, name: { $in: config.products.map((p) => p.name) } }),
      config.customers.length
        ? Customer.find(
            { tenantId, $or: config.customers.map((c) => ({ firstName: c.firstName, lastName: c.lastName })) },
            { firstName: 1, lastName: 1 }
          ).lean()
        : Promise.resolve([]),
      Discount.distinct('code', { tenantId, code: { $in: config.discounts.map((d) => d.code.toUpperCase()) } }),
    ]);
    const custKeys = new Set((custHits as { firstName?: string; lastName?: string }[]).map((c) => `${c.firstName}|${c.lastName}`));
    const missing = {
      categories: config.categories.filter((c) => !catHits.includes(c.name)).length,
      products:   config.products.filter((p) => !prodHits.includes(p.name)).length,
      customers:  config.customers.filter((c) => !custKeys.has(`${c.firstName}|${c.lastName}`)).length,
      discounts:  config.discounts.filter((d) => !discHits.includes(d.code.toUpperCase())).length,
    };

    return NextResponse.json({
      success: true,
      data: {
        businessType: bizType,
        preview: {
          categories: config.categories.length,
          products:   config.products.length,
          customers:  config.customers.length,
          discounts:  config.discounts.length,
        },
        existing: {
          categories: existingCategories,
          products:   existingProducts,
          customers:  existingCustomers,
          discounts:  existingDiscounts,
        },
        missing,
        sample: {
          categories: config.categories.map(c => c.name),
          products:   config.products.map(p => ({ name: p.name, price: p.price, type: p.productType })),
          discounts:  config.discounts.map(d => ({ code: d.code, name: d.name, value: d.value, type: d.type })),
        },
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized' || error.message?.includes('Forbidden')) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return NextResponse.json({ success: false, error: 'Failed to load preview' }, { status: 500 });
  }
}

/** POST — install sample data */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const { allowed } = checkRateLimit(`write:seed-sample-data:${user.userId}:${getClientIp(request)}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }
    const { slug } = await params;

    const body = await request.json().catch(() => ({}));
    const skipExisting: boolean = body.skipExisting !== false; // default: true
    const itemTypes = ['categories', 'products', 'customers', 'discounts'] as const;
    const requestedItems: Set<string> = Array.isArray(body.items) && body.items.length > 0
      ? new Set(body.items.filter((i: unknown) => itemTypes.includes(i as typeof itemTypes[number])))
      : new Set(itemTypes);

    const tenant = await Tenant.findOne({ slug, isActive: true });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant._id.toString(), 'sample_data.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const tenantId = tenant._id;
    const settings = (tenant as any).settings; // eslint-disable-line @typescript-eslint/no-explicit-any
    // Only Retail and General sets exist; every other business type gets General.
    const bizType = sampleSetFor(settings?.businessType);
    const config = SAMPLE_DATA[bizType];

    const results = {
      categories: { created: 0, skipped: 0 },
      products:   { created: 0, skipped: 0 },
      customers:  { created: 0, skipped: 0 },
      discounts:  { created: 0, skipped: 0 },
    };

    // ── Categories ──────────────────────────────────────────────────────────
    // Always resolved (even if "categories" itself wasn't selected) since products
    // link to them by categoryId — only the creation is skipped when deselected.
    const categoryMap: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (requestedItems.has('categories') || requestedItems.has('products')) {
      for (const catDef of config.categories) {
        const existing = await Category.findOne({ tenantId, name: catDef.name });
        if (existing) {
          categoryMap[catDef.name] = existing._id;
          if (requestedItems.has('categories')) results.categories.skipped++;
        } else if (requestedItems.has('categories')) {
          const cat = await Category.create({ ...catDef, tenantId, isActive: true });
          categoryMap[catDef.name] = cat._id;
          results.categories.created++;
        }
      }
    }

    // ── Products ────────────────────────────────────────────────────────────
    if (requestedItems.has('products')) {
      for (const prodDef of config.products) {
        const { category: catName, ...rest } = prodDef;
        const existing = await Product.findOne({ tenantId, name: rest.name });
        if (existing && skipExisting) {
          results.products.skipped++;
          continue;
        }

        await Product.create({
          ...rest,
          tenantId,
          categoryId: categoryMap[catName],
          category:   catName,
        });
        results.products.created++;
      }
    }

    // ── Customers ───────────────────────────────────────────────────────────
    if (requestedItems.has('customers')) {
      for (const cust of config.customers) {
        const existing = await Customer.findOne({ tenantId, firstName: cust.firstName, lastName: cust.lastName });
        if (existing && skipExisting) {
          results.customers.skipped++;
          continue;
        }
        await Customer.create({ ...cust, tenantId, isActive: true });
        results.customers.created++;
      }
    }

    // ── Discounts ───────────────────────────────────────────────────────────
    if (requestedItems.has('discounts')) {
      const now     = new Date();
      const oneYear = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

      for (const discDef of config.discounts) {
        const existing = await Discount.findOne({ tenantId, code: discDef.code.toUpperCase() });
        if (existing && skipExisting) {
          results.discounts.skipped++;
          continue;
        }
        await Discount.create({
          ...discDef,
          tenantId,
          code:       discDef.code.toUpperCase(),
          usageCount: 0,
          isActive:   true,
          validFrom:  now,
          validUntil: oneYear,
        });
        results.discounts.created++;
      }
    }

    // ── Audit log ───────────────────────────────────────────────────────────
    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenantId.toString(),
      metadata: { action: 'seed_sample_data', businessType: bizType, results },
    });

    return NextResponse.json({ success: true, data: { businessType: bizType, results } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized' || error.message?.includes('Forbidden')) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    logger.error('Seed sample data error:', error);
    return NextResponse.json({ success: false, error: 'Failed to seed sample data' }, { status: 500 });
  }
}
