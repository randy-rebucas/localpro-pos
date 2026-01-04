import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';

/**
 * GET - Get products for a specific store
 * Query params: search, category, categoryId, productType
 * No authentication required
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    const { slug } = await params;
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const productType = searchParams.get('productType') || '';

    // Get tenant by slug
    const tenant = await Tenant.findOne({ 
      slug,
      isActive: true 
    }).select('_id name').lean();

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 404 }
      );
    }

    // Build query
    const query: Record<string, unknown> = { tenantId: tenant._id,
    };

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
      .select('-branchStock')
      .sort({ pinned: -1, createdAt: -1 })
      .lean();

    // Format response
    const publicProducts = products.map((product: { _id: unknown; name: string; description?: string; price: number; trackInventory?: boolean; stock?: number; sku?: string; category?: string; categoryId?: unknown; image?: string; productType: string; hasVariations?: boolean; variations?: Array<{ size?: string; color?: string; type?: string; price?: number }> }) => ({
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
    }));

    return NextResponse.json({ 
      success: true, 
      data: publicProducts,
      count: publicProducts.length,
      store: {
        _id: tenant._id,
        name: tenant.name,
        slug,
      }
    });
  } catch (error: unknown) {
    console.error('Error fetching store products:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch products' }, 
      { status: 500 }
    );
  }
}
