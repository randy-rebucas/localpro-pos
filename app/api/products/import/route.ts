import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { checkSubscriptionLimit, SubscriptionService } from '@/lib/subscription';
import {
  csvToProductRows,
  validateImportRows,
  collectTenantSkus,
  getProductImportTemplateCSV,
  MAX_PRODUCT_IMPORT_ROWS,
  type ProductImportRow,
} from '@/lib/product-import';
import { generateUniqueProductSKU } from '@/lib/products-helpers';
import { logger } from '@/lib/logger';

export async function GET() {
  const csv = getProductImportTemplateCSV();
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="product-import-template.csv"',
    },
  });
}

async function resolveCategoryId(
  tenantId: string,
  categoryName: string | undefined,
  categoryCache: Map<string, string>
): Promise<{ categoryId?: string; category?: string }> {
  if (!categoryName?.trim()) return {};

  const key = categoryName.trim().toLowerCase();
  const cached = categoryCache.get(key);
  if (cached) {
    return { categoryId: cached, category: categoryName.trim() };
  }

  let category = await Category.findOne({
    tenantId,
    name: { $regex: new RegExp(`^${categoryName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  });

  if (!category) {
    category = await Category.create({
      tenantId,
      name: categoryName.trim(),
      isActive: true,
    });
  }

  const id = category._id.toString();
  categoryCache.set(key, id);
  return { categoryId: id, category: category.name };
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
    } catch (authError: unknown) {
      const msg = (authError as Error).message ?? '';
      return NextResponse.json(
        { success: false, error: msg },
        { status: msg.includes('Unauthorized') ? 401 : 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`import:products:${tenantId}:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const csvText = typeof body.csv === 'string' ? body.csv : '';
    const confirm = body.confirm === true;

    if (!csvText.trim()) {
      return NextResponse.json({ success: false, error: 'CSV content is required' }, { status: 400 });
    }

    const { rows: csvRows, errors: parseErrors } = csvToProductRows(csvText);
    if (parseErrors.length > 0) {
      return NextResponse.json({ success: false, errors: parseErrors }, { status: 400 });
    }

    if (csvRows.length === 0) {
      return NextResponse.json({ success: false, error: 'No product rows found in CSV' }, { status: 400 });
    }

    if (csvRows.length > MAX_PRODUCT_IMPORT_ROWS) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_PRODUCT_IMPORT_ROWS} products per import` },
        { status: 400 }
      );
    }

    const existingProducts = await Product.find({ tenantId })
      .select('sku barcode variations.sku')
      .lean();

    const tenantSkus = collectTenantSkus(existingProducts);
    const existingBarcodes = new Set(
      existingProducts.filter((p) => p.barcode).map((p) => (p.barcode as string).toLowerCase())
    );

    const preview = validateImportRows(csvRows, { tenantSkus, existingBarcodes });
    const validRows = preview.filter((r) => r.status === 'valid' && r.data) as Array<{
      row: number;
      status: 'valid';
      data: ProductImportRow;
    }>;

    const summary = {
      total: preview.length,
      valid: validRows.length,
      errors: preview.length - validRows.length,
    };

    if (!confirm) {
      return NextResponse.json({ success: true, preview, summary });
    }

    if (validRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid rows to import', preview, summary },
        { status: 400 }
      );
    }

    const currentProductCount = await Product.countDocuments({ tenantId, isActive: true });
    try {
      await checkSubscriptionLimit(
        tenantId.toString(),
        'maxProducts',
        currentProductCount + validRows.length - 1
      );
    } catch (limitError: unknown) {
      return NextResponse.json(
        { success: false, error: (limitError as Error).message },
        { status: 403 }
      );
    }

    const categoryCache = new Map<string, string>();
    const created: Array<{ row: number; name: string; id: string }> = [];
    const failed: Array<{ row: number; name: string; error: string }> = [];

    for (const item of validRows) {
      try {
        const { categoryId, category } = await resolveCategoryId(
          tenantId,
          item.data.category,
          categoryCache
        );

        let sku = item.data.sku?.trim();
        if (!sku) {
          sku = generateUniqueProductSKU(item.data.name, tenantSkus);
          item.data.sku = sku;
        }

        const createProduct = () =>
          Product.create({
            tenantId,
            name: item.data.name,
            description: item.data.description,
            price: item.data.price,
            stock: item.data.stock,
            sku,
            barcode: item.data.barcode,
            category,
            categoryId,
            image: item.data.image,
            productType: item.data.productType,
            trackInventory: item.data.trackInventory,
            taxExempt: item.data.taxExempt,
            lowStockThreshold: item.data.lowStockThreshold,
            baseUnit: item.data.baseUnit || 'pc',
            saleUnits: item.data.saleUnits,
            hasVariations: false,
            isActive: true,
          });

        let product;
        try {
          product = await createProduct();
        } catch (err: unknown) {
          const dup = err as { code?: number; keyPattern?: Record<string, unknown> };
          if (dup.code === 11000 && !dup.keyPattern?.barcode) {
            sku = generateUniqueProductSKU(item.data.name, tenantSkus);
            item.data.sku = sku;
            product = await createProduct();
          } else {
            throw err;
          }
        }

        tenantSkus.add(sku.toLowerCase());

        created.push({ row: item.row, name: product.name, id: product._id.toString() });
      } catch (err: unknown) {
        const error = err as { code?: number; keyPattern?: Record<string, unknown>; message?: string };
        let message = error.message || 'Failed to create product';
        if (error.code === 11000) {
          if (error.keyPattern?.barcode) message = 'Barcode already exists';
          else message = 'SKU already exists';
        }
        failed.push({ row: item.row, name: item.data.name, error: message });
        logger.error('Product import row failed', { row: item.row, err });
      }
    }

    if (created.length > 0) {
      await createAuditLog(request, {
        tenantId,
        action: AuditActions.CREATE,
        entityType: 'product',
        entityId: 'bulk-import',
        changes: { imported: created.length, failed: failed.length },
      });

      try {
        await SubscriptionService.updateUsage(tenantId.toString(), {
          products: currentProductCount + created.length,
        });
      } catch (usageError) {
        logger.error('Failed to update subscription usage after import:', usageError);
      }
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      failed: failed.length,
      results: { created, failed },
      summary: {
        total: preview.length,
        valid: validRows.length,
        errors: preview.length - validRows.length,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to import products');
  }
}
