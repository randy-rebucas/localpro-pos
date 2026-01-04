import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';

/**
 * GET - Get all products across all stores
 * Query params: search, category, categoryId, productType, storeSlug
 * No authentication required
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const productType = searchParams.get('productType') || '';
    const storeSlug = searchParams.get('storeSlug') || '';

    // Build query
    const query: Record<string, unknown> = {};

    // Store filter
    if (storeSlug) {
      const tenant = await Tenant.findOne({ 
        slug: storeSlug, 
        isActive: true 
      }).select('_id').lean();
      
      if (tenant) {
        query.tenantId = tenant._id;
      }
    }

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
      ];
    }

    // Category filter
    if (category) {
      query.category = category;
    }
    if (categoryId) {
      query.categoryId = categoryId;
    }

    // Product type filter
    if (productType) {
      query.productType = productType;
    }

    const products = await Product.find(query)
      .populate('categoryId', 'name')
      .populate('tenantId', 'name slug')
      .select('-branchStock')
      .sort({ pinned: -1, createdAt: -1 })
      .lean();

    // Get all tenants for store info
    const tenantIds = [...new Set(products.map((p: { tenantId?: { _id?: { toString: () => string } } }) => p.tenantId?._id?.toString()).filter(Boolean))];
    const tenants = await Tenant.find({ _id: { $in: tenantIds } })
      .select('name slug settings.companyName settings.logo')
      .lean();

    const tenantMap = new Map(tenants.map((t: { _id: { toString: () => string } }) => [t._id.toString(), t]));

    // Format response with store information
    const publicProducts = products.map((product: { _id: unknown; name: string; description?: string; price: number; trackInventory?: boolean; stock?: number; sku?: string; category?: string; categoryId?: unknown; image?: string; productType: string; hasVariations?: boolean; variations?: Array<{ size?: string; color?: string; type?: string; price?: number }>; tenantId?: { _id?: { toString: () => string } } }) => {
      const tenant = tenantMap.get(product.tenantId?._id?.toString() || '');
      return {
        _id: product._id,
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.trackInventory ? product.stock : null,
        sku: product.sku,
        category: product.category,
        categoryId: product.categoryId,
        image: product.image,
        productType: product.productType,
        hasVariations: product.hasVariations,
        variations: product.variations?.map((v: { size?: string; color?: string; type?: string; price?: number }) => ({
          size: v.size,
          color: v.color,
          type: v.type,
          price: v.price,
          stock: product.trackInventory ? v.stock : null,
        })),
        serviceType: product.serviceType,
        serviceDuration: product.serviceDuration,
        modifiers: product.modifiers,
        allergens: product.allergens,
        allowOutOfStockSales: product.allowOutOfStockSales,
        store: tenant ? {
          _id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
          companyName: tenant.settings?.companyName,
          logo: tenant.settings?.logo,
        } : null,
      };
    });

    return NextResponse.json({ 
      success: true, 
      data: publicProducts,
      count: publicProducts.length 
    });
  } catch (error: unknown) {
    console.error('Error fetching all products:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch products' }, 
      { status: 500 }
    );
  }
}
