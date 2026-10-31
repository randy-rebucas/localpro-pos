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

// ── Sample data per business type ────────────────────────────────────────────

type BizType = 'retail' | 'general';

interface SeedConfig {
  categories: { name: string; description: string }[];
  products: Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  customers: { firstName: string; lastName: string; email?: string; phone?: string; tags?: string[] }[];
  discounts: {
    code: string; name: string; type: 'percentage' | 'fixed';
    value: number; minPurchaseAmount?: number; description?: string;
  }[];
}

const SAMPLE_DATA: Record<BizType, SeedConfig> = {
  retail: {
    categories: [
      { name: 'Electronics',   description: 'Gadgets, accessories, and electronics' },
      { name: 'Clothing',      description: 'Apparel and fashion items' },
      { name: 'Accessories',   description: 'Bags, watches, and fashion accessories' },
      { name: 'Home & Living', description: 'Household items and decor' },
      { name: 'Bundles',       description: 'Value bundle deals' },
    ],
    products: [
      { name: 'Wireless Earbuds Pro',     description: 'Noise-cancelling BT 5.0 earbuds, 30h battery',      price: 2999,  stock: 50,  sku: 'ELEC-001', category: 'Electronics',   productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'USB-C Fast Charger 65W',   description: '65W GaN charger, universal compatibility',           price: 899,   stock: 80,  sku: 'ELEC-002', category: 'Electronics',   productType: 'regular', trackInventory: true,  lowStockThreshold: 15 },
      { name: 'Slim Power Bank 20000mAh', description: '20000mAh, dual USB-A + USB-C output',               price: 1499,  stock: 40,  sku: 'ELEC-003', category: 'Electronics',   productType: 'regular', trackInventory: true,  lowStockThreshold: 8  },
      { name: 'Classic White Tee',        description: 'Premium cotton, unisex, S–XL',                      price: 399,   stock: 120, sku: 'CLO-001',  category: 'Clothing',      productType: 'regular', trackInventory: true,  lowStockThreshold: 20 },
      { name: 'Denim Jacket',             description: 'Classic cut, 100% cotton denim',                    price: 1899,  stock: 30,  sku: 'CLO-002',  category: 'Clothing',      productType: 'regular', trackInventory: true,  lowStockThreshold: 5  },
      { name: 'Canvas Tote Bag',          description: 'Heavy-duty canvas, eco-friendly',                   price: 549,   stock: 60,  sku: 'ACC-001',  category: 'Accessories',   productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'Minimalist Watch',         description: 'Stainless steel, leather strap, water-resistant',   price: 3499,  stock: 20,  sku: 'ACC-002',  category: 'Accessories',   productType: 'regular', trackInventory: true,  lowStockThreshold: 5  },
      { name: 'Scented Candle Set',       description: 'Set of 3 — lavender, vanilla, sandalwood',         price: 799,   stock: 45,  sku: 'HOME-001', category: 'Home & Living', productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'Ceramic Coffee Mug',       description: '350ml ceramic, dishwasher safe',                    price: 299,   stock: 100, sku: 'HOME-002', category: 'Home & Living', productType: 'regular', trackInventory: true,  lowStockThreshold: 20 },
      { name: 'Tech Starter Bundle',      description: 'Earbuds + USB-C charger combo deal',                price: 3699,  stock: 20,  sku: 'BUN-001',  category: 'Bundles',       productType: 'bundle',  trackInventory: false },
    ],
    customers: [
      { firstName: 'Maria',   lastName: 'Santos',    email: 'maria.s@example.com',   phone: '+63-917-000-0001', tags: ['VIP', 'Regular'] },
      { firstName: 'Juan',    lastName: 'dela Cruz',                                  phone: '+63-917-000-0002', tags: ['Regular'] },
      { firstName: 'Angela',  lastName: 'Reyes',     email: 'angela.r@example.com',  phone: '+63-917-000-0003', tags: ['Wholesale'] },
      { firstName: 'Ricardo', lastName: 'Lim',       email: 'ric.lim@example.com',   phone: '+63-917-000-0004', tags: ['VIP'] },
      { firstName: 'Sofia',   lastName: 'Tan',                                        phone: '+63-917-000-0005', tags: ['Regular'] },
    ],
    discounts: [
      { code: 'WELCOME10', name: 'Welcome 10% Off', type: 'percentage', value: 10, description: 'First-time customer discount' },
      { code: 'SAVE100',   name: 'Save ₱100',       type: 'fixed',      value: 100, minPurchaseAmount: 800, description: 'Min. ₱800 purchase' },
      { code: 'VIP20',     name: 'VIP 20% Off',     type: 'percentage', value: 20, description: 'Exclusive VIP member discount' },
    ],
  },

  general: {
    categories: [
      { name: 'Office Supplies', description: 'Stationery, consumables, and office essentials' },
      { name: 'Snacks & Drinks', description: 'Quick bites and beverages' },
      { name: 'Cleaning',        description: 'Cleaning products and supplies' },
      { name: 'Services',        description: 'Miscellaneous services offered' },
      { name: 'Combos',          description: 'Popular product combos' },
    ],
    products: [
      { name: 'Ballpen (Blue) — 12pcs',  description: 'Reliable medium-tip ballpen, blue ink, box of 12', price: 89,  stock: 200, sku: 'OFF-001', category: 'Office Supplies', productType: 'regular', trackInventory: true,  lowStockThreshold: 20 },
      { name: 'A4 Paper Ream 500 sheets', description: '80gsm A4 printing paper, 500 sheets',             price: 199, stock: 100, sku: 'OFF-002', category: 'Office Supplies', productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'Stapler (Standard)',        description: 'Desktop stapler with 1000pc staples included',   price: 149, stock: 50,  sku: 'OFF-003', category: 'Office Supplies', productType: 'regular', trackInventory: true,  lowStockThreshold: 5  },
      { name: 'Sticky Notes 3x3 (5pk)',   description: 'Yellow sticky notes, 100 sheets each',           price: 75,  stock: 150, sku: 'OFF-004', category: 'Office Supplies', productType: 'regular', trackInventory: true,  lowStockThreshold: 15 },
      { name: 'Bottled Water 500ml',       description: 'Purified drinking water',                        price: 20,  stock: 500, sku: 'DRK-001', category: 'Snacks & Drinks', productType: 'regular', trackInventory: true,  lowStockThreshold: 50 },
      { name: 'Instant Coffee Sachet',     description: '3-in-1 instant coffee, 20g sachet',              price: 15,  stock: 300, sku: 'DRK-002', category: 'Snacks & Drinks', productType: 'regular', trackInventory: true,  lowStockThreshold: 50 },
      { name: 'Mixed Nuts Snack Pack',     description: '30g mixed roasted nuts, single serving',         price: 45,  stock: 120, sku: 'SNK-001', category: 'Snacks & Drinks', productType: 'regular', trackInventory: true,  lowStockThreshold: 20 },
      { name: 'All-Purpose Cleaner 1L',    description: 'Disinfectant cleaner, citrus scent',             price: 115, stock: 80,  sku: 'CLN-001', category: 'Cleaning',        productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'Trash Bags (M) — 10pcs',   description: 'Medium garbage bags, black, tie-top closure',    price: 55,  stock: 120, sku: 'CLN-002', category: 'Cleaning',        productType: 'regular', trackInventory: true,  lowStockThreshold: 15 },
      { name: 'Lamination Service (A4)',   description: 'Hot lamination, A4 size, same-day',              price: 25,  stock: 999, sku: 'SVC-001', category: 'Services',        productType: 'service', trackInventory: false },
      { name: 'Photocopying (per page)',   description: 'Black & white photocopy, A4',                    price: 3,   stock: 999, sku: 'SVC-002', category: 'Services',        productType: 'service', trackInventory: false },
      { name: 'Office Starter Pack',       description: 'Ballpen box + ream + sticky notes + stapler',   price: 499, stock: 30,  sku: 'COM-001', category: 'Combos',          productType: 'bundle',  trackInventory: true,  lowStockThreshold: 5  },
    ],
    customers: [
      { firstName: 'Carlos',  lastName: 'Manalo',   email: 'carlos.m@example.com', phone: '+63-917-400-0001', tags: ['Regular'] },
      { firstName: 'Shiela',  lastName: 'Navarro',  email: 'shiela.n@example.com', phone: '+63-917-400-0002', tags: ['Regular'] },
      { firstName: 'Roberto', lastName: 'Castillo', phone: '+63-917-400-0003',                                 tags: ['Wholesale'] },
    ],
    discounts: [
      { code: 'BULK5',     name: 'Bulk Purchase 5%',       type: 'percentage', value: 5,  minPurchaseAmount: 500, description: 'On orders ₱500 and above' },
      { code: 'LOYALCARD', name: 'Loyalty Card Discount',  type: 'fixed',      value: 50, minPurchaseAmount: 300, description: 'For loyalty card holders' },
    ],
  },
};

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
    const bizType: BizType = (settings?.businessType ?? 'general') as BizType;
    const config = SAMPLE_DATA[bizType] ?? SAMPLE_DATA.general;

    // Count what already exists
    const existingCategories = await Category.countDocuments({ tenantId: tenant._id });
    const existingProducts   = await Product.countDocuments({ tenantId: tenant._id });
    const existingCustomers  = await Customer.countDocuments({ tenantId: tenant._id });
    const existingDiscounts  = await Discount.countDocuments({ tenantId: tenant._id });

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
    const bizType: BizType = (settings?.businessType ?? 'general') as BizType;
    const config = SAMPLE_DATA[bizType] ?? SAMPLE_DATA.general;

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
