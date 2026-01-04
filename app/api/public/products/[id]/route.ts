import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';

/**
 * GET - Get public product details by ID
 * Query params: tenantSlug (optional)
 * No authentication required
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const tenantSlug = searchParams.get('tenantSlug');

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
    const query: Record<string, unknown> = { _id: id };
    
    if (tenantId) {
      query.tenantId = tenantId;
    }

    const product = await Product.findOne(query)
      .populate('categoryId', 'name description image')
      .select('-branchStock') // Exclude internal stock data
      .lean();

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    // Format response - only include public fields
    const publicProduct = {
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
      // Service-specific fields
      serviceType: product.serviceType,
      serviceDuration: product.serviceDuration,
      estimatedDuration: product.estimatedDuration,
      staffRequired: product.staffRequired,
      equipmentRequired: product.equipmentRequired,
      weightBased: product.weightBased,
      pickupDelivery: product.pickupDelivery,
      // Restaurant-specific fields
      modifiers: product.modifiers,
      allergens: product.allergens,
      nutritionInfo: product.nutritionInfo,
      // Other public fields
      allowOutOfStockSales: product.allowOutOfStockSales,
      pinned: product.pinned,
    };

    return NextResponse.json({ 
      success: true, 
      data: publicProduct 
    });
  } catch (error: unknown) {
    console.error('Error fetching public product:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch product' }, 
      { status: 500 }
    );
  }
}
