import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';

/**
 * GET - Get public products list
 * Query params: tenantSlug (optional), search, category, categoryId, productType, isActive
 * No authentication required
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const tenantSlug = searchParams.get('tenantSlug');
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const productType = searchParams.get('productType') || ''; // 'regular', 'service', 'bundle'
    const isActive = searchParams.get('isActive') !== 'false'; // Default to true

    let tenantId = null;

    // Get tenant ID if tenantSlug provided
    if (tenantSlug) {
      const tenant = await Tenant.findOne({ 
        slug: tenantSlug, 
        isActive: true 
      }).select('_id').lean();
      
      if (tenant) {
        tenantId = tenant._id;
      }
    }

    // Build query
    const query: Record<string, unknown> = {};
    
    // If tenantSlug provided, filter by tenant; otherwise show all
    if (tenantId) {
      query.tenantId = tenantId;
    }

    // Only show active products by default
    if (isActive) {
      // Note: Product model doesn't have isActive field, but we can filter by stock if needed
      // For now, we'll return all products for the tenant
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
      .select('-branchStock') // Exclude internal stock data
      .sort({ pinned: -1, createdAt: -1 })
      .lean();

    // Format response - only include public fields
    const publicProducts = products.map((product: { _id: unknown; name: string; description?: string; price: number; trackInventory?: boolean; stock?: number; sku?: string; category?: string; categoryId?: unknown; image?: string; productType: string; hasVariations?: boolean; variations?: Array<{ size?: string; color?: string; type?: string; price?: number }> }) => ({
      _id: product._id,
      name: product.name,
      description: product.description,
      price: product.price,
      stock: product.trackInventory ? product.stock : null, // Only show stock if tracking
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
      // Service-specific fields
      serviceType: product.serviceType,
      serviceDuration: product.serviceDuration,
      estimatedDuration: product.estimatedDuration,
      // Restaurant-specific fields
      modifiers: product.modifiers,
      allergens: product.allergens,
      nutritionInfo: product.nutritionInfo,
      // Other public fields
      allowOutOfStockSales: product.allowOutOfStockSales,
    }));

    return NextResponse.json({ 
      success: true, 
      data: publicProducts,
      count: publicProducts.length 
    });
  } catch (error: unknown) {
    console.error('Error fetching public products:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch products' }, 
      { status: 500 }
    );
  }
}
